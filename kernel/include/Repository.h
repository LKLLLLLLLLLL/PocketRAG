# pragma once
#include <exception>
#include <filesystem>
#include <string>
#include <memory>
#include <vector>
#include <queue>

#include "SqliteConnection.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "DocPipe.h"
#include "Utils.h"

/*
This class handles a repository.
This is a thread-safe class, and it will fork treads when needed.
*/
class Repository
{
public:
    struct SearchResult
    {
        int64_t chunkId;
        double score; 
        std::string content = "";
        std::string highlightedContent = "";
        std::string metadata = "";
        std::string highlightedMetadata = "";
        std::string filePath = "";
        int beginLine = 0; 
        int endLine = 0; 
    };

    using Embedding = DocPipe::Embedding;

    struct EmbeddingConfig
    {
        std::string configName;
        std::string modelName;
        std::string modelPath;
        int inputLength;

        bool operator<(const EmbeddingConfig &other) const
        {
            if (configName != other.configName)
                return configName < other.configName;
            if (modelName != other.modelName)
                return modelName < other.modelName;
            if (modelPath != other.modelPath)
                return modelPath < other.modelPath;
            return inputLength < other.inputLength;
        }
    };

    using EmbeddingConfigList = std::vector<EmbeddingConfig>;

    enum class searchAccuracy
    {
        low, // sorted and filtered by reranker model
        high // sorted and filtered by bm25 and vector similarity
    };

private:
    std::string repoName;
    std::filesystem::path repoPath;
    std::filesystem::path dbPath;

    std::shared_ptr<SqliteConnection> sqlite;
    std::shared_ptr<TextSearchTable> textTable;
    std::vector<std::shared_ptr<VectorTable>> vectorTables;
    std::vector<std::shared_ptr<Embedding>> embeddings;
    std::shared_ptr<RerankerModel> rerankerModel = nullptr;

    // for onnx runtime performance config
    int maxThreads;
    ONNXModel::device device;

    std::shared_ptr<Utils::WorkerThread> backgroundThread; // background thread for processing documents

    // to avoid deadlock, must lock sqlitemutex first, then repoMutex
    Utils::PriorityMutex& sqliteMutex; // share a sqlite with session, so share sqlite mutex
    Utils::PriorityMutex repoMutex; // mutex for vector tables, embeddings, reranker model

    std::atomic<bool> integrity = true; // if false, call reConstruct() to fix the database

    // callback functions for reporting progress and document state
    std::function<void(std::vector<std::string>)> docStateReporter;
    std::function<void(std::string, double)> progressReporter;
    std::function<void(std::string)> doneReporter;

    std::function<void(std::exception_ptr)> errorCallback = nullptr;

    constexpr static float alpha = 0.6;
    static float combineScore(float bm25Score, float vectorScore)
    {
        return alpha * bm25Score + (1 - alpha) * vectorScore;
    }

    // creat basic sqlite tables, should only be called in constructor
    // no mutex lock.
    void initializeSqlite(bool needLock = true);

    // update embeddings in both sqlite and class members
    // no mutex lock.
    void updateEmbeddings(const EmbeddingConfigList &configs = {}, bool needLock = true);

    // scan the repo path to find changed documents, no mutex lock.
    void checkDoc(std::queue<DocPipe>& docqueue);
    // actually execute updating task, need callback function to report progress, no mutex lock.
    void refreshDoc(std::queue<DocPipe> &docqueue, Utils::LockGuard &lock, Utils::LockGuard &repoLock, std::function<bool()> stopFlag);
    // remove invalid embedding_config and their chunks, no mutex lock.
    void removeInvalidEmbedding();

    // background thread for processing documents
    void backgroundProcess(std::function<bool()> retFlag);
    void startBackgroundProcess();
    int restartCount = 0;
    const static int maxRestartCount = 3;

    // to fix internal error, drop all tables and reconstruct
    // this method can only be called in background thread
    void reConstruct(bool needLock = false);

public:
    Repository(std::string repoName, std::filesystem::path repoPath, Utils::PriorityMutex &mutex, 
               int maxThreads, ONNXModel::device device, // ONNX performance config
               std::function<void(std::exception_ptr)> errorCallback,
               std::function<void(std::vector<std::string>)> docStateReporter = nullptr,
               std::function<void(std::string, double)> progressReporter = nullptr,
               std::function<void(std::string)> doneReporter = nullptr);
    ~Repository();

    Repository(const Repository &) = delete;            // disable copy constructor
    Repository &operator=(const Repository &) = delete; // disable copy assignment operator

    Repository(Repository &&) = delete;            // disable move constructor
    Repository &operator=(Repository &&) = delete; // disable move assignment operator

    std::vector<SearchResult> search(const std::string &query, searchAccuracy acc, int limit = 10);

    // config embedding settings, if arg is empty, will read from sqlite table
    void configEmbedding(const EmbeddingConfigList &configs);

    void configReranker(const std::filesystem::path &modelPath);

    std::pair<std::string, std::string> getRepoNameAndPath() const
    {
        return {repoName, repoPath.string()};
    }
};
