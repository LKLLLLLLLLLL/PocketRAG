#include "Repository.h"

#include <iostream>
#include <filesystem>
#include <vector>
#include <queue>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "DocPipe.h"

Repository::Repository(std::string repoName, std::filesystem::path repoPath, std::function<void(std::vector<std::string>)> docStateReporter, std::function<void(std::string, double)> progressReporter, std::function<void(std::string)> doneReporter) : repoName(repoName), repoPath(repoPath), docStateReporter(docStateReporter), progressReporter(progressReporter), doneReporter(doneReporter)
{
    // initialize sqliteDB
    initializeSqlite();

    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "text_search");

    // read embeddings config from embeddings table and initialize embedding models
    updateEmbeddings();

    startBackgroundProcess();
}

void Repository::initializeSqlite()
{
    dbPath = repoPath / ".PocketRAG" / "db";
    sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);

    // create documents table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS documents ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "doc_name TEXT UNIQUE NOT NULL, "
        "last_modified INTEGER, "       // file's last modified timestamp
        "file_size INTEGER, "       // file size
        "content_hash TEXT, "       // file content hash
        "last_checked INTEGER"      // last checked timestamp
        ");"
    );

    // create embedding config table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS embedding_config ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "config_name TEXT NOT NULL UNIQUE, "
        "model_name TEXT NOT NULL, "
        "model_path TEXT NOT NULL, "
        "max_input_length INTEGER NOT NULL, "
        "valid BOOLEAN DEFAULT 1" // for soft delete
        ");");

    // create chunks table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS chunks ("
        "chunk_id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "doc_id INTEGER NOT NULL, "
        "embedding_id INTEGER NOT NULL, "
        "chunk_index INTEGER, "
        "content_hash TEXT NOT NULL, "
        ""
        "UNIQUE(doc_id, embedding_id, chunk_index), " // constraints
        "FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE, "
        "FOREIGN KEY(embedding_id) REFERENCES embedding_config(id) ON DELETE CASCADE"
        ");"
    );
}

void Repository::updateEmbeddings(const EmbeddingConfigList &configs)
{
    auto trans = sqlite->beginTransaction(); // avoid unfinished changes be readed by other threads
    if (!configs.empty())
    {
        // get old embedding configs
        std::map<EmbeddingConfig, std::pair<int, EmbeddingConfig>> oldConfigs; // id and config
        auto stmt = sqlite->getStatement("SELECT id, config_name, model_name, model_path, max_input_length FROM embedding_config;");
        while (stmt.step())
        {
            EmbeddingConfig config;
            int id = stmt.get<int>(0);
            config.configName = stmt.get<std::string>(1);
            config.modelName = stmt.get<std::string>(2);
            config.modelPath = stmt.get<std::string>(3);
            config.maxInputLength = stmt.get<int>(4);
            oldConfigs[config] = {id, config};
        }
        // get deleted configs
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
                auto insertStmt = sqlite->getStatement("INSERT INTO embedding_config (config_name, model_name, model_path, max_input_length) VALUES (?, ?, ?, ?);");
                insertStmt.bind(1, newconfig.configName);
                insertStmt.bind(2, newconfig.modelName);
                insertStmt.bind(3, newconfig.modelPath);
                insertStmt.bind(4, newconfig.maxInputLength);
                insertStmt.step();
            }
        }
        // set flag for deleted configs
        for (auto &oldconfig : oldConfigs)
        {
            auto updateStmt = sqlite->getStatement("UPDATE embedding_config SET valid = 0 WHERE id = ?;");
            updateStmt.bind(1, oldconfig.second.first);
            updateStmt.step();
        }
    }

    // create new vectors
    std::vector<std::shared_ptr<VectorTable>> tempVectorTables;
    std::vector<std::shared_ptr<Embedding>> tempEmbeddings;
    auto stmt = sqlite->getStatement("SELECT id, config_name, model_path, max_input_length FROM embedding_config WHERE valid = 1;");
    while (stmt.step())
    {
        int id = stmt.get<int>(0);
        std::string name = stmt.get<std::string>(1);
        std::string modelPath = stmt.get<std::string>(2);
        int maxInputLength = stmt.get<int>(3);

        // create embedding model
        auto embeddingModel = EmbeddingModel(modelPath, ONNXModel::device::cpu);
        int dimension = embeddingModel.getDimension();
        auto embedding = std::make_shared<Embedding>(id, name, dimension, maxInputLength, std::make_shared<EmbeddingModel>(embeddingModel));
        tempEmbeddings.push_back(embedding);

        // create vector table for this embedding model
        std::string tableName = "vector_" + std::to_string(id);
        auto vectorTable = std::make_shared<VectorTable>(dbPath.string(), tableName, *sqlite, dimension);
        tempVectorTables.push_back(std::move(vectorTable));
    }
    vectorTables = std::move(tempVectorTables);
    embeddings = std::move(tempEmbeddings);
    trans.commit();
}

Repository::~Repository()
{
    stopBackgroundProcess();
}

void Repository::backgroundProcess()
{
    while (!stopThread)
    {
        std::this_thread::sleep_for(std::chrono::seconds(1)); // sleep for 1 second
        std::queue<DocPipe> docqueue; // create a new doc queue for each iteration

        std::shared_lock readlock(mutex); // lock for reading
        checkDoc(docqueue); // check for changed documents

        // though refreshDoc will change vector tables and text table, but this changes will not affect to search result, so no need to use writelock(unique_lock)
        refreshDoc(docqueue); // process the documents in the queue

        // logically, there is no other thread use these invalid embedding configs, only need to avoid changes in embedding_config table, so use shared_lock
        removeInvalidEmbedding();

        for (auto &vectorTable : vectorTables)
        {
            vectorTable->write();
            if(vectorTable->getInvalidIds().size() > 0)
            {
                reConstruct(); // internal error, reconstruct
            }
        }
    }
}

void Repository::stopBackgroundProcess()
{
    stopThread = true; 
    if (backgroundThread.joinable())
    {
        backgroundThread.join(); // wait for the thread to finish
    }
}
void Repository::startBackgroundProcess()
{
    if(backgroundThread.joinable())
    {
        return;
    }
    stopThread = false;
    backgroundThread = std::thread(&Repository::backgroundProcess, this); 
}

void Repository::checkDoc(std::queue<DocPipe>& docqueue)
{
    // get all documents from disk
    std::vector<std::filesystem::path> files;
    for (const auto &entry : std::filesystem::directory_iterator(repoPath))
    {
        auto filename = entry.path().filename().string();
        if (filename.empty() || filename[0] == '.')
        {
            continue; // skip hidden files
        }
        if (entry.is_regular_file()) // only register files
        {
            files.push_back(entry.path());
        }
    }

    // get all documents from sqlite
    auto stmt = sqlite->getStatement("SELECT doc_name FROM documents;");
    while (stmt.step())
    {
        auto docName = stmt.get<std::string>(0);
        auto docPath = repoPath / docName;
        bool found = false;
        for (auto it = files.begin(); it != files.end(); ++it) // avoid repeat add
        {
            if (it->filename() == docName)
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
        DocPipe docPipe(filepath, *sqlite, *textTable, vectorTables, embeddings);
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

void Repository::refreshDoc(std::queue<DocPipe> &docqueue)
{
    // process each document in the queue
    bool changed = !docqueue.empty(); // check if there are documents to process
    while(!docqueue.empty())
    {
        auto docPipe = std::move(docqueue.front()); // get the front document
        docqueue.pop(); // remove it from the queue

        auto path = docPipe.getPath(); // get the path of the document
        docPipe.process([&path, this](double progress) { // process the document
            if (this->progressReporter)
            {
                this->progressReporter(path, progress);
            }
        }, 
        stopThread); // pass the stop flag to the process function

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

auto Repository::search(const std::string &query, int limit) -> std::vector<std::vector<searchResult>>
{
    std::shared_lock readlock(mutex); // lock for reading embedding models and vector tables
    
    int vectorLimit = limit * 3;
    int fts5Limit = limit * 10;

    struct Result
    {
        int64_t chunkId;
        double score;
    };

    std::vector<std::vector<searchResult>> allResults;

    // search in text search table
    auto textResults = textTable->search(query, fts5Limit);
    std::unordered_map<int64_t, Result> resultMap; // map to store results, chunkid -> Result
    for(const auto& textResult : textResults)
    {
        Result res;
        res.chunkId = textResult.chunkId;
        res.score = textResult.similarity;
        resultMap[res.chunkId] = res; // store result in map
    }

    // search for each embedding
    for(int i = 0; i < embeddings.size(); i++)
    {
        auto& embedding = embeddings[i];
        auto& vectorTable = vectorTables[i];

        // 1. get results from vector table
        // get embedding for the query
        auto queryVector = embedding->model->embed(query);
        // query the most similar vectors
        auto vectorResults = vectorTable->search(queryVector, vectorLimit);

        // 2. merge results and sort by new score
        std::vector<Result> mergeResults;
        for(int j = 0; j < vectorResults.first.size(); j++)
        {
            Result res;
            res.chunkId = vectorResults.first[j];
            res.score = vectorResults.second[j];
            if(resultMap.find(res.chunkId) != resultMap.end())
            {
                res.score = alpha * (1.0 - res.score) + (1.0 - alpha) * resultMap[res.chunkId].score; // average score
            }
            else
            {
                res.score = alpha * res.score; 
            }

            mergeResults.push_back(res); // add to merge results
        }
        std::sort(mergeResults.begin(), mergeResults.end(), [](const Result& a, const Result& b) { return a.score > b.score; });

        // 3. get top results and read content and metadata from sqlite
        std::vector<searchResult> result;
        for(int j = 0; j < limit && j < mergeResults.size(); j++)
        {
            auto& res = mergeResults[j];
            auto contentMeta = textTable->getContent(res.chunkId);
            searchResult sr;
            sr.chunkId = res.chunkId;
            sr.score = res.score;
            sr.content = contentMeta.first;
            sr.metadata = contentMeta.second;
            result.push_back(sr); // add to result
        }
        allResults.push_back(result); // add to all results
    }
    return allResults;
}

void Repository::configEmbedding(const EmbeddingConfigList &configs)
{
    // stop the background thread
    stopBackgroundProcess();

    std::unique_lock writelock(mutex);
    updateEmbeddings(configs); 

    // resume the background thread
    startBackgroundProcess();
}

void Repository::reConstruct()
{
    stopBackgroundProcess();
    std::unique_lock writelock(mutex); // lock for writing

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

    initializeSqlite();
    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "text_search");
    updateEmbeddings();
    startBackgroundProcess();
}
