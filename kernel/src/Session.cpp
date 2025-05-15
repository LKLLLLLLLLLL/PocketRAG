#include "Session.h"
#include "KernelServer.h"
#include "Repository.h"
#include "Utils.h"

void Session::docStateReporter(std::vector<std::string> docs)
{
    for (const auto &doc : docs)
    {
        nlohmann::json json;
        json["message"]["type"] = "embeddingState";
        json["message"]["filePath"] = doc;
        json["message"]["status"] = "embedding";
        json["message"]["progress"] = 0.0;

        json["toMain"] = false;
        send(json, nullptr);
    }
}

void Session::progressReporter(std::string path, double progress)
{
    // for debug
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - lastprintTime.load()).count();
    auto progressDiff = progress - lastProgress;
    if (elapsed < 1 && progress <= 0.99 && progress >= 0.03 && progressDiff < 0.15) // print progress every second
        return;
    lastprintTime = now;
    lastProgress = progress;
    // send message
    nlohmann::json json;
    json["message"]["type"] = "embeddingState";
    json["message"]["filePath"] = path;
    json["message"]["status"] = "embedding";
    json["message"]["progress"] = progress;

    json["toMain"] = false;
    send(json, nullptr);
}

void Session::doneReporter(std::string path)
{
    nlohmann::json json;
    json["message"]["type"] = "embeddingState";
    json["message"]["filePath"] = path;
    json["message"]["status"] = "done";
    json["message"]["progress"] = 1.0;

    json["toMain"] = false;
    send(json, nullptr);
}

// lazy initialization
Session::Session(int sessionId, std::string repoName, std::filesystem::path repoPath, KernelServer &kernelServer) : sessionId(sessionId), kernelServer(kernelServer), repoName(repoName), repoPath(repoPath)
{}

Session::~Session()
{
    stop();
}

void Session::sendBack(nlohmann::json& json)
{
    json["isReply"] = true;
    auto message = std::make_shared<Utils::MessageQueue::Message>(sessionId, std::move(json));
    kernelServer.sendMessage(message);
}

void Session::send(nlohmann::json& json, Utils::CallbackManager::Callback callback)
{
    auto callbackId = callbackManager->registerCallback(callback);
    json["callbackId"] = callbackId;
    json["isReply"] = false;
    auto message = std::make_shared<Utils::MessageQueue::Message>(sessionId, std::move(json));
    kernelServer.sendMessage(message);
}

void Session::execCallback(nlohmann::json& json, int callbackId)
{
    callbackManager->callCallback(callbackId, json);
}

void Session::run()
{
    auto docStateReporter_wrap = [this](std::vector<std::string> docs) { docStateReporter(docs); };
    auto progressReporter_wrap = [this](std::string path, double progress) { progressReporter(path, progress); };
    auto doneReporter_wrap = [this](std::string path) { doneReporter(path); };
    repository = std::make_shared<Repository>(repoName, repoPath, docStateReporter_wrap, progressReporter_wrap, doneReporter_wrap);
    config();
    // send done message
    nlohmann::json json;
    json["toMain"] = false;
    json["message"]["type"] = "sessionPrepared";
    auto [repoName, repoPath] = repository->getRepoNameAndPath();
    json["message"]["repoName"] = repoName;
    json["message"]["path"] = repoPath;
    send(json, nullptr);
    // handle messages
    auto message = sessionMessageQueue->pop();
    while (message != nullptr)
    {
        handleMessage(*message);
    }
}

void Session::handleMessage(Utils::MessageQueue::Message& message)
{
    auto& json = message.data;
    try 
    {
        bool isReply = message.data["isReply"].get<bool>();
        if (isReply) 
        {
            execCallback(message.data, message.data["callbackId"].get<int>());
            return;
        }
        auto type = message.data["message"]["type"].get<std::string>();
        if (type == "search") 
        {
            auto query = message.data["message"]["query"].get<std::string>();
            auto limit = message.data["message"]["limit"].get<int>();
            auto results = repository->search(query, Repository::searchAccuracy::low, limit);
            auto resultsJson = nlohmann::json::array();
            for (auto &result : results) 
            {
                nlohmann::json resultJson;
                resultJson["score"] = result.score;
                resultJson["content"] = result.content;
                resultJson["metadata"] = result.metadata;
                resultJson["filePath"] = result.filePath;
                resultJson["beginLine"] = result.beginLine;
                resultJson["endLine"] = result.endLine;
                resultJson["highlightedContent"] = result.highlightedContent;
                resultJson["highlightedMetadata"] = result.highlightedMetadata;
                resultsJson.push_back(resultJson);
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
    catch (nlohmann::json::exception& e) 
    {
        json["status"]["code"] = "WRONG_PARAM";
        json["status"]["message"] =
            "Invalid message format, parser error: " + std::string(e.what());
        sendBack(json);
    } 
    catch (std::exception &e) 
    {
        json["status"]["code"] = "UNKNOWN_ERROR";
        json["status"]["message"] = "Unknown error: " + std::string(e.what());
        sendBack(json);
    }
}

void Session::stop()
{
    // stopConversationThread();
    sessionMessageQueue->shutdown();
}

void Session::config()
{
    // update embedding config
    auto embeddingConfig = kernelServer.getEmbeddingConfigs();
    repository->configEmbedding(embeddingConfig);

    // update reranker config
    auto rerankerConfig = kernelServer.getRerankerConfigs();
    repository->configReranker(rerankerConfig);
}

void Session::sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message)
{
    sessionMessageQueue->push(message);
}
