#pragma once
#include <iostream>
#include <thread>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>
#include <queue>
#include <memory>

#include <nlohmann/json.hpp>

#include "LLMConv.h"
#include "Session.h"
#include "Utils.h"

struct Repository::EmbeddingConfig;

/*
This class can only be instantiated once.
It will handle all requests from the frontend.
It will open thread to handle messages from frontend and sessions.
It is a single-thread class.
*/
class KernelServer
{
public:
    using Json = nlohmann::json;

private:
    const std::filesystem::path userDataPath = "./UserData";

    // messagequeue for frontend and backend communication
    std::shared_ptr<Utils::MessageQueue> kernelMessageQueue = nullptr; // for kernel server 

    std::unordered_map<int, int> windowIdToSessionId = {};
    std::unordered_map<int, int> sessionIdToWindowId = {};
    std::unordered_map<int, std::shared_ptr<Session>> sessions = {}; // session id -> session ptr
    std::unordered_map<int, std::thread> sessionThreads = {}; // session id -> thread

    // prevent multiple instances of KernelServer
    KernelServer();

    std::shared_ptr<SqliteConnection> sqliteConnection = nullptr; // sqlite connection
    void initializeSqlite();

    // method called by run()
    void transmitMessage(nlohmann::json& json); // handle message to session
    void handleMessage(nlohmann::json& json); // handle message to main thread
    void sendBack(nlohmann::json& json); // send message from server to frontend, will set "isReply" to true

    void openSession(int windowId, const std::string& repoName, const std::string& repoPath);
    void stopAllSessions(); // stop all session threads, but not deconstruct them

    std::atomic<bool> stopAllFlag = false;

    // this thread will transmit all messages to the frontend
    std::thread messageSenderThread;
    void startMessageSender();
    void stopMessageSender();
    void messageSender();

public:
    // initialize a server and return a instance.
    static KernelServer& openServer()
    {
        static KernelServer instance; 
        return instance; 
    }

    ~KernelServer();

    // start the server and open a thread to handle messages from sessions.
    void run();

    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message)
    {
        kernelMessageQueue->push(message);
    }

    // method for sessions to open a conversation
    std::shared_ptr<LLMConv> getLLMConv(const std::string &modelName);

    // get repos list, return repo name and repo path
    std::vector<std::pair<std::string, std::string>> getRepos();

    // get all generation model names
    std::vector<std::string> getGenerationModels();

    Repository::EmbeddingConfigList getEmbeddingConfigs();
};
