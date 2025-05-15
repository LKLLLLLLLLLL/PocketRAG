#include "KernelServer.h"
#include "Repository.h"
#include "Utils.h"

#include <filesystem>
#include <iostream>
#include <fstream>

//--------------------------KernelServer--------------------------//
KernelServer::KernelServer()
{
    kernelMessageQueue = std::make_shared<Utils::MessageQueue>();

    startMessageSender();

    initializeSqlite();

    settings = std::make_shared<Settings>(userDataPath, *this);
}

void KernelServer::initializeSqlite()
{
    // create user data path
    if (!std::filesystem::exists(userDataPath))
    {
        std::filesystem::create_directory(userDataPath);
    }

    try
    {
        sqliteConnection = std::make_shared<SqliteConnection>(userDataDBPath.string(), "kernel");
    }
    catch(...)
    {
        std::cerr << (userDataDBPath / "kernel.db").string() << " file broken, try to create new database" << std::endl;
    }

    sqliteConnection->execute(
        "CREATE TABLE IF NOT EXISTS repository("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "repo_name TEXT NOT NULL UNIQUE, "
        "repo_path TEXT NOT NULL"
        ");"
    );

    sqliteConnection->execute(
        "CREATE TABLE IF NOT EXISTS generation_model("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "model_name TEXT NOT NULL UNIQUE, "
        "api_key TEXT"
        ");"
    );
}

KernelServer::~KernelServer()
{
    stopAllFlag = true;
    stopMessageSender();
    stopAllSessions(); // stop session threads
    for(auto& session : sessions) // release session resuorces
    {
        session.second.reset();
    }
    sessions.clear();
}

void KernelServer::stopAllSessions()
{
    for(auto& session : sessions)
    {
        session.second->stop();
    }
    for(auto& thread : sessionThreads)
    {
        if(thread.second.joinable())
        {
            thread.second.join();
        }
    }
    sessionThreads.clear();
}

void KernelServer::run()
{  
    // sent message to frontend
    nlohmann::json initMessage;
    initMessage["sessionId"] = -1;
    initMessage["toMain"] = true;
    initMessage["isReply"] = false;
    initMessage["callbackId"] = 0;
    initMessage["message"]["type"] = "ready";
    send(initMessage, nullptr);
    // receive message
    std::string input(2048, '\0'); // max input size: 2048Byte
    while(std::cin.getline(input.data(), input.size()))
    {
        if(input == "")
        {
            continue;
        }
        nlohmann::json inputJson;
        int windowId;
        bool toMain;
        std::string messageType;
        try
        {
            inputJson = nlohmann::json::parse(input);
            windowId = inputJson["sessionId"].get<int>();
            toMain = inputJson["toMain"].get<bool>();
            messageType = inputJson["message"]["type"].get<std::string>();
        }
        catch(std::exception& e)
        {
            inputJson["status"]["code"] = "WRONG_PARAM";
            inputJson["status"]["message"] = "Invalid message format, parser error: " + std::string(e.what());
            sendBack(inputJson);
            continue;
        }
        if(!toMain)
            transmitMessage(inputJson);
        else
            handleMessage(inputJson);
        if(stopAllFlag)
        {
            break;
        }
    }
}

void KernelServer::transmitMessage(nlohmann::json& json)
{
    int windowId = json["sessionId"].get<int>();
    auto it = windowIdToSessionId.find(windowId);
    int sessionId = -1;
    if (it != windowIdToSessionId.end()) 
    {
        sessionId = it->second;
    }
    else
    {
        json["status"]["code"] = "SESSION_NOT_FOUND";
        json["status"]["message"] = "Session not found, with windowId: " + std::to_string(windowId);
        sendBack(json);
        return;
    }
    auto message = std::make_shared<Utils::MessageQueue::Message>(sessionId, std::move(json));
    sessions[sessionId] -> sendMessage(message);
}

void KernelServer::handleMessage(nlohmann::json& json)
{
    try
    {
        auto isReply = json["isReply"].get<bool>();
        if(isReply)
        {
            execCallback(json, json["callbackId"].get<int>());
            return;
        }
        auto type = json["message"]["type"].get<std::string>();
        if(type == "stopAll")
        {
            stopAllFlag = true;
            stopMessageSender();
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
            sendBack(json);
        }
        else if(type == "getRepos") // get repos list
        {
            auto repos = getRepos();
            nlohmann::json repoList = nlohmann::json::array();
            for(auto& repo : repos)
            {
                nlohmann::json repoJson;
                repoJson["name"] = repo.first;
                repoJson["path"] = repo.second;
                repoList.push_back(repoJson);
            }
            json["data"]["repoList"] = repoList;
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
            sendBack(json);
        }
        else if(type == "openRepo") // open a session with repo name
        {
            auto repoName = json["message"]["repoName"].get<std::string>();
            auto windowId = json["message"]["sessionId"].get<int>();
            auto stmt = sqliteConnection->getStatement("SELECT repo_path FROM repository WHERE repo_name = ?");
            stmt.bind(1, repoName);
            if(stmt.step())
            {
                auto repoPath = stmt.get<std::string>(0);
                openSession(windowId, repoName, repoPath);
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
                json["data"]["repoName"] = repoName;
                json["data"]["path"] = repoPath;
            }
            else
            {
                json["status"]["code"] = "REPO_NOT_FOUND";
                json["status"]["message"] = "Cannot find repo with name: " + repoName;
            }
            sendBack(json);
        }
        else if(type == "createRepo")
        {
            auto repoName = json["message"]["repoName"].get<std::string>();
            auto repoPath = json["message"]["path"].get<std::string>();
            // check if repo path is valid
            std::filesystem::path repoPathobj;
            try
            {
                repoPathobj = std::filesystem::path(repoPath);
            }
            catch(std::exception& e)
            {
                json["status"]["code"] = "INVALID_PATH";
                json["status"]["message"] = "Invalid path: " + repoPath + ", parser error: " + std::string(e.what());
                sendBack(json);
                return;
            }
            if(!repoPathobj.is_absolute())
            {
                json["status"]["code"] = "INVALID_PATH";
                json["status"]["message"] = "Path is not absolute: " + repoPath;
                sendBack(json);
                return;
            }
            if(!std::filesystem::exists(repoPathobj))
            {
                json["status"]["code"] = "INVALID_PATH";
                json["status"]["message"] = "Path does not exist: " + repoPath;
                sendBack(json);
                return;
            }
            // check if repo name equals to repo name in path
            std::string repoNameInPath = repoPathobj.filename().string();
            if(repoName != repoNameInPath)
            {
                json["status"]["code"] = "REPO_NAME_NOT_MATCH";
                json["status"]["message"] = "Repo name in path: " + repoNameInPath + " not match with repo name: " + repoName;
                sendBack(json);
                return;
            }
            // find if repo name exists
            auto stmt = sqliteConnection->getStatement("SELECT * FROM repository WHERE repo_name = ?");
            stmt.bind(1, repoName);
            if(stmt.step()) // exists
            {
                json["status"]["code"] = "REPO_NAME_EXISTS";
                json["status"]["message"] = "Repo name already exists: " + repoName;
                sendBack(json);
                return;
            }
            else // valid create repo
            {
                auto stmt = sqliteConnection->getStatement("INSERT INTO repository(repo_name, repo_path) VALUES(?, ?)");
                stmt.bind(1, repoName);
                stmt.bind(2, repoPath);
                stmt.step();
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
                sendBack(json);
                return;
            }
        }
        else if(type == "closeRepo")
        {
            auto windowId = json["message"]["sessionId"].get<int>();
            auto it = windowIdToSessionId.find(windowId);
            if(it != windowIdToSessionId.end())
            {
                int sessionId = it->second;
                sessions[sessionId]->stop();
                sessions.erase(sessionId);
                windowIdToSessionId.erase(windowId);
                sessionIdToWindowId.erase(sessionId);
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
            }
            else
            {
                json["status"]["code"] = "SESSION_NOT_FOUND";
                json["status"]["message"] = "Session not found, with windowId: " + std::to_string(windowId);
            }
            sendBack(json);
        }
        else if(type == "checkSettings")
        {
            try
            {
                settings->checkSettingsValidity();
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
            }
            catch(std::exception& e)
            {
                json["status"]["code"] = "INVALID_SETTINGS";
                json["status"]["message"] = "Failed in checking settings: " + std::string(e.what());
            }
            sendBack(json);
        }
        else if(type == "updateSettings")
        {
            updateSettings();
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
            sendBack(json);
        }
        else if (type == "setApiKey")
        {
            auto modelName = json["message"]["name"].get<std::string>();
            auto apiKey = json["message"]["apiKey"].get<std::string>();
            // chuck if model name exists
            auto stmt = sqliteConnection->getStatement("SELECT * FROM generation_model WHERE model_name = ?");
            stmt.bind(1, modelName);
            if(stmt.step()) // exists
            {
                auto updateStmt = sqliteConnection->getStatement("UPDATE generation_model SET api_key = ? WHERE model_name = ?");
                updateStmt.bind(1, apiKey);
                updateStmt.bind(2, modelName);
                updateStmt.step();
            }
            else // not exists
            {
                auto insertStmt = sqliteConnection->getStatement("INSERT INTO generation_model(model_name, api_key) VALUES(?, ?)");
                insertStmt.bind(1, modelName);
                insertStmt.bind(2, apiKey);
                insertStmt.step();
            }
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        }
        else if(type == "getApiKey")
        {
            auto modelName = json["message"]["name"].get<std::string>();
            auto apiKey = getApiKey(modelName);
            if(apiKey.empty())
            {
                json["status"]["code"] = "API_KEY_NOT_FOUND";
                json["status"]["message"] = "API key not found for model: " + modelName;
            }
            else
            {
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
                json["data"]["apiKey"] = apiKey;
            }
        }
        else if(type == "getGenerationModels")
        {
            auto models = getGenerationModels();
            nlohmann::json modelList = nlohmann::json::array();
            for(auto& model : models)
            {
                nlohmann::json modelJson;
                modelJson["name"] = model;
                modelList.push_back(modelJson);
            }
            json["data"]["modelList"] = modelList;
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        }
        else
        {
            json["status"]["code"] = "INVALID_TYPE";
            json["status"]["message"] = "Invalid message type: " + type;
        }
        sendBack(json);
    }
    catch(nlohmann::json::exception& e)
    {
        json["status"]["code"] = "WRONG_PARAM";
        json["status"]["message"] = "Invalid message format, parser error: " + std::string(e.what());
        sendBack(json);
    }
    catch(std::exception& e)
    {
        json["status"]["code"] = "UNKNOWN_ERROR";
        json["status"]["message"] = "Unknown error: " + std::string(e.what());
        sendBack(json);
    }
}

void KernelServer::execCallback(nlohmann::json& json, int callbackId)
{
    callbackManager->callCallback(callbackId, json);
}

void KernelServer::send(nlohmann::json& json, Utils::CallbackManager::Callback callback)
{
    auto callbackId = callbackManager->registerCallback(callback);
    json["callbackId"] = callbackId;
    json["isReply"] = false;
    auto message = std::make_shared<Utils::MessageQueue::Message>(-1, std::move(json));
    sendMessage(message);
}

void KernelServer::sendBack(nlohmann::json& json)
{
    json["isReply"] = true;
    auto message = std::make_shared<Utils::MessageQueue::Message>(0, std::move(json));
    kernelMessageQueue->push(message);
}

void KernelServer::openSession(int windowId, const std::string& repoName, const std::string& repoPath)
{
    auto sessionId = Utils::getTimeStamp();
    auto session = std::make_shared<Session>(sessionId, repoName, repoPath, *this);
    sessions[sessionId] = session;
    sessionThreads[sessionId] = std::thread(&Session::run, session);
    windowIdToSessionId[windowId] = sessionId;
    sessionIdToWindowId[sessionId] = windowId;
}

void KernelServer::startMessageSender()
{
    messageSenderThread = std::thread(&KernelServer::messageSender, this);
}

void KernelServer::stopMessageSender()
{
    kernelMessageQueue->shutdown();
    if(messageSenderThread.joinable())
    {
        messageSenderThread.join();
    }
}

void KernelServer::messageSender()
{
    auto message = kernelMessageQueue->pop();
    while(message != nullptr)
    {
        if(message->data.empty())
        {
            continue;
        }
        auto it = sessionIdToWindowId.find(message->sessionId);
        if(message->sessionId != -1 && it != sessionIdToWindowId.end())
        {
            message->data["sessionId"] = it->second;
        }
        else
        {
            message->data["sessionId"] = -1; // message from kernel server
        }
        std::cout << message->data.dump() << std::endl << std::flush;
        message = kernelMessageQueue->pop();
    }
}

void KernelServer::updateSettings()
{
    settings->saveSettings();
    // update sqlite
    auto trans = sqliteConnection->beginTransaction();
    std::vector<std::string> deletedGModels;
    auto gModels = settings->getGenerationModels();
    auto stmt = sqliteConnection->getStatement("SELECT id FROM generation_model WHERE model_name = ?");
    while(stmt.step())
    {
        auto modelName = stmt.get<std::string>(0);
        bool found = false;
        for(auto& gModel : gModels)
        {
            if(gModel.modelName == modelName)
            {
                found = true;
                break;
            }
        }
        if(!found)
        {
            deletedGModels.push_back(modelName);
        }
    }
    stmt = sqliteConnection->getStatement("DELETE FROM generation_model WHERE model_name = ?");
    for(auto& modelName : deletedGModels)
    {
        stmt.bind(1, modelName);
        stmt.step();
        stmt.reset();
    }
    trans.commit();
}

std::string KernelServer::getApiKey(const std::string &modelName)
{
    auto stmt = sqliteConnection->getStatement("SELECT api_key FROM generation_model WHERE model_name = ?");
    stmt.bind(1, modelName);
    if(stmt.step())
    {
        return stmt.get<std::string>(0);
    }
    return "";
}

std::shared_ptr<LLMConv> KernelServer::getLLMConv(const std::string& modelName)
{
    // get api key from sqlite
    auto stmt = sqliteConnection->getStatement("SELECT api_key FROM generation_model WHERE model_name = ?");
    stmt.bind(1, modelName);
    std::string apiKey;
    if(stmt.step())
    {
        apiKey = stmt.get<std::string>(0);
    }
    else
    {
        throw std::runtime_error("Model not found: " + modelName);
    }
    // get url from settings
    std::string url = "";
    auto genModels = settings->getGenerationModels();
    for(auto& model : genModels)
    {
        if(model.modelName == modelName)
        {
            url = model.url;
            break;
        }
    }
    if(url.empty())
    {
        throw std::runtime_error("Model url not found: " + modelName);
    }
    auto conv = LLMConv::createConv(LLMConv::type::OpenAIapi, modelName,{{"api_key", apiKey}, {"url", url}});
    return conv;
}

std::vector<std::pair<std::string, std::string>> KernelServer::getRepos()
{
    auto stmt = sqliteConnection->getStatement("SELECT repo_name, repo_path FROM repository");
    std::vector<std::pair<std::string, std::string>> repos;
    while(stmt.step())
    {
        std::string repoName = stmt.get<std::string>(0);
        std::string repoPath = stmt.get<std::string>(1);
        repos.emplace_back(repoName, repoPath);
    }
    return repos;
}

std::vector<std::string> KernelServer::getGenerationModels()
{
    auto genModels = settings->getGenerationModels();
    std::vector<std::string> models;
    for(auto& model : genModels)
    {
        models.push_back(model.modelName);
    }
    return models;
}

Repository::EmbeddingConfigList KernelServer::getEmbeddingConfigs()
{
    auto embeddingConfigs = settings->getEmbeddingConfigs();
    Repository::EmbeddingConfigList configs;
    for(auto& config : embeddingConfigs)
    {
        if(!config.selected)
        {
            continue;
        }
        Repository::EmbeddingConfig embeddingConfig;
        embeddingConfig.configName = config.name;
        embeddingConfig.modelName = config.modelName;
        embeddingConfig.inputLength = config.inputLength;
        configs.push_back(embeddingConfig);
    }
    return configs;
}

std::filesystem::path KernelServer::getRerankerConfigs()
{
    auto rerankConfigs = settings->getRerankConfigs();
    int selectedCount = 0;
    std::filesystem::path selectedPath;
    for(auto& config : rerankConfigs)
    {
        if(config.selected)
        {
            selectedCount++;
            selectedPath = config.modelName;
        }
    }
    if(selectedCount == 1)
    {
        return selectedPath;
    }
    else if(selectedCount > 1)
    {
        throw std::runtime_error("More than one rerank config selected");
    }
    else
    {
        throw std::runtime_error("No rerank config selected");
    }
}

//--------------------------Settings--------------------------//
void KernelServer::Settings::checkSettingsValidity() const
{
    readSettings(settingsPath / "settings-modified.json");
}

auto KernelServer::Settings::readSettings(std::filesystem::path path) const -> SettingsCache
{
    // 1. try to read settings file
    std::ifstream settingsFile(path);
    if(!settingsFile)
    {
        throw std::runtime_error("Failed to open settings file: " + path.string());
    }
    nlohmann::json settingsJson;
    settingsFile >> settingsJson;
    settingsFile.close();

    // 2. try to parse settings.json
    SettingsCache tempCache;
    try
    {
        // parse searchSettings
        auto& searchSettings = settingsJson["searchSettings"];
        tempCache.searchSettings.searchLimit = searchSettings["searchLimit"].get<int>();
        for(auto& embeddingConfig : searchSettings["embeddingConfig"]["configs"])
        {
            SettingsCache::SearchSettings::EmbeddingConfig::Config config;
            config.name = embeddingConfig["name"].get<std::string>();
            config.modelName = embeddingConfig["modelName"].get<std::string>();
            config.inputLength = embeddingConfig["inputLength"].get<int>();
            config.selected = embeddingConfig["selected"].get<bool>();
            tempCache.searchSettings.embeddingConfig.configs.push_back(config);
        }
        for(auto& rerankConfig : searchSettings["rerankConfig"]["configs"])
        {
            SettingsCache::SearchSettings::RrankConfig::Config config;
            config.modelName = rerankConfig["modelName"].get<std::string>();
            config.selected = rerankConfig["selected"].get<bool>();
            tempCache.searchSettings.rerankConfig.configs.push_back(config);
        }
        // parse localModelManagement
        for(auto& model : settingsJson["localModelManagement"]["models"])
        {
            SettingsCache::LocalModelManagement::Model localModel;
            localModel.name = model["name"].get<std::string>();
            localModel.path = model["path"].get<std::string>();
            localModel.type = model["type"].get<std::string>();
            localModel.fileSize = model["fileSize"].get<int>();
            tempCache.localModelManagement.models.push_back(localModel);
        }
        // parse conversationSettings
        for(auto& model : settingsJson["conversationSettings"]["generationModel"])
        {
            SettingsCache::ConversationSettings::GenerationModel generationModel;
            generationModel.name = model["name"].get<std::string>();
            generationModel.modelName = model["modelName"].get<std::string>();
            generationModel.url = model["url"].get<std::string>();
            generationModel.setApiKey = model["setApiKey"].get<bool>();
            generationModel.lastUsed = model["lastUsed"].get<bool>();
            tempCache.conversationSettings.generationModel.push_back(generationModel);
        }
    }
    catch(std::exception& e)
    {
        throw std::runtime_error("Failed to parse settings file: " + path.string() + ", parser error: " + std::string(e.what()));
    }

    // 3. check constraints
    // check localModelManagement
    std::set<std::string> modelNames;
    for(auto& model : tempCache.localModelManagement.models) // if model name is unique
    {
        if(modelNames.find(model.name) != modelNames.end())
        {
            throw std::runtime_error("Duplicate model name: " + model.name);
        }
        if(!std::filesystem::exists(model.path))
        {
            throw std::runtime_error("Model path does not exist: " + model.path);
        }
        modelNames.insert(model.name);
    }

    // check searchSettings
    if(tempCache.searchSettings.searchLimit <= 0)
    {
        throw std::runtime_error("Invalid search limit: " + std::to_string(tempCache.searchSettings.searchLimit));
    }
    // if model name is unique and reference to localModelManagement
    for(auto& embeddingConfig : tempCache.searchSettings.embeddingConfig.configs)
    {
        if(modelNames.find(embeddingConfig.modelName) == modelNames.end())
        {
            throw std::runtime_error("Embedding config model name not found in localModelManagement: " + embeddingConfig.modelName);
        }
        if(modelNames.find(embeddingConfig.name) != modelNames.end())
        {
            throw std::runtime_error("Duplicate embedding config name: " + embeddingConfig.name);
        }
        modelNames.insert(embeddingConfig.name);
    }
    // if model name reference to localModelManagement and only one selected
    int selectedCount = 0;
    for(auto& rerankConfig : tempCache.searchSettings.rerankConfig.configs)
    {
        if(modelNames.find(rerankConfig.modelName) == modelNames.end())
        {
            throw std::runtime_error("Rerank config model name not found in localModelManagement: " + rerankConfig.modelName);
        }
        if(rerankConfig.selected)
        {
            selectedCount++;
        }
    }
    if(selectedCount != 1)
    {
        throw std::runtime_error("Rerank config must have exactly one selected model");
    }

    // check conversationSettings
    // check if model name is unique and apiKey is set in sqlite
    int lastUsedCount = 0;
    for(auto& generationModel : tempCache.conversationSettings.generationModel)
    {
        if(generationModel.setApiKey && generationModel.url.empty())
        {
            throw std::runtime_error("Generation model url is empty when setApiKey is true");
        }
        if(kernelServer.getApiKey(generationModel.modelName) == "")
        {
            throw std::runtime_error("Generation model apiKey is not set.");
        }
        if(generationModel.lastUsed)
        {
            lastUsedCount++;
        }
    }
    if(lastUsedCount > 1)
    {
        throw std::runtime_error("Generation model can only have one or zero last used model");
    }

    return tempCache;
}

void KernelServer::Settings::saveSettings()
{
    settingsCache = readSettings(settingsPath / "settings.json");
}
