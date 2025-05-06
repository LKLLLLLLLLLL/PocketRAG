#include "Session.h"

#include <iostream>
#include <filesystem>
#include <vector>
#include <queue>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "DocPipe.h"

Session::Session(std::string repoName, std::filesystem::path repoPath, int sessionId, std::function<void(std::vector<std::string>)> docStateReporter, std::function<void(std::string, double)> progressReporter) : repoName(repoName), repoPath(repoPath), sessionId(sessionId), docStateReporter(docStateReporter), progressReporter(progressReporter)
{
    // open a sqlite connection
    dbPath = repoPath / ".PocketRAG" / "db";
    sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);

    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "text_search");

    // initialize sqliteDB
    initializeSqlite();

    // read embeddings config from embeddings table and initialize embedding models
    initializeEmbedding();

    // begin background thread for processing documents
    backgroundThread = std::thread(&Session::backgroundProcess, this);
}

void Session::initializeSqlite()
{
    // create documents table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS documents ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "doc_name TEXT NOT NULL UNIQUE, "
        "last_modified INTEGER, "       // file's last modified timestamp
        "file_size INTEGER, "       // file size
        "content_hash TEXT, "       // file content hash
        "last_checked INTEGER"      // last checked timestamp
        ");"
    );

    // create embeddings table
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS embeddings ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL UNIQUE, "
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
        "FOREIGN KEY(embedding_id) REFERENCES embeddings(id) ON DELETE CASCADE"
        ");"
    );
}

Session::~Session()
{
    stopThread = true; // stop the background thread
    if (backgroundThread.joinable())
    {
        backgroundThread.join(); // wait for the background thread to finish
    }
}

void Session::initializeEmbedding()
{
    if(!vectorTables.empty())
    {
        vectorTables.clear(); // clear old vector tables
    }
    if(!embeddings.empty())
    {
        embeddings.clear(); // clear old embedding models
    }

    auto stmt = sqlite->getStatement("SELECT id, name, model_path, max_input_length FROM embeddings WHERE valid = 1;");
    while (stmt.step())
    {
        int id = stmt.get<int>(0);
        std::string name = stmt.get<std::string>(1);
        std::string modelPath = stmt.get<std::string>(2);
        int maxInputLength = stmt.get<int>(3);

        // create embedding model
        auto embeddingModel = EmbeddingModel(modelPath, ONNXModel::device::cuda);
        int dimension = embeddingModel.getDimension();
        auto embedding = std::make_shared<Embedding>(id, name, dimension, maxInputLength, dimension, std::make_shared<EmbeddingModel>(embeddingModel));
        embeddings.push_back(embedding);

        // create vector table for this embedding model
        std::string tableName = "vector_" + std::to_string(id);
        auto vectorTable = std::make_shared<VectorTable>(dbPath.string(), tableName, *sqlite, dimension);
        vectorTables.push_back(std::move(vectorTable));
    }
}

void Session::backgroundProcess()
{
    while (!stopThread)
    {
        std::this_thread::sleep_for(std::chrono::seconds(1)); // sleep for 1 second
        std::queue<DocPipe> docqueue; // create a new doc queue for each iteration

        std::shared_lock readlock(mutex); // lock for reading
        checkDoc(docqueue); // check for changed documents

        // though refreshDoc will change vector tables and text table, but this changes will not addect to search result, so no need to use writelock
        refreshDoc(docqueue); // process the documents in the queue
    }
}

void Session::checkDoc(std::queue<DocPipe>& docqueue)
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

void Session::refreshDoc(std::queue<DocPipe> &docqueue)
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
    }
}

auto Session::search(const std::string &query, int limit) -> std::vector<std::vector<searchResult>>
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

void Session::addEmbedding(const std::string &name, const std::string &modelPath, int maxInputLength)
{
    std::unique_lock writelock(mutex);

    // check if the embedding already exists
    auto stmt = sqlite->getStatement("SELECT id FROM embeddings WHERE name = ? AND valid = 1;");
    stmt.bind(1, name);
    if(stmt.step())
    {
        throw std::runtime_error("Embedding with this name already exists.");
    }

    // add embedding to sqlite
    auto insertStmt = sqlite->getStatement("INSERT INTO embeddings (name, model_path, max_input_length) VALUES (?, ?, ?);");
    insertStmt.bind(1, name);
    insertStmt.bind(2, modelPath);
    insertStmt.bind(3, maxInputLength);
    insertStmt.step();

    // re initialize embedding models and vector tables
    initializeEmbedding();
}