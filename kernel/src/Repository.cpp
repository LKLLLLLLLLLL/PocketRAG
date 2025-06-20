#include "Repository.h"

#include <filesystem>
#include <thread>
#include <vector>
#include <queue>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "DocPipe.h"
#include "Utils.h"

Repository::Repository(std::string repoName, std::filesystem::path repoPath, Utils::PriorityMutex &sqliteMutex,
                       int maxThreads, ONNXModel::device device, // ONNX performance config
                       std::function<void(std::exception_ptr)> errorCallback,
                       std::function<void(std::vector<std::string>)> docStateReporter,
                       std::function<void(std::string, double)> progressReporter,
                       std::function<void(std::string)> doneReporter)
    : repoName(repoName), repoPath(repoPath), docStateReporter(docStateReporter), progressReporter(progressReporter),
      doneReporter(doneReporter), sqliteMutex(sqliteMutex), device(device), maxThreads(maxThreads),
      errorCallback(errorCallback)
{
    // initialize sqliteDB
    initializeSqlite();

    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "text_search");

    startBackgroundProcess();
}

void Repository::initializeSqlite(bool needLock)
{
    dbPath = repoPath / ".PocketRAG" / "db";
    sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);
    std::shared_ptr<Utils::LockGuard> sqliteLockPtr;
    if(needLock)
    {
        sqliteLockPtr = std::make_shared<Utils::LockGuard>(sqliteMutex, true, true);
    }

    // create documents table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS documents("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "doc_path TEXT UNIQUE NOT NULL, " // relative path from repoPath
        "last_modified INTEGER, "       // file's last modified timestamp
        "file_size INTEGER, "       // file size
        "content_hash TEXT, "       // file content hash
        "last_checked INTEGER"      // last checked timestamp
        ");"
    );

    // create embedding config table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS embedding_config("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "config_name TEXT NOT NULL UNIQUE, "
        "model_name TEXT NOT NULL, "
        "model_path TEXT NOT NULL, "
        "input_length INTEGER NOT NULL, "
        "valid BOOLEAN DEFAULT 1" // for soft delete
        ");");

    // create chunks table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS chunks("
        "chunk_id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "doc_id INTEGER NOT NULL, "
        "embedding_id INTEGER NOT NULL, "
        "chunk_index INTEGER, "
        "content_hash TEXT NOT NULL, "
        "begin_line INTEGER, "
        "end_line INTEGER, "
        ""
        "UNIQUE(doc_id, embedding_id, chunk_index), " // constraints
        "FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE, "
        "FOREIGN KEY(embedding_id) REFERENCES embedding_config(id) ON DELETE CASCADE"
        ");"
    );

    // add index for chunks table
    sqlite->execute(
        "CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);"
    );
    sqlite->execute(
        "CREATE INDEX IF NOT EXISTS idx_chunks_embedding_id ON chunks(embedding_id);"
    );

    // add index for documents table
    sqlite->execute(
        "CREATE INDEX IF NOT EXISTS idx_documents_doc_path ON documents(doc_path);"
    );
}

void Repository::updateEmbeddings(const EmbeddingConfigList &configs, bool needLock)
{
    std::shared_ptr<Utils::LockGuard> sqliteLockPtr;
    std::shared_ptr<Utils::LockGuard> repoLockPtr;
    if(needLock)
    {
        sqliteLockPtr = std::make_shared<Utils::LockGuard>(sqliteMutex, true, true);
        repoLockPtr = std::make_shared<Utils::LockGuard>(repoMutex, true, true);
    }
    bool changed = false;
    auto trans = sqlite->beginTransaction(); // avoid unfinished changes be readed by other threads
    // get old embedding configs
    std::map<EmbeddingConfig, std::pair<int, EmbeddingConfig>> oldConfigs; // id and config
    auto stmt = sqlite->getStatement("SELECT id, config_name, model_name, model_path, input_length FROM embedding_config;");
    while (stmt.step())
    {
        EmbeddingConfig config;
        int id = stmt.get<int>(0);
        config.configName = stmt.get<std::string>(1);
        config.modelName = stmt.get<std::string>(2);
        config.modelPath = stmt.get<std::string>(3);
        config.inputLength = stmt.get<int>(4);
        oldConfigs[config] = {id, config};
    }
    // get deleted configs and add new configs
    for (auto &newconfig : configs)
    {
        auto it = oldConfigs.find(newconfig);
        if (it != oldConfigs.end())
        {
            // finded
            oldConfigs.erase(it);
            continue;
        }
        else
        {
            // add new config
            changed = true;
            auto insertStmt = sqlite->getStatement("INSERT INTO embedding_config (config_name, model_name, model_path, input_length) VALUES (?, ?, ?, ?);");
            insertStmt.bind(1, newconfig.configName);
            insertStmt.bind(2, newconfig.modelName);
            insertStmt.bind(3, newconfig.modelPath);
            insertStmt.bind(4, newconfig.inputLength);
            insertStmt.step();
        }
    }
    // set flag for deleted configs
    for (auto &oldconfig : oldConfigs)
    {
        changed = true;
        auto updateStmt = sqlite->getStatement("UPDATE embedding_config SET valid = 0 WHERE id = ?;");
        updateStmt.bind(1, oldconfig.second.first);
        updateStmt.step();
    }

    // create new vectors
    std::vector<std::shared_ptr<VectorTable>> tempVectorTables;
    std::vector<std::shared_ptr<Embedding>> tempEmbeddings;
    stmt = sqlite->getStatement("SELECT id, config_name, model_path, input_length FROM embedding_config WHERE valid = 1;");
    while (stmt.step())
    {
        int id = stmt.get<int>(0);
        std::string name = stmt.get<std::string>(1);
        std::string modelPath = stmt.get<std::string>(2);
        int inputLength = stmt.get<int>(3);

        // create embedding model
        auto embeddingModel = std::make_shared<EmbeddingModel>(modelPath, device, maxThreads);
        int dimension = embeddingModel->getDimension();
        auto embedding = std::make_shared<Embedding>(id, name, dimension, inputLength, embeddingModel);
        tempEmbeddings.push_back(embedding);

        // create vector table for this embedding model
        std::string tableName = "vector_" + std::to_string(id);
        auto vectorTable = std::make_shared<VectorTable>(dbPath.string(), tableName, *sqlite, dimension);
        tempVectorTables.push_back(vectorTable);
    }
    vectorTables = std::move(tempVectorTables);
    embeddings = std::move(tempEmbeddings);

    if (changed)
    {
        // flag all documents as unchecked
        sqlite->execute("UPDATE documents SET last_modified = NULL, last_checked = NULL;");
    }

    trans.commit();
}

Repository::~Repository()
{}

void Repository::backgroundProcess(std::function<bool()> retFlag)
{
    logger.info("[Repository.backgroundProcess] Repository " + repoName + "'s background process started.");
    jiebaTokenizer::get_jieba_ptr();
    while (!retFlag())
    {
        std::this_thread::sleep_for(std::chrono::seconds(1)); // sleep for 1 second
        Utils::LockGuard sqlitelock(sqliteMutex, false, true);      // lock for writing
        Utils::LockGuard repoLock(repoMutex, false, false); // lock for vector tables and embeddings

        sqlitelock.yield();
        repoLock.yield();
        if (sqlitelock.needRelease() || repoLock.needRelease() || retFlag())
        {
            continue;
        }

        for (auto &vectorTable : vectorTables)
        {
            vectorTable->write();
            if (vectorTable->getInvalidIds().size() > 0)
            {
                integrity = false;
            }
        }

        sqlitelock.yield();
        repoLock.yield();
        if (sqlitelock.needRelease() || repoLock.needRelease() || retFlag())
        {
            continue;
        }

        if (!integrity)
        {
            logger.warning("[Repository.backgroundProcess] Database integrity check failed, reconstructing...");
            reConstruct(false);
        }

        sqlitelock.yield();
        repoLock.yield();
        if (sqlitelock.needRelease() || repoLock.needRelease() || retFlag())
        {
            continue;
        }

        std::queue<DocPipe> docqueue; // create a new doc queue for each iteration
        checkDoc(docqueue); // check for changed documents
        // though refreshDoc will change vector tables and text table, but this changes will not affect to search result, so no need to use writelock(unique_lock)
        refreshDoc(docqueue, sqlitelock, repoLock, retFlag); // process the documents in the queue
        // logically, there is no other thread use these invalid embedding configs, only need to avoid changes in embedding_config table, so use shared_lock

        sqlitelock.yield();
        repoLock.yield();
        if (sqlitelock.needRelease() || repoLock.needRelease() || retFlag())
        {
            continue;
        }

        removeInvalidEmbedding();

        for (auto &vectorTable : vectorTables)
        {
            vectorTable->write();
        }
    }
    logger.info("[Repository.backgroundProcess] Repository " + repoName + "'s background process stopped.");
}

void Repository::startBackgroundProcess()
{
    if(backgroundThread && backgroundThread->isActive())
    {
        backgroundThread->start();;
        return;
    }
    auto errorHandler = [this](const std::exception &e) {
        restartCount++;
        if (restartCount > maxRestartCount)
        {
            logger.warning("[Repository.backgroundProcess] Background process crashed too many times, stop it.");
            if (errorCallback == nullptr)
            {
                logger.fatal("[Repository.backgroundProcess] No error callback set, call terminate.");
                throw e;
            }
            errorCallback(std::current_exception());
            backgroundThread->stop();
            return;
        }
        logger.warning("[Repository.backgroundProcess] Crashed with: " + std::string(e.what()) +
                       ", restart count: " + std::to_string(restartCount) + ", restarting...");
    }; 
    backgroundThread = std::make_shared<Utils::WorkerThread>(repoName + "-background", [this](std::function<bool()> retFlag, Utils::WorkerThread& _){
        backgroundProcess(retFlag); // no need to use condition_variable here, just run in a loop
    }, 
    errorHandler);
    backgroundThread->start();
}

void Repository::checkDoc(std::queue<DocPipe>& docqueue)
{
    // get all documents from disk
    std::vector<std::filesystem::path> files;
    for (const auto &entry : std::filesystem::recursive_directory_iterator(repoPath, std::filesystem::directory_options::skip_permission_denied))
    {
        bool hasHiddenDir = false;
        auto relPath = std::filesystem::relative(entry.path(), repoPath);

        for (const auto &component : relPath)
        {
            auto componentStr = component.string();
            if (!componentStr.empty() && componentStr[0] == '.')
            {
                hasHiddenDir = true;
                break;
            }
        }

        if (hasHiddenDir)
        {
            continue;
        }
        if (entry.is_regular_file())
        {
            files.push_back(relPath);
        }
    }

    // get all documents from sqlite
    auto stmt = sqlite->getStatement("SELECT doc_path FROM documents;");
    while (stmt.step())
    {
        auto docPath = stmt.get<std::string>(0);
        auto docFullPath = repoPath / docPath;
        bool found = false;
        for (auto it = files.begin(); it != files.end(); ++it) // avoid repeat add
        {
            if (*it == docPath)
            {
                found = true;
                break; // file found, no need to check other files
            }
        }
        if (!found)
        {
            files.push_back(docPath); // the file may be deleted, add it to the list
        }
    }

    // open docpipe for each file
    std::vector<std::string> changedDocs;
    for (const auto &filepath : files)
    {
        DocPipe docPipe(repoPath / filepath, filepath, *sqlite, *textTable, vectorTables, embeddings);
        docPipe.check(); // check the file
        auto state = docPipe.getState(); // get the state of the document
        if (state == DocPipe::DocState::modified || state == DocPipe::DocState::created || state == DocPipe::DocState::deleted)
        {
            docqueue.push(std::move(docPipe)); // add to doc queue
            changedDocs.push_back(filepath.string()); // add to changed documents
        }
    }
    if(docStateReporter && !changedDocs.empty())
        docStateReporter(changedDocs); // report changed documents
}

void Repository::refreshDoc(std::queue<DocPipe> &docqueue, Utils::LockGuard &sqliteLock, Utils::LockGuard& repoLock, std::function<bool()> retFlag)
{
    // process each document in the queue
    bool changed = !docqueue.empty(); // check if there are documents to process
    while(!docqueue.empty())
    {
        sqliteLock.yield();
        repoLock.yield();
        auto docPipe = std::move(docqueue.front()); // get the front document
        docqueue.pop(); // remove it from the queue

        auto path = docPipe.getRelPath(); // get the path of the document
        docPipe.process(
            [&path, this](double progress) { // process the document
                if (this->progressReporter)
                {
                    this->progressReporter(path, progress);
                }
            },
            [this, &sqliteLock, &repoLock, &retFlag]() -> bool {
                if (sqliteLock.needRelease() || repoLock.needRelease())
                {
                    return true;
                }
                sqliteLock.yield();
                repoLock.yield();
                return retFlag();
            }); // pass the stop flag to the process function

        if(retFlag())
        {
            return;
        }
        sqliteLock.yield();
        repoLock.yield();
        if (sqliteLock.needRelease() || repoLock.needRelease())
        {
            return;
        }

        if(doneReporter)
            doneReporter(path); // report the document is done
    }
}

void Repository::removeInvalidEmbedding()
{
    // the shared_lock is used by caller
    auto trans = sqlite->beginTransaction(); // avoid unfinished changes be readed by other threads
    std::vector<std::string> invalidVectorTables;
    {
        auto selectStmt = sqlite->getStatement("SELECT id FROM embedding_config WHERE valid = 0;");
        auto chunkStmt = sqlite->getStatement("SELECT chunk_id FROM chunks WHERE embedding_id = ?;");
        auto deleteChunksStmt = sqlite->getStatement("DELETE FROM chunks WHERE chunk_id = ?;");
        auto deleteEmbeddingStmt = sqlite->getStatement("DELETE FROM embedding_config WHERE id = ?;");
        while (selectStmt.step())
        {
            auto embeddingId = selectStmt.get<int>(0);

            // get invalid chunk ids
            chunkStmt.bind(1, embeddingId);
            std::vector<int64_t> chunkIds;
            while (chunkStmt.step())
            {
                chunkIds.push_back(chunkStmt.get<int64_t>(0)); 
            }
            chunkStmt.reset();

            // delete invalid chunks
            for (auto chunkId : chunkIds)
            {
                // delete from text table
                textTable->deleteChunk(chunkId); 
                // delete from chunks table
                deleteChunksStmt.bind(1, chunkId);
                deleteChunksStmt.step(); 
                deleteChunksStmt.reset();
            }

            // delete embedding_config 
            deleteEmbeddingStmt.bind(1, embeddingId);
            deleteEmbeddingStmt.step(); 
            deleteEmbeddingStmt.reset();

            invalidVectorTables.push_back("vector_" + std::to_string(embeddingId)); 
        }
    }
    // delete from vector tables
    for(const auto& tableName : invalidVectorTables)
    {
        VectorTable::dropTable(*sqlite, dbPath, tableName); // drop vector table
    }
    trans.commit();
}

auto Repository::search(const std::string &query, searchAccuracy acc, int limit) -> std::vector<SearchResult>
{
    Utils::LockGuard lock(sqliteMutex, true, false); // lock for reading embedding models and vector tables
    Utils::LockGuard repoLock(repoMutex, true, false); // lock for vector tables and embeddings

    int vectorLimit = limit * 2;
    int fts5Limit = limit * 2 * embeddings.size();

    std::vector<SearchResult> allResults; // for all results

    if(query.empty())
    {
        return allResults;
    }

    // search in text search table
    auto textResults = textTable->search(query, fts5Limit);
    std::unordered_map<int64_t, SearchResult> textSearchResultMap; // map to store results, chunkid -> Result
    for(const auto& textResult : textResults)
    {
        SearchResult res;
        res.chunkId = textResult.chunkId;
        res.score = textResult.similarity;
        res.highlightedContent = textResult.content;
        res.highlightedMetadata = textResult.metadata;
        textSearchResultMap[res.chunkId] = res; // store result in map
    }

    // search for each embedding
    for(int i = 0; i < embeddings.size(); i++)
    {
        auto& embedding = embeddings[i];
        auto& vectorTable = vectorTables[i];

        // get embedding for the query
        auto queryVector = embedding->model->embed(query);
        // query the most similar vectors
        auto vectorResults = vectorTable->search(queryVector, vectorLimit);
        // add to results
        for(int j = 0; j < vectorResults.first.size(); j++)
        {
            SearchResult res;
            res.chunkId = vectorResults.first[j];
            res.score = vectorResults.second[j];
            if (textSearchResultMap.find(res.chunkId) == textSearchResultMap.end()) // not found
            {
                res.score = combineScore(0.0, res.score);
                allResults.push_back(res);
            }
            else // found
            {
                res.highlightedContent = textSearchResultMap[res.chunkId].highlightedContent;
                res.highlightedMetadata = textSearchResultMap[res.chunkId].highlightedMetadata;
                res.score = combineScore(textSearchResultMap[res.chunkId].score, res.score);
                textSearchResultMap.erase(res.chunkId);
            }
        }
    }
    for(auto& textResult : textSearchResultMap)
    {
        SearchResult res;
        res.chunkId = textResult.first;
        res.score = combineScore(textResult.second.score, 0.0);
        res.highlightedContent = textResult.second.highlightedContent;
        allResults.push_back(res);
    }
    if(allResults.empty())
    {
        return allResults; // no results
    }

    // get content and metadata for each result
    std::vector<std::string> contents;
    for (auto &result : allResults)
    {
        auto [content, metadata] = textTable->getContent(result.chunkId);
        if (!content.empty() || !metadata.empty())
        {
            result.content = content;
            result.metadata = metadata;
            result.highlightedContent = content;
            result.highlightedMetadata = metadata;
            contents.push_back(Utils::chunkTosequence(content, metadata));
        }
        else
        {
            throw Error{"Chunk not found in text_search table, chunk_id: " + std::to_string(result.chunkId),
                        Error::Type::Database};
        }
    }

    // remove duplicates
    std::vector<SearchResult> uniqueResults;
    for (const auto &result : allResults)
    {
        bool found = false;
        for (auto &uniqueResult : uniqueResults)
        {
            bool isSubstr = (uniqueResult.content.find(result.content) != std::string::npos);
            if (isSubstr) // found string include current result
            {
                found = true;
                break;
            }
            bool isSuperstr = (result.content.find(uniqueResult.content) != std::string::npos);
            if (isSuperstr) // found current result include string in unique result
            {
                uniqueResult = result; // replace it
                found = true;
                break;
            }
        }
        if (!found) // not found
        {
            uniqueResults.push_back(result);
        }
    }

    // rerank
    if(acc == searchAccuracy::high && rerankerModel)
    {
        auto scores = rerankerModel->rank(query, contents);
        for(int i = 0; i < uniqueResults.size(); i++)
        {
            uniqueResults[i].score = scores[i];
        }
    }

    // sort results by score and limit to top N
    std::sort(uniqueResults.begin(), uniqueResults.end(), [](const SearchResult &a, const SearchResult &b) {
        return a.score > b.score;
    });
    if (uniqueResults.size() > limit)
    {
        uniqueResults.resize(limit);
    }

    // get filepath from database
    auto stmt = sqlite->getStatement("SELECT doc_path FROM documents WHERE id = (SELECT doc_id FROM chunks WHERE chunk_id = ?);");
    for (auto &result : uniqueResults)
    {
        stmt.bind(1, result.chunkId);
        if (stmt.step())
        {
            result.filePath = stmt.get<std::string>(0);
        }
        else
        {
            throw Error{"Chunk not found in documents table, chunk_id: " + std::to_string(result.chunkId), Error::Type::Database};

        }
        stmt.reset();
    }

    // get begin and end line from database
    auto lineStmt = sqlite->getStatement("SELECT begin_line, end_line FROM chunks WHERE chunk_id = ?;");
    for (auto &result : uniqueResults)
    {
        lineStmt.bind(1, result.chunkId);
        if (lineStmt.step())
        {
            result.beginLine = lineStmt.get<int>(0);
            result.endLine = lineStmt.get<int>(1);
        }
        else
        {
            throw Error{"Chunk not found in chunks table, chunk_id: " + std::to_string(result.chunkId), Error::Type::Database};
        }
        lineStmt.reset();
    }

    // mark keywords again
    for(auto &result : uniqueResults)
    {
        result.highlightedContent = TextSearchTable::reHighlight(result.highlightedContent, query);
        result.highlightedMetadata = TextSearchTable::reHighlight(result.highlightedMetadata, query);
    }

    return uniqueResults;
}

void Repository::configEmbedding(const EmbeddingConfigList &configs)
{
    // stop the background thread
    logger.debug("[Repository.configEmbedding] begin to config embedding");

    updateEmbeddings(configs); 
    logger.debug("[Repository.configEmbedding] embedding config done");
}

void Repository::configReranker(const std::filesystem::path &modelPath)
{
    logger.debug("[Repository.configReranker] begin to config reranker model");
    Utils::LockGuard lock(repoMutex, true, true);
    if(!modelPath.empty())
        rerankerModel = std::make_shared<RerankerModel>(modelPath, device, maxThreads);
    logger.debug("[Repository.configReranker] reranker model config done");
}

void Repository::reConstruct(bool needLock)
{
    vectorTables.clear();
    textTable.reset();

    auto trans = sqlite->beginTransaction();

    // drop sql tables
    sqlite->execute("DROP TABLE IF EXISTS documents;");
    sqlite->execute("DROP TABLE IF EXISTS chunks;"); 

    // drop text_search table
    TextSearchTable::dropTable(*sqlite, "text_search");

    // drop vector_ tables and text_search tables
    auto stmt = sqlite->getStatement("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vector_%';");
    std::vector<std::string> vectorTableNames;
    while (stmt.step())
    {
        auto tableName = stmt.get<std::string>(0);
        vectorTableNames.push_back(tableName);
    }
    for(const auto& tableName : vectorTableNames)
    {
        VectorTable::dropTable(*sqlite, dbPath, tableName);
    }
    // remain embedding configs table
    trans.commit();
    integrity = true;

    initializeSqlite(needLock);
    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "text_search");
    updateEmbeddings({}, needLock);
}
