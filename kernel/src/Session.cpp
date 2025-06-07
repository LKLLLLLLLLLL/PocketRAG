#include "Session.h"
#include "KernelServer.h"
#include "LLMConv.h"
#include "Repository.h"
#include "Utils.h"
#include <exception>
#include <memory>
#include <mutex>
#include <algorithm>
#include <nlohmann/json_fwd.hpp>

//--------------------------Session--------------------------//
void Session::docStateReporter(std::vector<std::string> docs)
{
    for (const auto &doc : docs)
    {
        nlohmann::json json;
        json["message"]["type"] = "embeddingStatus";
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
    json["message"]["type"] = "embeddingStatus";
    json["message"]["filePath"] = path;
    json["message"]["status"] = "embedding";
    json["message"]["progress"] = progress;

    json["toMain"] = false;
    send(json, nullptr);
}

void Session::doneReporter(std::string path)
{
    nlohmann::json json;
    json["message"]["type"] = "embeddingStatus";
    json["message"]["filePath"] = path;
    json["message"]["status"] = "done";
    json["message"]["progress"] = 1.0;

    json["toMain"] = false;
    send(json, nullptr);
}

// lazy initialization
Session::Session(int64_t sessionId, std::string repoName, std::filesystem::path repoPath, KernelServer &kernelServer) : sessionId(sessionId), kernelServer(kernelServer), repoName(repoName), repoPath(repoPath)
{
    conversation = std::make_shared<AugmentedConversation>(repoPath / ".PocketRAG" / "conversation", *this);
    lastprintTime.store(std::chrono::steady_clock::now());
}

Session::~Session()
{}

void Session::sendBack(nlohmann::json &json, std::shared_ptr<Utils::Timer> msgTimer)
{
    json["isReply"] = true;
    auto message = std::make_shared<Utils::MessageQueue::Message>(sessionId, std::move(json), msgTimer);
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

void Session::execCallback(nlohmann::json &json, int64_t callbackId)
{
    callbackManager->callCallback(callbackId, json);
}

void Session::run(std::function<bool()> stopFlag, Utils::WorkerThread &parent)
{
    Utils::Timer timer("Session " + std::to_string(sessionId) + " started");
    // open repo
    auto docStateReporter_wrap = [this](std::vector<std::string> docs) { docStateReporter(docs); };
    auto progressReporter_wrap = [this](std::string path, double progress) { progressReporter(path, progress); };
    auto doneReporter_wrap = [this](std::string path) { doneReporter(path); };
    auto errorCallback = [this](std::exception_ptr e) {
        {
            std::lock_guard<std::mutex> lock(errorMutex);
            repoThreadError = e;
        }
        sessionMessageQueue->shutdown();
        Utils::WorkerThread::getCurrentThread()->notify();
    };
    auto [maxThreads, device] = kernelServer.getPerfConfig();
    repository = std::make_shared<Repository>(repoName, repoPath, mutex, maxThreads, device, errorCallback, docStateReporter_wrap, progressReporter_wrap, doneReporter_wrap);
    config();
    // initialize sqlite
    auto dbPath = repoPath / ".PocketRAG" / "db";
    sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);
    initializeSqlite();
    // send done message
    nlohmann::json json;
    json["toMain"] = false;
    json["message"]["type"] = "sessionPrepared";
    auto [repoName, repoPath] = repository->getRepoNameAndPath();
    json["message"]["repoName"] = repoName;
    json["message"]["path"] = repoPath;
    send(json, nullptr);
    timer.stop();
    // handle messages
    logger.info("[Session] Session " + std::to_string(sessionId) + "(repoName:" + repoName + ") started.");
    std::shared_ptr<Utils::MessageQueue::Message> message = nullptr;
    while (true)
    {
        message = sessionMessageQueue->popWithCv(&parent.getNoticeCv(), 
            [&stopFlag, &parent]()
            {
                return parent.hasNotice() || stopFlag();
            }
        );
        if(stopFlag())
        {
            break;
        }
        {
            std::lock_guard<std::mutex> lock(errorMutex);
            if (repoThreadError)
            {
                auto error = repoThreadError;
                repoThreadError = nullptr;
                std::rethrow_exception(error);
            }
        }
        if(message)
        {
            handleMessage(*message);
            message = nullptr;
        }
    }
    logger.info("[Session] Session " + std::to_string(sessionId) + "(repoName:" + repoName + ") quitted.");
}

void Session::handleMessage(Utils::MessageQueue::Message &message)
{
    auto& json = message.data;
    auto js = json.dump(); // for debug
    try 
    {
        bool isReply = message.data["isReply"].get<bool>();
        if (isReply) 
        {
            execCallback(message.data, message.data["callbackId"].get<int64_t>());
            return;
        }
        auto type = message.data["message"]["type"].get<std::string>();
        if (type == "search") 
        {
            auto query = message.data["message"]["query"].get<std::string>();
            auto limit = kernelServer.getSearchLimit();
            auto acc = message.data["message"]["accuracy"].get<bool>();
            auto accuracy = acc ? Repository::searchAccuracy::high : Repository::searchAccuracy::low;
            auto results = repository->search(query, accuracy, limit);
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
            json["data"] = nlohmann::json::object();
            json["data"]["results"] = resultsJson;
            json["data"]["type"] = "result";
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        } 
        else if(type == "beginConversation") 
        {
            auto modelName = message.data["message"]["modelName"].get<std::string>();
            auto conversationId = message.data["message"]["conversationId"].get<int64_t>();
            auto query = message.data["message"]["query"].get<std::string>();
            nlohmann::json json_copy = message.data;
            std::shared_ptr jsonPtr = std::make_shared<nlohmann::json>(json_copy);
            auto sendBack = [this, jsonPtr](const std::string &response, AugmentedConversation::Type type) {
                std::string typeStr;
                bool errorFlag = false;
                std::string errorType = "";
                std::string errorMsg = "";
                switch (type)
                {
                case AugmentedConversation::Type::search:
                    typeStr = "search";
                    break;
                case AugmentedConversation::Type::result:
                    typeStr = "result";
                    break;
                case AugmentedConversation::Type::answer:
                    typeStr = "answer";
                    break;
                case AugmentedConversation::Type::annotation:
                    typeStr = "annotation";
                    break;
                case AugmentedConversation::Type::doneRetrieval:
                    typeStr = "doneRetrieval";
                    break;
                case AugmentedConversation::Type::done:
                    typeStr = "done";
                    break;
                case AugmentedConversation::Type::networkError:
                    errorFlag = true;
                    errorType = "NETWORK_ERROR";
                    errorMsg = response;
                    break;
                case AugmentedConversation::Type::unknownError:
                    errorFlag = true;
                    errorType = "UNKNOWN_ERROR";
                    errorMsg = response;
                    break;
                default:
                    throw Error{"Wrong type of history", Error::Type::Internal};
                }
                nlohmann::json json = *jsonPtr;
                if(errorFlag)
                {
                    json["status"]["code"] = errorType;
                    json["status"]["message"] = errorMsg;
                    this->sendBack(json);
                    return;
                }
                json["data"] = nlohmann::json::object();
                json["data"]["type"] = typeStr;
                if (type != AugmentedConversation::Type::result)
                {
                    json["data"]["content"] = response;
                }
                else
                {
                    json["data"]["content"] = nlohmann::json::parse(response);
                }
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
                this->sendBack(json);
            };
            try
            {
                conversation->openConversation(kernelServer.getLLMConv(modelName), sendBack, query, conversationId, kernelServer.getHistoryLength());
                json["status"]["code"] = "SUCCESS";
                json["status"]["message"] = "";
            }
            catch (std::exception &e)
            {
                json["status"]["code"] = "NETWORK_ERROR";
                json["status"]["message"] = "Network error: " + std::string(e.what());
            }
        } 
        else if(type == "stopConversation") 
        {
            conversation->stopConversation();
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        } 
        else if(type == "config") 
        {
            config();
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        }
        else if(type == "getApiUsage")
        {
            Utils::LockGuard lock(mutex, true, false);
            auto stmt = sqlite->getStatement(
                "SELECT SUM(input_token), SUM(output_token), generation_model "
                "FROM turn "
                "GROUP BY generation_model;"
            );
            nlohmann::json apiUsageJson = nlohmann::json::array();
            while (stmt.step())
            {
                nlohmann::json apiUsage;
                apiUsage["input_token"] = stmt.get<int64_t>(0);
                apiUsage["output_token"] = stmt.get<int64_t>(1);
                apiUsage["total_token"] = apiUsage["input_token"].get<int64_t>() + apiUsage["output_token"].get<int64_t>();
                apiUsage["model_name"] = stmt.get<std::string>(2);
                apiUsageJson.push_back(apiUsage);
            }
            json["data"]["apiUsage"] = apiUsageJson;

            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        }
        else if(type == "getChunksInfo")
        {
            Utils::LockGuard lock(mutex, true, false);
            auto stmt = sqlite->getStatement(
                "SELECT c.chunk_id, c.begin_line, c.end_line, d.doc_path, e.config_name, t.content, t.metadata "
                "FROM chunks c, text_search t, documents d, embedding_config e "
                "WHERE c.chunk_id = t.chunkId AND c.doc_id = d.id AND c.embedding_id = e.id;"
            );
            nlohmann::json chunksInfoJson = nlohmann::json::array();
            while (stmt.step())
            {
                nlohmann::json chunkInfo;
                chunkInfo["chunkId"] = stmt.get<int64_t>(0);
                chunkInfo["beginLine"] = stmt.get<int>(1);
                chunkInfo["endLine"] = stmt.get<int>(2);
                chunkInfo["filePath"] = stmt.get<std::string>(3);
                chunkInfo["embeddingName"] = stmt.get<std::string>(4);
                chunkInfo["content"] = stmt.get<std::string>(5);
                chunkInfo["metadata"] = stmt.get<std::string>(6);
                chunksInfoJson.push_back(chunkInfo);
            }
            json["data"]["chunkInfo"] = chunksInfoJson;
            json["status"]["code"] = "SUCCESS";
            json["status"]["message"] = "";
        }
        else 
        {
            json["status"]["code"] = "INVALID_TYPE";
            json["status"]["message"] = "Invalid message type: " + type;
        }
    } 
    catch (nlohmann::json::exception& e) 
    {
        json["status"]["code"] = "WRONG_PARAM";
        json["status"]["message"] =
            "Invalid message format, parser error: " + std::string(e.what());
    } 
    catch (std::exception &e) 
    {
        json["status"]["code"] = "UNKNOWN_ERROR";
        json["status"]["message"] = "Unknown error: " + std::string(e.what());
    }
    sendBack(json, message.timer);
}

void Session::initializeSqlite()
{
    Utils::LockGuard lock(mutex, true, true);
    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS turn(" // store one Q and A pair
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "conversation_id INTEGER, " // conversation id
        "generation_model TEXT, " // model name
        "input_token INTEGER, " // input token count
        "output_token INTEGER, " // output token count
        "time INTEGER);" // timestamp
    );

    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS reference(" // store reference relationship between turns and chunks
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "turn_id INTEGER, "
        "chunk_id INTEGER, "
        "retrieval_index INTEGER, " 
        "valid BOOLEAN DEFAULT 1, "  // to mark if chunk changed
        "FOREIGN KEY(turn_id) REFERENCES turn(id) ON DELETE CASCADE, "
        "FOREIGN KEY(chunk_id) REFERENCES chunks(chunk_id)"
        ");"
    );

    // Trigger for UPDATE operations on chunks table
    sqlite->execute(
        "CREATE TRIGGER IF NOT EXISTS chunk_update "
        "AFTER UPDATE ON chunks "
        "FOR EACH ROW "
        "BEGIN "
        "   UPDATE reference "
        "   SET valid = 0 "
        "   WHERE chunk_id = OLD.chunk_id;"
        "END;"
    );

    // Trigger for DELETE operations on chunks table
    sqlite->execute(
        "CREATE TRIGGER IF NOT EXISTS chunk_delete "
        "AFTER DELETE ON chunks "
        "FOR EACH ROW "
        "BEGIN "
        "   UPDATE reference "
        "   SET valid = 0 "
        "   WHERE chunk_id = OLD.chunk_id;"
        "END;"
    );

    sqlite->execute(
        "CREATE TABLE IF NOT EXISTS conversation("
        "id INTEGER PRIMARY KEY, "
        "topic TEXT, "
        "file_path TEXT);" // file which stores full history
    );

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
    stopConversation();
}

void Session::AugmentedConversation::conversationProcess(std::function<bool()> stopFlag)
{
    HistoryManager historyManager(*this); // defiene history manager to make sure its destructor is called at the end of conversation
    LLMConv::TokenUsage tokenUsage = {0, 0, 0};
    try
    {
        logger.info("[Conversation] Conversation id" + std::to_string(conversationId) + " thread started.");
        if(stopFlag())
            return;

        // read history from disk if exists
        conversation->importHistory(historyManager.getHistoryMessages());

        // 1. understand and generate the search words
        conversation->setOptions("max_tokens", 200);
        conversation->setOptions("stop", std::vector<std::string>{"```\n"});
        std::string understandPrompt = R"(
You are a search query optimizer. Generate the most effective search keywords for retrieving information about this question. Return ONLY the search terms without explanation, and end with "```".)";
        conversation->setMessage("system", understandPrompt);
        conversation->setMessage("user", query + "\n```search\n");
        auto searchWord = conversation->getResponse();
        tokenUsage = tokenUsage + conversation->getLastResponseUsage();
        auto searchWords = Utils::splitLine(extractSearchword(searchWord));
        int searchCount = 0;
        // recursive search
        while(searchCount < 3 && !searchWords.empty())
        {
            // 2. search the documents
            historyManager.beginRetrieval("Retrieving information: " + std::to_string(searchCount + 1));
            if (stopFlag())
                return;
            std::string toolContent = "```retieved_information\n";
            std::unordered_set<int64_t> chunkIds{}; // to avoid duplicate chunks
            for (auto &word : searchWords)
            {
                historyManager.push(Type::search, word);
                auto results = session.repository->search(word, Repository::searchAccuracy::high, std::max(static_cast<size_t>(1), 10 / searchWords.size()));
                for (auto &result : results)
                {
                    if(chunkIds.find(result.chunkId) != chunkIds.end())
                        continue;
                    toolContent += "[content]\n" + result.content + "\n";
                    toolContent += "[metadata]\n" + result.metadata + "\n";
                    historyManager.push(Type::result, result);
                    chunkIds.insert(result.chunkId);
                }
                if (stopFlag())
                    return;
            }
            toolContent += "```\n";
            historyManager.endRetrieval();
            // 3. evaluate the search results
            std::string evaluatePrompt = R"(
Assess if the retrieved information is sufficient to answer the original question.
If the information is sufficient, respond with "YES". If not, respond with "NO" and provide additional query words to improve the search results. The query word should be in the begin with "```search" and end with "```".)";
            conversation->setOptions("max_tokens", 500);
            conversation->setMessage("system", evaluatePrompt);
            conversation->setMessage("user", query + "\n");
            conversation->setMessage("user", toolContent);
            auto evaluateResult = conversation->getResponse();
            tokenUsage = tokenUsage + conversation->getLastResponseUsage();
            // parser answer
            bool hasYes = evaluateResult.find("YES") != std::string::npos;
            bool hasNo = evaluateResult.find("NO") != std::string::npos;
            searchWords = Utils::splitLine(extractSearchword(evaluateResult));
            if (!hasNo && hasYes)
            {
                break; // sufficient
            }
            searchCount++;
        }
        if(stopFlag())
            return;
        // 4. generate the final answer
        conversation->setOptions("max_tokens", 2000);
        conversation->setOptions("stop", std::vector<std::string>{});
        std::string answerPrompt = R"(
Retrieval phase is done, DO NOT give more search words, Answer the question based on the provided information above, Acknowledge limitations if information is insufficient.)";
        conversation->setMessage("system", answerPrompt);
        conversation->setMessage("user", query + "\n");
        auto answer = conversation->getStreamResponse([this](const std::string &response) {
            this->sendBack(response, Type::answer);
        });
        tokenUsage = tokenUsage + conversation->getLastResponseUsage();
        historyManager.push(Type::answer, answer);
    }
    catch (const Error& e)
    {
        if(e.getType() == Error::Type::Network)
        {
            sendBack(e.what(), Type::networkError);
        }
        else
        {
            sendBack(e.what(), Type::unknownError);
        }
    }
    historyManager.setTokenUsage(tokenUsage);
    logger.debug("[Conversation] Conversation used " + std::to_string(tokenUsage.prompt_tokens) + " prompt tokens, " +
                 std::to_string(tokenUsage.completion_tokens) + " completion tokens, " +
                 std::to_string(tokenUsage.total_tokens) + " total tokens.");
}

std::string Session::AugmentedConversation::extractSearchword(const std::string &answer)
{
    auto iterQuery = answer.find("```search");
    if (iterQuery == std::string::npos)
        iterQuery = 0;
    else
        iterQuery += 9; // skip "```search"
    auto iterEnd = answer.find("```", iterQuery);
    if (iterEnd == std::string::npos)
        iterEnd = answer.size();
    return answer.substr(iterQuery, iterEnd - iterQuery);
}

void Session::AugmentedConversation::openConversation(std::shared_ptr<LLMConv> conv, std::function<void(std::string, Type)> sendBack, std::string prompt, int64_t conversationId, int historyLength)
{
    conversation = conv;
    this->sendBack = sendBack;
    this->conversationId = conversationId;
    this->query = prompt;
    this->maxHistoryLength = historyLength;
    if (conversationThread && conversationThread->isActive())
    {
        conversationThread->start();
        return;
    }
    conversationThread = std::make_shared<Utils::WorkerThread>(
        "Conversaion_" + std::to_string(conversationId),
        [this](std::function<bool()> stopFlag, Utils::WorkerThread &_) {
            conversationProcess(stopFlag); // no need to use condition_variable here
        },
        nullptr);
    conversationThread->start();
}

void Session::AugmentedConversation::stopConversation()
{
    if(conversation)
    {
        conversation->stopConnection();
    }
    if(conversationThread)
    {
        conversationThread->pause();
    }
}

Session::AugmentedConversation::HistoryManager::HistoryManager(AugmentedConversation &parent)
    : parent(parent), tempJson(nlohmann::json::object())
{
    // load history file
    historyFilePath = parent.historyDirPath / ("conversation-" + std::to_string(parent.conversationId) + ".json");
    if (std::filesystem::exists(historyFilePath))
    {
        historyJson = Utils::readJsonFile(historyFilePath);
        logger.info("[Conversation] Loaded history file at " + historyFilePath.string());
    }
    else
    {
        historyJson["history"] = nlohmann::json::array();
        historyJson["conversationId"] = parent.conversationId;
        historyJson["topic"] = parent.query;
        std::ofstream file(historyFilePath);
        if (!file.is_open())
        {
            logger.warning("[Conversation] Error opening history file at " + historyFilePath.string() +
                           ". Using empty history, and will write above history file.");
            return;
        }
        file << historyJson.dump(4);
        logger.info("[Conversation] Created history file at " + historyFilePath.string());
    }
    // load full history file
    fullHistoryFilePath = parent.historyDirPath / ("conversation-" + std::to_string(parent.conversationId) + "_full.json");
    if (std::filesystem::exists(fullHistoryFilePath))
    {
        historyMessagesJson = Utils::readJsonFile(fullHistoryFilePath);
        logger.info("[Conversation] Loaded full history file at " + fullHistoryFilePath.string());
    }
    else
    {
        historyMessagesJson = {};
    }
    try
    {
        int historyLength = 0;
        for(auto it = historyMessagesJson.rbegin(); it != historyMessagesJson.rend(); it++)
        {
            auto message = *it;
            auto role = message["role"].get<std::string>();
            auto content = message["content"].get<std::string>();
            historyMessages.push_back({role, content});
            historyLength += content.size();
            if (parent.maxHistoryLength != 0 && historyLength > parent.maxHistoryLength)
            {
                break;
            }
        }
        std::reverse(historyMessages.begin(), historyMessages.end());
    }
    catch (nlohmann::json::exception &e)
    {
        logger.warning("[Conversation] Error parsing full history file at " + fullHistoryFilePath.string() +
                       ". Using empty history for conversation and will write above  full history file.");
    }
    conversationJson = nlohmann::json::object();
    conversationJson["query"] = parent.query;

    // update sqlite
    try
    {
        Utils::LockGuard lock(parent.session.mutex, true, true);
        auto stmt = parent.session.sqlite->getStatement(
            "INSERT OR REPLACE INTO conversation (id, topic, file_path) "
            "VALUES (?, ?, ?)");

        std::string filePath = historyFilePath.string();
        int64_t currentTime = Utils::getTimeStamp();

        stmt.bind(1, parent.conversationId);
        stmt.bind(2, parent.query);
        stmt.bind(3, filePath);
        stmt.step();
    }
    catch (const std::exception &e)
    {
        logger.warning("[Conversation] Failed to record conversation in database: " + std::string(e.what()));
    }
}

Session::AugmentedConversation::HistoryManager::~HistoryManager()
{
    logger.info("[Conversation] Conversation id" + std::to_string(parent.conversationId) +
                " thread quitted."); // deconstruct of history manager indicates cconversation thread has quitted
    parent.sendBack("", Type::done);
    conversationJson["time"] = Utils::getTimeStamp();
    // write history file
    std::ofstream file(historyFilePath);
    if (!file.is_open())
    {
        logger.warning("[Conversation] Error opening history file for writing at " + historyFilePath.string() +
                       ". History will not be saved.");
        return;
    }
    historyJson["history"].push_back(conversationJson);
    file << historyJson.dump(4);
    logger.info("[Conversation] Saved history file at " + historyFilePath.string());
    // write full history file
    historyMessages = parent.conversation->exportHistory();
    historyMessagesJson = nlohmann::json::array();
    for (auto &message : historyMessages)
    {
        nlohmann::json messageJson = nlohmann::json::object();
        messageJson["role"] = message.role;
        messageJson["content"] = message.content;
        historyMessagesJson.push_back(messageJson);
    }
    std::ofstream fullFile(fullHistoryFilePath);
    if (!fullFile.is_open())
    {
        logger.warning("[Conversation] Error opening full history file for writing at " + fullHistoryFilePath.string() +
                       ". Full history will not be saved.");
        return;
    }
    fullFile << historyMessagesJson.dump(4);
    logger.info("[Conversation] Saved full history file at " + fullHistoryFilePath.string());

    // update sqlite
    try
    {
        Utils::LockGuard lock(parent.session.mutex, true, true);
        // 1. create turn record
        int64_t currentTime = Utils::getTimeStamp();
        auto insertTurnStmt = parent.session.sqlite->getStatement(
            "INSERT INTO turn (conversation_id, generation_model, input_token, output_token, time) "
            "VALUES (?, ?, ?, ?, ?)");

        insertTurnStmt.bind(1, parent.conversationId);
        insertTurnStmt.bind(2, parent.conversation->getModelName());
        insertTurnStmt.bind(3, tokenUsage.prompt_tokens);
        insertTurnStmt.bind(4, tokenUsage.completion_tokens);
        insertTurnStmt.bind(5, currentTime);

        insertTurnStmt.step();
        int64_t turnId = parent.session.sqlite->getLastInsertId();

        // 2. extract chunk_id from conversation json
        if (conversationJson.contains("retrieval") && conversationJson["retrieval"].is_array())
        {
            for(auto i = 0; i < conversationJson["retrieval"].size(); i++)
            {
                auto retrieval = conversationJson["retrieval"][i];
                if (!retrieval.contains("result") && retrieval["result"].is_array())
                {
                    continue;
                }
                for (const auto &result : retrieval["result"])
                {
                    if (!result.contains("chunkId"))
                    {
                        continue;
                    }
                    auto chunkId = result["chunkId"].get<int64_t>();
                    // 3. create reference record
                    auto insertReferenceStmt = parent.session.sqlite->getStatement(
                        "INSERT INTO reference (turn_id, chunk_id, retrieval_index) "
                        "VALUES (?, ?, ?)");

                    insertReferenceStmt.bind(1, turnId);
                    insertReferenceStmt.bind(2, chunkId);
                    insertReferenceStmt.bind(3, i);
                    insertReferenceStmt.step();
                }
            }
        }
    }
    catch (const std::exception &e)
    {
        logger.warning("[Conversation] Failed to write conversation data to database: " + std::string(e.what()));
    }
}

std::vector<LLMConv::Message> Session::AugmentedConversation::HistoryManager::getHistoryMessages()
{
    return historyMessages;
}

void Session::AugmentedConversation::HistoryManager::push(Type type, const std::string &content)
{
    switch (type)
    {
    case AugmentedConversation::Type::search:
        if (!tempJson.contains("search"))
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
    case AugmentedConversation::Type::done:
        parent.sendBack("", Type::done);
        break;
    default:
        throw Error{"Wrong type of history", Error::Type::Internal};
    }
}

void Session::AugmentedConversation::HistoryManager::push(Type type, const Repository::SearchResult &result)
{
    if (type != Type::result)
        throw Error{"Wrong type of history", Error::Type::Internal};
    if (!tempJson.contains("result"))
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
    resultJson["chunkId"] = result.chunkId;
    parent.sendBack(resultJson.dump(), Type::result);
    tempJson["result"].push_back(resultJson);
}

void Session::AugmentedConversation::HistoryManager::beginRetrieval(const std::string &annotation)
{
    tempJson["annotation"] = annotation;
    parent.sendBack(annotation, Type::annotation);
}

// push search and result into one retrieval object
void Session::AugmentedConversation::HistoryManager::endRetrieval()
{
    if (!conversationJson.contains("retrieval"))
    {
        conversationJson["retrieval"] = nlohmann::json::array();
    }
    conversationJson["retrieval"].push_back(tempJson);
    tempJson = nlohmann::json::object();
    parent.sendBack("", Type::doneRetrieval);
}
