#pragma once
#include <filesystem>
#include <string>
#include <functional>
#include <mutex>
#include <queue>
namespace xxhash
{
    #include <xxhash.h>
}
#include <nlohmann/json.hpp>

/*
This file contains utility functions for the project.
*/
namespace Utils
{
    // calculate the hash using XXHash algorithm
    std::string calculatedocHash(const std::filesystem::path &path);
    // calculate the hash of a string using XXHash algorithm
    std::string calculateHash(const std::string &content);

    // Convert wstring to string
    std::string wstring_to_string(const std::wstring &wstr);
    // Convert string to wstring
    std::wstring string_to_wstring(const std::string &str);

    // helper function to normalize line endings
    std::string normalizeLineEndings(const std::string &input);

    // set console to UTF-8 to avoid garbled characters
    void setup_utf8_console();

    // return a int timestamp, seconds since epoch
    int getTimeStamp();

    int randomInt(int min, int max);

    float sigmoid(float x);

    // convert chunk content and metadata to a sequence which can be used by models
    std::string chunkTosequence(const std::string& content, const std::string& metadata);

    std::string toLower(const std::string& str);

    // calculate the number of characters encoded in UTF-8
    int utf8Length(const std::string& str);

    // a thread-safe callback manager
    class CallbackManager
    {
    public:
        using Callback = std::function<void(nlohmann::json &)>;

    private:
        std::unordered_map<int, Callback> callbacks;
        std::mutex mutex;

    public:
        // regoister a callback function and return its callback id
        int registerCallback(const Callback &callback);

        void callCallback(int callbackId, nlohmann::json &message);
    };

    // a thread-safe message queue
    class MessageQueue
    {
    public:
        struct Message
        {
            // enum class Type{send, receive} type; // send to frontend or receive from frontend
            int sessionId; // -1 - KernelServer, others - Session ID
            nlohmann::json data;
            // CallbackManager::Callback callback = nullptr;
        };
    private:
        std::queue<std::shared_ptr<Message>> queue;
        std::mutex mutex;
        std::condition_variable conditionVariable;
        std::atomic<bool> shutdownFlag = false;

    public:
        void push(const std::shared_ptr<Message> &message);

        // block until a message is available
        std::shared_ptr<Message> pop();

        bool empty();

        // wake all waiting threads and pop() will exit with nullptr
        void shutdown();
    };
}