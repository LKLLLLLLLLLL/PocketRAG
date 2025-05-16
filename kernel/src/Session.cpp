#include "Session.h"
#include "KernelServer.h"
#include "Repository.h"
#include "Utils.h"
#include <memory>
#include <minwindef.h>
#include <nlohmann/json_fwd.hpp>

//--------------------------Session--------------------------//
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
    auto progressDiff = progress - lastProgress.load();
    if (elapsed < 1 && progress <= 0.99 && progress >= 0.03 && progressDiff < 0.15) // print progress every second
        return;
    lastprintTime.store(now);
    lastProgress.store(progress);
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
{
    conversation = std::make_shared<AugmentedConversation>(repoPath / "conversation", *this);
}

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
    // open repo
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
            auto limit = kernelServer.getSearchLimit();
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

//--------------------------AugmentedConversaion--------------------------//
Session::AugmentedConversation::AugmentedConversation(std::filesystem::path historyDirPath, Session& session) : historyDirPath(historyDirPath), session(session)
{
    if(!std::filesystem::exists(historyDirPath))
    {
        std::filesystem::create_directories(historyDirPath);
    }
}

Session::AugmentedConversation::~AugmentedConversation()
{
    if(conversation)
    {
        stopConversation();
    }
    if(conversationThread.joinable())
    {
        conversationThread.join();
    }
}

void Session::AugmentedConversation::conversationProcess()
{
    while(!shutdownFlag)
    {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [this](){ 
            return shutdownFlag.load() || conversation; 
        });
        if(shutdownFlag)
            break;

        // read history from disk if exists
        HistoryManager historyManager(*this);
        conversation->importHistory(historyManager.getHistoryMessages());

        // 1. understand and generate the search words
        conversation->setOptions("max_tokens", "200");
        conversation->setOptions("stop", std::vector<std::string>{"```\n"});
        std::string understandPrompt = R"(
        You are a search query optimizer. Generate the most effective search keywords for retrieving information about this question. Return ONLY the search terms without explanation.
        )";
        conversation->setMessage("system", understandPrompt);
        conversation->setMessage("user", query + "\n```search\n");
        auto searchWord = conversation->getResponse();
        if (shutdownFlag)
            break;
        auto searchWords = Utils::splitLine(searchWord);
        int searchCount = 0;
        // recursive search
        while(searchCount < 3 && !searchWords.empty())
        {
            // 2. search the documents
            historyManager.beginRetrieval("Retrieving information: " + std::to_string(searchCount));
            std::string toolContent = "```retieved_information\n";
            for (auto &word : searchWords)
            {
                historyManager.push(Type::search, word);
                auto results = session.repository->search(word, Repository::searchAccuracy::high, std::max(1ULL, 10 / searchWords.size()));
                for (auto &result : results)
                {
                    toolContent += "[content]\n" + result.content + "\n";
                    toolContent += "[metadata]\n" + result.metadata + "\n";
                    historyManager.push(Type::result, result);
                }
                if (shutdownFlag)
                    break;
            }
            toolContent += "```\n";
            if (shutdownFlag)
                break;
            historyManager.endRetrieval();
            // 3. evaluate the search results
            std::string evaluatePrompt = R"(
            Assess if the retrieved information is sufficient to answer the original question.
            If the information is sufficient, respond with "YES". If not, respond with "NO" and provide additional query words to improve the search results. The query word should be in the format of "```search".
            )";
            conversation->setOptions("max_tokens", "500");
            conversation->setMessage("system", evaluatePrompt);
            conversation->setMessage("user", query + "\n");
            conversation->setMessage("tool", toolContent);
            auto evaluateResult = conversation->getResponse();
            if (shutdownFlag)
                break;
            // parser answer
            bool hasYes = evaluateResult.find("YES") != std::string::npos;
            bool hasNo = evaluateResult.find("NO") != std::string::npos;
            searchWords = Utils::splitLine(extractSearchword(evaluateResult));
            if (!hasNo || hasYes)
            {
                break; // sufficient
            }
            searchCount++;
        }
        if(shutdownFlag)
            break;
        // 4. generate the final answer
        conversation->setOptions("max_tokens", "2000");
        conversation->setOptions("stop", std::vector<std::string>{});
        std::string answerPrompt = R"(
        Answer based only on the provided information above. Acknowledge limitations if information is insufficient.
        )";
        conversation->setMessage("system", answerPrompt);
        conversation->setMessage("user", query + "\n");
        auto answer = conversation->getStreamResponse([this](const std::string &response) {
            this->sendBack(response, Type::answer);
        });
        historyManager.push(Type::answer, answer);
    }
}

std::string Session::AugmentedConversation::extractSearchword(const std::string &answer)
{
    auto iterQuery = answer.find("```search");
    if(iterQuery == std::string::npos)
        return "";
    auto iterEnd = answer.find("```", iterQuery);
    if(iterEnd == std::string::npos)
        return "";
    return answer.substr(iterQuery + 8, iterEnd - iterQuery - 8);
}

void Session::AugmentedConversation::openConversation(std::shared_ptr<LLMConv> conv, std::function<void(std::string, Type)> sendBack, std::string prompt, int conversationId)
{
    stopConversation();
    conversation = conv;
    this->sendBack = sendBack;
    shutdownFlag = false;
    this->conversationId = conversationId;
    this->query = prompt;
    conversationThread = std::thread(&Session::AugmentedConversation::conversationProcess, this);
}

void Session::AugmentedConversation::stopConversation()
{
    shutdownFlag = true;
    if(conversation)
    {
        conversation->stopConnection();
    }
    cv.notify_all();
    if(conversationThread.joinable())
    {
        conversationThread.join();
    }
}
