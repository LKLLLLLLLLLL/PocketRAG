#pragma once
#include <chrono>
#include <condition_variable>
#include <exception>
#include <filesystem>
#include <string>
#include <functional>
#include <mutex>
#include <queue>
#include <fstream>
#include <thread>
#include <source_location>
#ifdef _WIN32
    #include <conio.h>
    #include <windows.h>
#else
    #include <sys/select.h>
    #include <unistd.h>
#endif
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
    int maxLogFileCount;

    void cleanOldLogFiles(std::filesystem::path logFileDir);

public:
    Logger(const std::filesystem::path &logFileDir, bool toConsole, Level logLevel = Level::INFO, int maxLogFileCount = 20);

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

    // a thread-safe message queue
    class MessageQueue
    {
      public:
        struct Message
        {
            int64_t sessionId; // -1 - KernelServer, others - Session ID
            nlohmann::json data;
            std::shared_ptr<Timer> timer = nullptr; // for performance measurement
        };

      private:
        std::queue<std::shared_ptr<Message>> queue;
        mutable std::mutex mutex;
        std::condition_variable conditionVariable;
        std::atomic<bool> shutdownFlag = false;

        std::condition_variable *outerConditionVariable = nullptr;

      public:
        void push(const std::shared_ptr<Message> &message);

        // block until a message is available
        std::shared_ptr<Message> pop();

        std::shared_ptr<Message> tryPop();

        std::shared_ptr<Message> popFor(std::chrono::milliseconds duration);

        // this method will block until a message or argument cv is notified
        // if condition is true, it will return nullptr
        std::shared_ptr<Message> popWithCv(std::condition_variable *cv, std::function<bool()> condition);

        bool empty();

        // wake all waiting threads and pop() will exit with nullptr
        void shutdown();
    };

    /*
    A mutex class which supports priority and read/write locks.
    */
    class PriorityMutex
    {
    private:
        mutable std::mutex mutex; // mutex to protect priority mutex itself
        std::condition_variable cv;

        std::atomic<bool> locked = false;
        std::atomic<bool> writing = false; // if locked, this member indicates if it is a write lock
        int readerCount = 0; // number of readers holding the lock
        std::atomic<bool> allowWrite = true; // if false, no write lock can be acquired
        std::thread::id yieldingThreadId = std::thread::id(); // thread id of the thread that is yielding the lock

        int priorityReadCount = 0;
        int priorityWriteCount = 0;

        friend class LockGuard;

        void lock(bool priority, bool write);

        void unlock(bool write);

        // called by the writer thread with low priority
        // this function will try to release lock for a while, allowing priority readers to acquire the lock
        // if priority writers are waiting, please call hasWriteWaiters() to check if there are any priority writers waiting instead of using this function
        void yield(bool priority, bool write);

        // called by low priority reader/writer thread
        // check if there are any priority writers waiting
        // if return true, it means you have to exit the lock and wait for priority writers to finish
        bool hasPriorityWaiters(bool priority, bool write) const;

        bool isLocked() const;
    };

    class LockGuard
    {
    private:
        PriorityMutex &mutex;
        bool priority = false;
        bool write = false;
    public:
        LockGuard(PriorityMutex &mutex, bool priority, bool write);
        ~LockGuard();
        LockGuard(const LockGuard &) = delete;
        LockGuard &operator=(const LockGuard &) = delete;

        // called by low priority writer thread to yield the lock for high priority readers
        void yield();

        // called by low priority reader/writer thread to check if there are any priority writers waiting
        // if return true, it means you have to exit the lock and wait for priority writers to finish
        bool needRelease();
    };

    // A safe wrapper for thread, gurantee will not throw exception
    // The work function must implement retFlag checking to stop the thread.
    // when error handler is called, the work function will turn to pause state
    class WorkerThread
    {
    private:
        std::thread thread;
        mutable std::mutex mutex;
        std::condition_variable cv;
        std::atomic<bool> wakeUpFlag = false;
        std::atomic<bool> shutdownFlag = false;
        std::atomic<bool> retFlag = false; // flag to notice workfunction to return
        std::atomic<bool> is_running = false; // flag if std::thread object is not return
        std::atomic<bool> is_waiting = false; // flag if thread is waiting for wakeup

        const std::string threadName;

        std::function<void(std::atomic<bool> &, WorkerThread&)> workFunction;
        std::function<void(const std::exception&)> errorHandler;

        std::condition_variable notice; // condition variable used internal work function
        std::atomic<bool> noticeFlag = false;

        static thread_local WorkerThread* currentThread;

        // wrapper to make work function exception safe and support pause and wakeup
        void workFuncWrapper();
    public:
        WorkerThread(const std::string& threadName, std::function<void(std::atomic<bool>&, WorkerThread&)> workFunction, std::function<void(const std::exception& e)> errorHandler = nullptr) : workFunction(workFunction), errorHandler(errorHandler), threadName(threadName){}

        ~WorkerThread();

        void start();
        // This method will stop workfunction but will not destroy the thread
        void pause();
        void wakeUp();
        // this method will make work thread return but will not join the thread
        void stop();
        // this method will make work thread return and destroy the thread
        void shutdown();
        void notify();
        void wait();
        void wait_for(std::chrono::milliseconds duration);

        bool isRunning() const;
        std::condition_variable& getNotice();
        bool hasNotice() const;

        static Utils::WorkerThread* getCurrentThread();
    };

    // a non-blocking check for input
    bool hasInput();

    void setThreadName(const std::string &name);
}
