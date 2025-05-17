#pragma once
#include <thread>
#include <string>
#include <unordered_map>
#include <vector>
#include <memory>

#include <nlohmann/json.hpp>

#include "LLMConv.h"
#include "Session.h"
#include "SqliteConnection.h"
#include "Utils.h"

class Repository;

/*
This class can only be instantiated once.
It will handle all requests from the frontend.
It will open thread to handle messages from frontend and sessions.
It is a single-thread class, only some interface can be called in multiple threads.
*/
class KernelServer
{
public:
    using Json = nlohmann::json;

private:
    const std::filesystem::path userDataPath;
    const std::filesystem::path userDataDBPath = userDataPath / "db";
    const std::filesystem::path logPath = userDataPath / "log";

    // messagequeue for frontend and backend communication
    std::shared_ptr<Utils::MessageQueue> kernelMessageQueue = nullptr; // for kernel server 

    std::unordered_map<int, int> windowIdToSessionId = {};
    std::unordered_map<int, int> sessionIdToWindowId = {};
    std::unordered_map<int, std::shared_ptr<Session>> sessions = {}; // session id -> session ptr
    std::unordered_map<int, std::thread> sessionThreads = {}; // session id -> thread

    // prevent multiple instances of KernelServer
    KernelServer(const std::filesystem::path &userDataPath);

    std::shared_ptr<SqliteConnection> sqliteConnection = nullptr; // sqlite connection
    void initializeSqlite();

    // method called by run()
    void transmitMessage(nlohmann::json& json); // handle message to session
    void handleMessage(nlohmann::json& json); // handle message to main thread

    // method for callback
    std::shared_ptr<Utils::CallbackManager> callbackManager = std::make_shared<Utils::CallbackManager>();
    void execCallback(nlohmann::json& json, int callbackId); // execute callback
    void send(nlohmann::json& json, Utils::CallbackManager::Callback callback); // send message to session
    void sendBack(nlohmann::json& json); // send message from server to frontend, will set "isReply" to true

    void openSession(int windowId, const std::string& repoName, const std::string& repoPath);
    void stopAllSessions(); // stop all session threads, but not deconstruct them

    std::atomic<bool> stopAllFlag = false;

    // this thread will transmit all messages to the frontend
    std::thread messageSenderThread;
    void startMessageSender();
    void stopMessageSender();
    void messageSender();

    class Settings;
    friend class Settings;
    std::shared_ptr<Settings> settings = nullptr;
    // update settings from json file and update sqlite
    void updateSettings();
    // interface for settings class
    std::string getApiKey(const std::string &modelName) const;
public:
    // initialize a server and return a instance.
    static KernelServer& openServer(const std::filesystem::path& userDataPath)
    {
        static KernelServer instance(userDataPath); 
        return instance; 
    }
    ~KernelServer();

    // start the server and open a thread to handle messages from sessions.
    void run();

    // send Message to frontend, thread safe
    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message)
    {
        kernelMessageQueue->push(message);
    }

    // methods below are interfaces for sessions to call, can be called in multiple threads
    // open a conversation
    std::shared_ptr<LLMConv> getLLMConv(const std::string &modelName) const;
    // get repos list, return repo name and repo path
    std::vector<std::pair<std::string, std::string>> getRepos() const;
    // get all generation model names
    std::vector<std::string> getGenerationModels() const;
    Repository::EmbeddingConfigList getEmbeddingConfigs() const;
    std::filesystem::path getRerankerConfigs() const;
    int getSearchLimit() const;
};
   
/*
This class is used to manage settings from settings.json file.
*/
class KernelServer::Settings
{
public:
    // has same structure as the json file
    struct SettingsCache
    {
        struct SearchSettings
        {
            int searchLimit;
            struct EmbeddingConfig
            {
                struct Config
                {
                    std::string name;
                    std::string modelName;
                    int inputLength;
                    bool selected;
                };
                std::vector<Config> configs;
            } embeddingConfig; 
            struct RrankConfig
            {
                struct Config
                {
                    std::string modelName;
                    bool selected;
                };
                std::vector<Config> configs;
            } rerankConfig;
        } searchSettings;
        struct LocalModelManagement
        {
            struct Model
            {
                std::string name;
                std::string path;
                std::string type;  // embedding, rerank, generation
                int fileSize;      // in MB
            };
            std::vector<Model> models;
        } localModelManagement;
        struct ConversationSettings
        {
            struct GenerationModel
            {
                std::string name;
                std::string modelName;
                std::string url;
                bool setApiKey;
                bool lastUsed;
            };
            std::vector<GenerationModel> generationModel;
        } conversationSettings;
    };
private:
    const std::filesystem::path settingsPath;
    SettingsCache settingsCache;
    KernelServer& kernelServer;
    SettingsCache readSettings(std::filesystem::path path = "") const;
    mutable std::mutex settingsMutex;
public:
    Settings(std::filesystem::path path, KernelServer& kernelServer) : settingsPath(path), kernelServer(kernelServer) {}
    // check if settings.json is valid, will throw exception if not
    void checkSettingsValidity() const;
    void saveSettings();

    int getSearchLimit() const;
    std::vector<SettingsCache::ConversationSettings::GenerationModel> getGenerationModels() const;
    std::vector<SettingsCache::LocalModelManagement::Model> getLocalModels() const;
    std::vector<SettingsCache::SearchSettings::EmbeddingConfig::Config> getEmbeddingConfigs() const;
    std::vector<SettingsCache::SearchSettings::RrankConfig::Config> getRerankConfigs() const;
    std::string getModelPath(const std::string &modelName) const;
};
