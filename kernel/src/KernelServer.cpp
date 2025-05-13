#include "KernelServer.h"
#include "Utils.h"

#include <iostream>

//--------------------------KernelServer--------------------------//
KernelServer::KernelServer()
{
    kernelMessageQueue = std::make_shared<Utils::MessageQueue>();

    startMessageSender();

    initializeSqlite();
}

void KernelServer::initializeSqlite()
{
    // create user data path
    if (!std::filesystem::exists(userDataPath))
    {
        std::filesystem::create_directory(userDataPath);
    }

    sqliteConnection = std::make_shared<SqliteConnection>(userDataDBPath.string(), "kernel");

    sqliteConnection->execute(
        "CREATE TABLE IF NOT EXISTS embedding_config("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "config_name TEXT NOT NULL UNIQUE, "
        "model_name TEXT NOT NULL, "
        "model_path TEXT NOT NULL, "
        "input_length INTEGER NOT NULL"
        ");"
    );

    sqliteConnection->execute(
        "CREATE TABLE IF NOT EXISTS reranker_model("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "model_name TEXT NOT NULL UNIQUE, "
        "model_path TEXT NOT NULL, "
        "chosen BOOLEAN NOT NULL DEFAULT 0"
        ");"
    );

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
        "api_key TEXT NOT NULL, "
        "url TEXT NOT NULL"
        ");"
    );
}

void readSettings()
{
    
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
    // receive message
    std::string input(2048, '\0'); // max input size: 2048Byte
    while(std::cin.getline(input.data(), input.size()))
    {
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
        else
        {
            json["status"]["code"] = "INVALID_TYPE";
            json["status"]["message"] = "Invalid message type: " + type;
            sendBack(json);
        }
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
        if(message->data.contains("sessionId"))
        {
            auto it = sessionIdToWindowId.find(message->sessionId);
            if(it != sessionIdToWindowId.end())
            {
                message->data["sessionId"] = it->second;
            }
            else
            {
                message->data["sessionId"] = -1;
            }
        }
        std::cout << message->data.dump() << std::endl;
        message = kernelMessageQueue->pop();
    }
}

std::shared_ptr<LLMConv> KernelServer::getLLMConv(const std::string& modelName)
{
    auto stmt = sqliteConnection->getStatement("SELECT api_key, url FROM generation_model WHERE model_name = ?");
    stmt.bind(1, modelName);
    std::string apiKey;
    std::string url;
    if(stmt.step())
    {
        apiKey = stmt.get<std::string>(0);
        url = stmt.get<std::string>(1);
    }
    else
    {
        throw std::runtime_error("Model not found: " + modelName);
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
    auto stmt = sqliteConnection->getStatement("SELECT model_name FROM generation_model");
    std::vector<std::string> models;
    while(stmt.step())
    {
        std::string modelName = stmt.get<std::string>(0);
        models.push_back(modelName);
    }
    return models;
}

Repository::EmbeddingConfigList KernelServer::getEmbeddingConfigs()
{
    auto stmt = sqliteConnection->getStatement("SELECT config_name, model_name, model_path, input_length FROM embedding_config");
    Repository::EmbeddingConfigList configs;
    while(stmt.step())
    {
        Repository::EmbeddingConfig config;
        config.configName = stmt.get<std::string>(0);
        config.modelName = stmt.get<std::string>(1);
        config.modelPath = stmt.get<std::string>(2);
        config.inputLength = stmt.get<int>(3);
        configs.push_back(config);
    }
    return configs;
}

std::filesystem::path KernelServer::getRerankerConfigs()
{
    auto stmt = sqliteConnection->getStatement("SELECT model_path FROM reranker_model WHERE chosen = 1");
    if(stmt.step())
    {
        return std::filesystem::path(stmt.get<std::string>(0));
    }
    return "";
}
