#pragma once
#include <memory>
#include <thread>
#include <mutex>
#include <chrono>

#include "Repository.h"
#include "LLMConv.h"

class KernelServer;

/*
This clas will open a session to a windows of frontend.
It will manage a repository instance.
This is a single threaded class, but it may fork several threads.
*/
class Session
{
private:
    int sessionId;

    std::thread conversationThread; // thread for LLMConv

    std::shared_ptr<Repository> repository = nullptr; // repository instance

    std::shared_ptr<Utils::MessageQueue> sessionMessageQueue = std::make_shared<Utils::MessageQueue>(); // for session and kernel server communication

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

public:
    Session(int sessionId, std::string repoName, std::filesystem::path repoPath, KernelServer& kernelServer);
    ~Session();

    void run();

    // this function can be called by another thread
    void stop();

    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message)
    {
        sessionMessageQueue->push(message);
    }
};