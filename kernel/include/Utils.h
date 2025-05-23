#pragma once
#include <chrono>
#include <filesystem>
#include <string>
#include <functional>
#include <mutex>
#include <queue>
#include <fstream>
#include <source_location>
namespace xxhash
{
    #include <xxhash.h>
}
#include <nlohmann/json.hpp>

/*
This file contains utility functions and classes for the project.
*/

/*
A global logger.
*/
class Logger
{
  public:
    enum class Level
    {
        DEBUG,     // Debug information
        INFO,      // Normal operational information
        WARNING,   // Warning situations that don't affect normal operation
        EXCEPTION, // Error conditions that allow recovery
        FATAL      // Critical errors that prevent normal operation
    };
    static const std::string levelToString(Level level);

  private:
    Level logLevel = Level::INFO;
    std::mutex mutex;
    std::filesystem::path logFilePath;
    std::ofstream logFile;
    bool toConsole = true;

  public:
    Logger(const std::filesystem::path &logFileDir, bool toConsole, Level logLevel = Level::INFO);

    ~Logger() = default;

    void log(const std::string &message, Level level = Level::INFO);

    void debug(const std::string &message);
    void info(const std::string &message);
    void warning(const std::string &message);
    void exception(const std::string &message);
    void fatal(const std::string &message);
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
        Input,    // Input error, such as invalid json format
        Internal, // Internal error, may be caused by wrong code in project itself
        Unknown
    };
    static std::string typeToString(Type type);

  private:
    std::string message;
    Type type;

  public:
    Error(const std::string &message, Type type = Type::Unknown,
          const std::source_location location = std::source_location::current());

    Error operator+(const Error &other) const;

    const char *what() const noexcept override;

    Type getType() const;
};

namespace Utils
{
    // set console to UTF-8 to avoid garbled characters
    void setup_utf8_console();

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

    // return a int timestamp, seconds since epoch
    int64_t getTimeStamp();

    // generate a random integer between min and max
    int randomInt(int min, int max);

    inline float sigmoid(float x)
    {
        return 1.0f / (1.0f + std::exp(-x));
    }

    // convert chunk content and metadata to a sequence which can be used by models
    std::string chunkTosequence(const std::string& content, const std::string& metadata);

    // convert utf8 char to lower case
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
        std::unordered_map<int64_t, Callback> callbacks;
        std::mutex mutex;

    public:
        // regoister a callback function and return its callback id
        int64_t registerCallback(const Callback &callback);

        void callCallback(int64_t callbackId, nlohmann::json &message);
    };

    // a thread-safe message queue
    class MessageQueue
    {
    public:
        struct Message
        {
            // enum class Type{send, receive} type; // send to frontend or receive from frontend
            int64_t sessionId; // -1 - KernelServer, others - Session ID
            nlohmann::json data;
            // CallbackManager::Callback callback = nullptr;
        };
    private:
        std::queue<std::shared_ptr<Message>> queue;
        mutable std::mutex mutex;
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

    /*
    A timer class can be used to log time cost of some code.
    Will log the time cost when the object is destructed.
    DO NOT use this class in static initialization, it relay on global logger.
    */
    class Timer
    {
    private:
        using clock_type = std::chrono::high_resolution_clock;
        clock_type::time_point startTime;
        std::source_location beginLocation;
        std::string message;
        bool running;
    public:
        Timer(std::string message, std::source_location beginLocation = std::source_location::current());

        void stop(std::source_location endLocation = std::source_location::current());

        ~Timer();
    };

    /*
    A mutex class which supports priority
    */
    class PriorityMutex
    {
    private:
        mutable std::mutex mutex; // mutex to protect priority mutex ifself
        std::condition_variable cv;
        bool locked = false;
        std::thread::id ownerThreadId;
        int priorityCount = 0;
    public:
        void lock(bool priority = false)
        {
            std::unique_lock<std::mutex> lock(mutex);
            if(priority)
            {
                priorityCount++;
            }
            cv.wait(lock, [this, priority]{
                if(priority)
                {
                    return !locked;
                }
                else
                {
                    return !locked && priorityCount == 0;
                }
            });
            locked = true;
            ownerThreadId = std::this_thread::get_id();

            if(priority)
            {
                priorityCount--;
            }
        }

        void unlock()
        {
            std::unique_lock<std::mutex> lock(mutex);
            if(std::this_thread::get_id() != ownerThreadId)
            {
                throw Error{"Unlocking a mutex not owned by this thread", Error::Type::Internal};
            }
            locked = false;
            cv.notify_all();
        }

        // try to release the mutex, if there is no waiters, return
        // if there are waiters, unlock the mutex and wait them finished and give back the mutex
        void yield()
        {
            {
                std::unique_lock<std::mutex> lock(mutex);
                if(std::this_thread::get_id() != ownerThreadId)
                {
                    throw Error{"Unlocking a mutex not owned by this thread", Error::Type::Internal};
                }
                if(priorityCount == 0)
                {
                    return;
                }
                locked = false;
                cv.notify_all();
            }
            lock();
        }

        bool hasPriorityWaiters() const
        {
            std::unique_lock<std::mutex> lock(mutex);
            return priorityCount > 0;
        }

        bool isLocked() const
        {
            std::unique_lock<std::mutex> lock(mutex);
            return locked;
        }
    };

    class LockGuard
    {
    private:
        PriorityMutex &mutex;
        bool priority = false;
    public:
        LockGuard(PriorityMutex &mutex, bool priority = false) : mutex(mutex), priority(priority)
        {
            mutex.lock(priority);
        }
        ~LockGuard()
        {
            mutex.unlock();
        }
        LockGuard(const LockGuard &) = delete;
        LockGuard &operator=(const LockGuard &) = delete;

        void yield()
        {
            mutex.yield();
        }

        bool hasPriorityWaiters() const
        {
            return mutex.hasPriorityWaiters();
        }
    };
}
