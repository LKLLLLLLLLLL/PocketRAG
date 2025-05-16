#pragma once
#include <condition_variable>
#include <iostream>
#include <memory>
#include <string>
#include <thread>

#include "Repository.h"
#include "LLMConv.h"
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

    class AugmentedConversation;
    std::shared_ptr<AugmentedConversation> conversation = nullptr; // conversation instance

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

    // called by kernel server
    void sendMessage(const std::shared_ptr<Utils::MessageQueue::Message>& message);
};

class Session::AugmentedConversation
{
public:
    enum class Type{search, result, answer, annotation, doneRetrieval, done}; // type of this message
private:
    std::shared_ptr<LLMConv> conversation = nullptr; // conversation instance
    const std::filesystem::path historyDirPath;     // conversation path
    std::string query;
    int conversationId; // conversation id
    
    Session& session;
    std::function<void(std::string, Type)> sendBack = nullptr;

    std::condition_variable cv;
    std::mutex mtx;
    std::atomic<bool> shutdownFlag = false;
    std::thread conversationThread;

    void conversationProcess();

    static std::string extractSearchword(const std::string& answer);
    struct HistoryManager;
    friend struct HistoryManager;
public:
    AugmentedConversation(std::filesystem::path historyDirPath, Session& session);
    ~AugmentedConversation();
    // open a new conversation
    void openConversation(std::shared_ptr<LLMConv> conv, std::function<void(std::string, Type)> sendBack, std::string prompt, int conversationId);
    // stop conversation thread and clear conversation
    void stopConversation();
};


/*
This class will save history to disk and call sendBack function to send message to frontend.
*/
class Session::AugmentedConversation::HistoryManager
{
private:
    nlohmann::json historyJson;
    nlohmann::json conversationJson;
    nlohmann::json tempJson;
    AugmentedConversation &parent;
    std::vector<LLMConv::Message> historyMessages;

public:

    HistoryManager(AugmentedConversation &parent) : parent(parent), tempJson(nlohmann::json::object())
    {
        std::filesystem::path historyFilePath =
            parent.historyDirPath / (std::to_string(parent.conversationId) + ".json");
        if (std::filesystem::exists(historyFilePath))
        {
            historyJson = Utils::readJsonFile(historyFilePath);
        }
        else
        {
            historyJson["history"] = nlohmann::json::array();
            historyJson["conversationId"] = parent.conversationId;
            historyJson["topic"] = parent.query;
            std::ofstream file(historyFilePath);
            file << historyJson.dump(4);
        }
        try
        {
            auto history = historyJson["history"];
            for (auto &item : history)
            {
                historyMessages.push_back({"user", item["query"].get<std::string>()});
                for(auto& retrieval : item["retrieval"])
                {
                    if (retrieval.contains("search"))
                    {
                        std::string keywords = "";
                        for (auto &keyword : retrieval["search"])
                        {
                            keywords += keyword.get<std::string>() + "\n";
                        }
                        historyMessages.push_back({"assistant", "```search\n" + keywords + "```"});
                    }
                    if (retrieval.contains("result"))
                    {
                        std::string result = "";
                        for (auto &r : retrieval["result"])
                        {
                            result += "[content]\n" + r["content"].get<std::string>() + "\n";
                            result += "[metadata]\n" + r["metadata"].get<std::string>() + "\n";
                        }
                        historyMessages.push_back({"tool", "```retieved_information\n" + result + "```"});
                    }
                }
                if (item.contains("answer"))
                {
                    historyMessages.push_back({"assistant", "```answer\n" + item["answer"].get<std::string>() + "```"});
                }
            }
        }
        catch (nlohmann::json::exception &e)
        {
            std::cerr << "Error parsing history file: " << e.what() << std::endl;
            std::cerr << "Using empty history for conversation and will Write above history file." << std::endl;
        }
        conversationJson = nlohmann::json::object();
        conversationJson["query"] = parent.query;
    }

    ~HistoryManager()
    {
        parent.sendBack("", Type::done);
        conversationJson["time"] = Utils::getTimeStamp();
        std::filesystem::path historyFilePath = parent.historyDirPath / (std::to_string(parent.conversationId) + ".json");
        std::ofstream file(historyFilePath);
        if(!file.is_open())
        {
            std::cerr << "Error opening history file for writing: " << historyFilePath << std::endl;
            std::cerr << "History will not be saved." << std::endl;
            return;
        }
        historyJson["history"].push_back(conversationJson);
        file << historyJson.dump(4);
    }

    std::vector<LLMConv::Message> getHistoryMessages()
    {
        return historyMessages;
    }

    void push(Type type, const std::string &content)
    {
        switch(type)
        {
        case AugmentedConversation::Type::search:
            if(!tempJson.contains("search"))
            {
                tempJson["search"] = nlohmann::json::array();
            }
            tempJson["search"].push_back(content);
            parent.sendBack(content, Type::search);
            break;
        case AugmentedConversation::Type::answer:
            conversationJson["answer"] = content;
            // parent.sendBack(content, Type::answer); // send back by stream callback, no need to send back here
            break;
        default:
            throw std::runtime_error("Wrong type of history");
        }
    }

    void push(Type type, const Repository::SearchResult &result)
    {
        if (type != Type::result)
            throw std::runtime_error("Wrong type of history");
        if(!tempJson.contains("result"))
        {
            tempJson["result"] = nlohmann::json::array();
        }
        nlohmann::json resultJson = nlohmann::json::object();
        resultJson["content"] = result.content;
        resultJson["metadata"] = result.metadata;
        resultJson["filePath"] = result.filePath;
        resultJson["beginLine"] = result.beginLine;
        resultJson["endLine"] = result.endLine;
        resultJson["score"] = result.score;
        parent.sendBack(resultJson.dump(), Type::result);
        tempJson["result"].push_back(resultJson);
    }

    void beginRetrieval(const std::string &annotation)
    {
        tempJson["annotation"] = annotation;
        parent.sendBack(annotation, Type::annotation);
    }

    // push search and result into one retrieval object
    void endRetrieval()
    {
        if (!conversationJson.contains("retrieval"))
        {
            conversationJson["retrieval"] = nlohmann::json::array();
        }
        conversationJson["retrieval"].push_back(tempJson);
        tempJson = nlohmann::json::object();
        parent.sendBack("", Type::doneRetrieval);
    }
};