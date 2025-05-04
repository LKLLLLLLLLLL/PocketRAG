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

Session::Session(std::string repoName, std::filesystem::path repoPath, int sessionId) : repoName(repoName), repoPath(repoPath), sessionId(sessionId)
{
    // open a sqlite connection
    auto dbPath = repoPath / ".PocketRAG";
    sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);

    // open text search table
    textTable = std::make_shared<TextSearchTable>(*sqlite, "_text_search");

    // initialize sqliteDB
    initializeSqlite();

    // read embeddings config from embeddings table and initialize embedding models
    initializeEmbedding();
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
        "id INTEGER PRIMARY KEY, "
        "name TEXT NOT NULL UNIQUE, "
        "model_path TEXT NOT NULL, "
        "max_input_length INTEGER NOT NULL"
        ");"
    );

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

void Session::initializeEmbedding()
{
    auto dbPath = repoPath / ".PocketRAG";
    if(!vectorTables.empty())
    {
        vectorTables.clear(); // clear old vector tables
    }
    if(!embeddings.empty())
    {
        embeddings.clear(); // clear old embedding models
    }

    auto stmt = sqlite->getStatement("SELECT id, name, model_path, max_input_length FROM embeddings;");
    while (stmt.step())
    {
        int id = stmt.get<int>(0);
        std::string name = stmt.get<std::string>(1);
        std::string modelPath = stmt.get<std::string>(2);
        int maxInputLength = stmt.get<int>(3);

        // create embedding model
        auto embeddingModel = EmbeddingModel(modelPath, ONNXModel::device::cuda);
        int dimension = embeddingModel.getDimension();
        Embedding embedding{id, name, dimension, maxInputLength, dimension, std::make_shared<EmbeddingModel>(embeddingModel)};
        embeddings.push_back(std::move(embedding));

        // create vector table for this embedding model
        auto vectorTable = VectorTable(dbPath.string(), "_vector_" + name, *sqlite, dimension);
        vectorTables.push_back(std::move(vectorTable));
    }
}

void Session::checkDoc()
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
    for (const auto &filepath : files)
    {
        DocPipe docPipe(filepath, *sqlite, *textTable, vectorTables, embeddings);
        docPipe.check(); // check the file
        auto state = docPipe.getState(); // get the state of the document
        if (state == DocPipe::DocState::modified || state == DocPipe::DocState::created || state == DocPipe::DocState::deleted)
        {
            docqueue.push(std::move(docPipe)); // add to doc queue
        }
    }
}

void Session::refreshDoc(std::function<void(std::string, double)> callback)
{
    // process each document in the queue
    while(!docqueue.empty())
    {
        auto docPipe = std::move(docqueue.front()); // get the front document
        docqueue.pop(); // remove it from the queue

        auto path = docPipe.getPath(); // get the path of the document
        docPipe.process([&path, &callback](double progress){ // process the document
            if(callback)
            {
                callback(path, progress); // call the callback function with the current progress
            }
        });
    }

    // reconstruct each vector table
    for(auto& vectorTable : vectorTables)
    {
        vectorTable.reconstructFaissIndex();
        vectorTable.writeToDisk();
    }
}

auto Session::search(const std::string &query, int limit) -> std::vector<std::vector<searchResult>>
{
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
        auto queryVector = embedding.model->embed(query);
        // query the most similar vectors
        auto vectorResults = vectorTable.querySimlar(queryVector, vectorLimit);

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

void Session::addEmbedding(int id, const std::string &name, const std::string &modelPath, int maxInputLength)
{
    // check if the embedding already exists
    auto stmt = sqlite->getStatement("SELECT id FROM embeddings WHERE name = ? AND model_path = ? AND max_input_length = ?;");
    stmt.bind(1, name);
    stmt.bind(2, modelPath);
    stmt.bind(3, maxInputLength);
    if(stmt.step())
    {
        throw std::runtime_error("Embedding with this name already exists.");
    }

    // add embedding to sqlite
    auto insertStmt = sqlite->getStatement("INSERT INTO embeddings (id, name, model_path, max_input_length) VALUES (?, ?, ?, ?);");
    insertStmt.bind(1, id);
    insertStmt.bind(2, name);
    insertStmt.bind(3, modelPath);
    insertStmt.bind(4, maxInputLength);
    insertStmt.step();

    // re initialize embedding models and vector tables
    initializeEmbedding();
}