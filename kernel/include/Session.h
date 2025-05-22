#pragma once
#include <exception>
#include <memory>
#include <string>
#include <thread>

#include "Repository.h"
#include "LLMConv.h"
#include "SqliteConnection.h"
#include "Utils.h"

class KernelServer;

/*
This clas will open a session to a windows of frontend.
It will manage a repository instance.
Gurantee part of thread safety: despite "run()", other methods can be called in multiple threads.
*/
class Session
{
private:
    int64_t sessionId;

    std::string repoName;
    std::filesystem::path repoPath;

    std::shared_ptr<SqliteConnection> sqlite;

    std::thread conversationThread; // thread for LLMConv

    std::shared_ptr<Repository> repository = nullptr; // repository instance

    std::shared_ptr<Utils::MessageQueue> sessionMessageQueue = std::make_shared<Utils::MessageQueue>(); // for session and kernel server communication

    std::atomic<double> lastProgress = 0.0;
    std::atomic<std::chrono::steady_clock::time_point> lastprintTime;
    void docStateReporter(std::vector<std::string> docs);
    void progressReporter(std::string path, double progress);
    void doneReporter(std::string path);

    class AugmentedConversation;
    std::shared_ptr<AugmentedConversation> conversation = nullptr; // conversation instance

    KernelServer& kernelServer;
    std::shared_ptr<Utils::CallbackManager> callbackManager = std::make_shared<Utils::CallbackManager>();
    void sendBack(nlohmann::json& json);
    void send(nlohmann::json& json, Utils::CallbackManager::Callback callback);
    void execCallback(nlohmann::json &json, int64_t callbackId);

    void handleMessage(Utils::MessageQueue::Message& message);

    std::mutex errorMutex;
    std::exception_ptr repoThreadError = nullptr;

    std::function<void(std::exception_ptr, int64_t)> crashHandler = nullptr;

    void initializeSqlite();

public:
    Session(int64_t sessionId, std::string repoName, std::filesystem::path repoPath, KernelServer& kernelServer);
    ~Session();

    // this method can only be called in one thread
    void run();

    // this function can be called by another thread, it will shuddown all threads under this session
    void stop();

    // called by kernel server, will automatically get embedding config and reranker config from kernel server
    void config();

    // called by kernel server
    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message);

    void setCrashHandler(std::function<void(std::exception_ptr, int64_t)> handler)
    {
        crashHandler = handler;
    }
};

class Session::AugmentedConversation
{
public:
    enum class Type{search, result, answer, annotation, doneRetrieval, done, networkError, unknownError}; // type of this message
private:
    std::shared_ptr<LLMConv> conversation = nullptr; // conversation instance
    const std::filesystem::path historyDirPath;     // conversation path
    std::string query;
    int64_t conversationId; // conversation id

    Session& session;
    std::function<void(std::string, Type)> sendBack = nullptr;

    std::atomic<bool> shutdownFlag = false;
    std::thread conversationThread;

    // only read maxHistoryLength characters from conversation history
    static const int maxHistoryLength = 1000;

    void conversationProcess();

    static std::string extractSearchword(const std::string& answer);
    struct HistoryManager;
    friend struct HistoryManager;
public:
    AugmentedConversation(std::filesystem::path historyDirPath, Session& session);
    ~AugmentedConversation();
    // open a new conversation
    void openConversation(std::shared_ptr<LLMConv> conv, std::function<void(std::string, Type)> sendBack, std::string prompt, int64_t conversationId);
    // stop conversation and destroy conversation thread
    void stopConversation();
};


/*
This class will save history to disk and call sendBack function to send message to frontend.
It will manage two type of history files:
- historyJson: save conversation history in a viewing format, to be rendered in frontend
- historyMessagesJson: save conversation history in a raw format, including "role" and "content" fields, used directly in api.
*/
class Session::AugmentedConversation::HistoryManager
{
private:
    nlohmann::json historyJson;
    nlohmann::json conversationJson;
    nlohmann::json tempJson;
    AugmentedConversation &parent;
    std::vector<LLMConv::Message> historyMessages;

    std::filesystem::path historyFilePath;
    std::filesystem::path fullHistoryFilePath; // save history messages
    nlohmann::json historyMessagesJson;

    // for sqlite
    LLMConv::TokenUsage tokenUsage;
public:
    HistoryManager(AugmentedConversation &parent);
    ~HistoryManager();

    std::vector<LLMConv::Message> getHistoryMessages();

    void push(Type type, const std::string &content);

    void push(Type type, const Repository::SearchResult &result);

    void beginRetrieval(const std::string &annotation);

    // push search and result into one retrieval object
    void endRetrieval();

    // for sqlite
    void setTokenUsage(LLMConv::TokenUsage tokenUsage)
    {
        this->tokenUsage = tokenUsage;
    }
};