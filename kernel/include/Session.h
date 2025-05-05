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
This is not a thread-safe class, it should be used in a single thread, but it will fork treads when needed.
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
    std::filesystem::path dbPath;
    int sessionId;

    std::shared_ptr<SqliteConnection> sqlite;
    std::shared_ptr<TextSearchTable> textTable;
    std::vector<std::shared_ptr<VectorTable>> vectorTables;
    std::vector<std::shared_ptr<Embedding>> embeddings;

    // std::queue<DocPipe> docqueue; // doc queue for processing

    std::thread backgroundThread; // background thread for processing documents
    std::shared_mutex mutex;
    std::atomic<bool> stopThread = false; // flag to stop the background thread

    // callback functions for reporting progress and document state
    std::function<void(std::vector<std::string>)> docStateReporter;
    std::function<void(std::string, double)> progressReporter;

    constexpr static double alpha = 0.6; // alpha for L2 distance 

    // creat basic sqlite tables, should only be called in constructor
    void initializeSqlite();

    // read embeddings config from embeddings table and initialize embedding models
    void initializeEmbedding();

    // scan the repo path to find changed documents
    void checkDoc(std::queue<DocPipe>& docqueue);
    // actually execute updating task, need callback function to report progress
    void refreshDoc(std::queue<DocPipe> &docqueue);

    // background thread for processing documents
    void backgroundProcess();

public:
    Session(std::string repoName, std::filesystem::path repoPath, int sessionId, std::function<void(std::vector<std::string>)> docStateReporter = nullptr, std::function<void(std::string, double)> progressReporter = nullptr);
    ~Session();

    Session(const Session&) = delete; // disable copy constructor
    Session& operator=(const Session&) = delete; // disable copy assignment operator

    Session(Session&&) = delete; // disable move constructor
    Session& operator=(Session&&) = delete; // disable move assignment operator

    std::vector<std::vector<searchResult>>search(const std::string &query, int limit = 10);

    void addEmbedding(const std::string &name, const std::string &modelPath, int maxInputLength);

};