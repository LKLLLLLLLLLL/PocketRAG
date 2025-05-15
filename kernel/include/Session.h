#pragma once
#include <memory>
#include <string>
#include <thread>

#include "Repository.h"
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
    int sessionId;

    std::string repoName;
    std::filesystem::path repoPath;

    std::thread conversationThread; // thread for LLMConv

    std::shared_ptr<Repository> repository = nullptr; // repository instance

    std::shared_ptr<Utils::MessageQueue> sessionMessageQueue = std::make_shared<Utils::MessageQueue>(); // for session and kernel server communication

    std::atomic<double> lastProgress = 0.0;
    std::atomic<std::chrono::steady_clock::time_point> lastprintTime;
    void docStateReporter(std::vector<std::string> docs);
    void progressReporter(std::string path, double progress);
    void doneReporter(std::string path);

    // std::shared_ptr<LLMConv> conversation; // conversation instance
    // void conversationProcess();
    // void beginConversationThread();
    // void stopConversationThread();

    KernelServer& kernelServer;
    std::shared_ptr<Utils::CallbackManager> callbackManager = std::make_shared<Utils::CallbackManager>();
    void sendBack(nlohmann::json& json);
    void send(nlohmann::json& json, Utils::CallbackManager::Callback callback);
    void execCallback(nlohmann::json& json, int callbackId);

    void handleMessage(Utils::MessageQueue::Message& message);

public:
    Session(int sessionId, std::string repoName, std::filesystem::path repoPath, KernelServer& kernelServer);
    ~Session();

    // this method can only be called in one thread
    void run();

    // this function can be called by another thread
    void stop();

    // called by kernel server, will automatically get embedding config and reranker config from kernel server
    void config();

    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message);
};