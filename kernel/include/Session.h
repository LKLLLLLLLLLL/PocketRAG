#pragma once
#include <memory>
#include <thread>
#include <mutex>
#include <chrono>

#include "Repository.h"
#include "LLMConv.h"
#include "KernelServer.h"

/*
This clas will open a session to a windows of frontend.
It will manage a repository instance.
This is a single threaded class, but it may fork several threads.
*/
class Session
{
private:
    int sessionId;
    std::shared_ptr<Repository> repository;

    std::thread conversationThread; // thread for LLMConv

    std::shared_ptr<Utils::MessageQueue> sessionMessageQueue = {}; // for session and kernel server communication

    static void docStateReporter(std::vector<std::string> docs);
    static void progressReporter(std::string path, double progress);

    std::shared_ptr<LLMConv> conversation; // conversation instance
    void conversationProcess();

public:
    Session(int sessionId, std::string repoName, std::filesystem::path repoPath);
    ~Session();

    void run();

    // this function can be called by another thread
    void stop();

    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message)
    {
        sessionMessageQueue->push(message);
    }
};