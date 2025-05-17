#pragma once
#include <filesystem>
#include <string>
#include <functional>
#include <mutex>
#include <queue>
#include <random>
#include <iostream>
#include <fstream>
#include <source_location>
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

    // generate a random integer between min and max
    inline int randomInt(int min, int max)
    {
        static std::random_device rd;
        static std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(min, max);
        return dis(gen);
    }

    inline float sigmoid(float x)
    {
        return 1.0f / (1.0f + std::exp(-x));
    }

    // convert chunk content and metadata to a sequence which can be used by models
    std::string chunkTosequence(const std::string& content, const std::string& metadata);

    std::string toLower(const std::string& str);

    // calculate the number of characters encoded in UTF-8
    inline int utf8Length(const std::string &str)
    {
        return std::count_if(str.begin(), str.end(), [](unsigned char c) { 
            return (c & 0xC0) != 0x80; 
        });
    }

    std::vector<std::string> splitLine(const std::string &str);

    nlohmann::json readJsonFile(const std::filesystem::path &path);

    std::string getTimeStr();

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

class Logger
{
public:
    enum class Level
    {
        INFO,      // Normal operational information
        WARNING,   // Warning situations that don't affect normal operation
        EXCEPTION, // Error conditions that allow recovery
        FATAL      // Critical errors that prevent normal operation
    };
    static const std::string levelToString(Level level)
    {
        switch (level)
        {
        case Level::INFO:
            return "INFO";
        case Level::WARNING:
            return "WARNING";
        case Level::EXCEPTION:
            return "EXCEPTION";
        case Level::FATAL:
            return "FATAL";
        default:
            return "UNKNOWN";
        }
    }

private:
    Level logLevel = Level::INFO;
    std::mutex mutex;
    std::string logFilePath;
    std::ofstream logFile;
    bool toConsole = true;

public:
    Logger(const std::string &logFileDir, bool toConsole,  Level logLevel = Level::INFO) : logLevel(logLevel), toConsole(toConsole)
    {
        std::string timestamp = std::format("{:%Y%m%d-%H%M%S}", std::chrono::system_clock::now());
        std::string filename = timestamp + ".log";
        logFilePath = logFileDir + "/" + filename;
        if(!std::filesystem::exists(logFileDir))
        {
            std::filesystem::create_directories(logFileDir);
        }
        logFile.open(logFilePath, std::ios::app);
        if (!logFile.is_open())
        {
            std::cerr << "Failed to open log file: " << logFilePath << ", may not record logs." << std::endl;
        }
        log("Logger initialized with log level: " + levelToString(logLevel), Level::INFO);
    }

    ~Logger() = default;

    void log(const std::string &message, Level level = Level::INFO)
    {
        if (level < logLevel)
            return;
        std::lock_guard<std::mutex> lock(mutex);
        auto timeStr = Utils::getTimeStr();
        std::string logMessage = timeStr + " [" + levelToString(level) + "] " + message + "\n";
        if(toConsole)
            std::cerr << logMessage << std::flush;
        if (!logFile.is_open())
            return;
        logFile << logMessage << std::flush;
    }

    void info(const std::string &message)
    {
        log(message, Level::INFO);
    }

    void warning(const std::string &message)
    {
        log(message, Level::WARNING);
    }

    void exception(const std::string &message)
    {
        log(message, Level::EXCEPTION);
    }

    void fatal(const std::string &message)
    {
        log(message, Level::FATAL);
    }
};
extern Logger logger;


/*
A universal error class for the project.
*/
class Error : public std::exception
{
public:
    enum class Type
    {
        Network,
        FileAccess,
        Database,
        Input, // Input error, such as invalid json format
        Internal, // Internal error, may be caused by wrong code in project itself
        Unknown
    };
    static std::string typeToString(Type type)
    {
        switch (type)
        {
        case Type::Network:
            return "Network";
        case Type::FileAccess:
            return "FileAccess";
        case Type::Database:
            return "Database";
        case Type::Internal:
            return "Internal";
        case Type::Input:
            return "Input";
        case Type::Unknown:
            return "Unknown";
        default:
            return "Unknown";
        }
    }
private:
    std::string message;
    Type type;
public:
    Error(const std::string &message, Type type = Type::Unknown, const std::source_location location = std::source_location::current()) : message(message), type(type) 
    {
        auto typeStr = typeToString(type);
        logger.exception(typeStr + " Error: " + message + "\nat line: " + std::to_string(location.line()) +
                         ", file: " + std::string(location.file_name()) +
                         ", function: " + std::string(location.function_name()) + "\n");
    }

    Error operator+(const Error &other) const
    {
        return Error(message + "\n    Nested error: " + other.message, 
                (type != Type::Unknown) ? type : other.type);
    }

    const char* what() const noexcept override
    {
        return message.c_str();
    }

    Type getType() const
    {
        return type;
    }
};