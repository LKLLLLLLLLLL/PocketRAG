# pragma once
#include <iostream>
#include <filesystem>
#include <string>
#include <memory>
#include <vector>
#include <queue>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "DocPipe.h"

/*
This class handles a session to a window, aka. a repository.
*/
class Session
{
public:
    struct searchResult
    {
        int64_t chunkId;
        double score; 
        std::string content;
        std::string metadata;
    };

    using Embedding = DocPipe::Embedding; 

private:
    std::string repoName;
    std::filesystem::path repoPath;
    int sessionId;

    std::shared_ptr<SqliteConnection> sqlite;
    std::shared_ptr<TextSearchTable> textTable;
    std::vector<VectorTable> vectorTables;
    std::vector<Embedding> embeddings;

    std::queue<DocPipe> docqueue; // doc queue for processing

    constexpr static double alpha = 0.6; // alpha for L2 distance 

    // creat basic sqlite tables
    void initializeSqlite();

    // read embeddings config from embeddings table and initialize embedding models
    void initializeEmbedding();

public:
    Session(std::string repoName, std::filesystem::path repoPath, int sessionId);
    ~Session() = default;

    Session(const Session&) = delete; // disable copy constructor
    Session& operator=(const Session&) = delete; // disable copy assignment operator

    // scan the repo path to find changed documents 
    void checkDoc();
    // actually execute updating task, need callback function to report progress
    void refreshDoc(std::function<void(std::string, double)> callback);

    std::vector<std::vector<searchResult>> search(const std::string &query, int limit = 10);

    void addEmbedding(int id, const std::string &name, const std::string &modelPath, int maxInputLength);

};