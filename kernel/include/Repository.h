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
#include "LLMConv.h"

/*
This class handles a repository.
This is not a thread-safe class, it should be used in a single thread, but it will fork treads when needed.
*/
class Repository
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

    struct EmbeddingConfig
    {
        std::string configName;
        std::string modelName;
        std::string modelPath;
        int maxInputLength;

        bool operator<(const EmbeddingConfig &other) const
        {
            if (configName != other.configName)
                return configName < other.configName;
            if (modelName != other.modelName)
                return modelName < other.modelName;
            if (modelPath != other.modelPath)
                return modelPath < other.modelPath;
            return maxInputLength < other.maxInputLength;
        }
    };

    using EmbeddingConfigList = std::vector<EmbeddingConfig>;

private:
    std::string repoName;
    std::filesystem::path repoPath;
    std::filesystem::path dbPath;

    std::shared_ptr<SqliteConnection> sqlite;
    std::shared_ptr<TextSearchTable> textTable;
    std::vector<std::shared_ptr<VectorTable>> vectorTables;
    std::vector<std::shared_ptr<Embedding>> embeddings;

    std::thread backgroundThread; // background thread for processing documents
    std::shared_mutex mutex;
    std::atomic<bool> stopThread = false; // flag to stop the background thread

    // callback functions for reporting progress and document state
    std::function<void(std::vector<std::string>)> docStateReporter;
    std::function<void(std::string, double)> progressReporter;

    constexpr static double alpha = 0.6; // ratio for L2 distance, when ranking the results

    // creat basic sqlite tables, should only be called in constructor
    // no mutex lock.
    void initializeSqlite();

    // update embeddings in both sqlite and class members
    // no mutex lock.
    void updateEmbeddings(const EmbeddingConfigList &configs = {});

    // scan the repo path to find changed documents, no mutex lock.
    void checkDoc(std::queue<DocPipe>& docqueue);
    // actually execute updating task, need callback function to report progress, no mutex lock.
    void refreshDoc(std::queue<DocPipe> &docqueue);
    // remove invalid embedding_config and their chunks, no mutex lock.
    void removeInvalidEmbedding();

    // background thread for processing documents
    void backgroundProcess();

    void stopBackgroundProcess();
    void startBackgroundProcess();

public:
    Repository(std::string repoName, std::filesystem::path repoPath, std::function<void(std::vector<std::string>)> docStateReporter = nullptr, std::function<void(std::string, double)> progressReporter = nullptr);
    ~Repository();

    Repository(const Repository&) = delete; // disable copy constructor
    Repository& operator=(const Repository&) = delete; // disable copy assignment operator

    Repository(Repository&&) = delete; // disable move constructor
    Repository& operator=(Repository&&) = delete; // disable move assignment operator

    std::vector<std::vector<searchResult>>search(const std::string &query, int limit = 10);

    // config embedding settings, if arg is empty, will read from sqlite table
    void configEmbedding(const EmbeddingConfigList &configs);

    // to fix internal error, drop all tables and reconstruct
    void reConstruct();
};
