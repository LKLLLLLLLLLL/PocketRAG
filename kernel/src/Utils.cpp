#include "Utils.h"

#include <chrono>
#include <iostream>
#include <filesystem>
#include <fstream>
#include <string>
#include <codecvt>
#include <mutex>
#include <random>
#include <condition_variable>
#include <queue>

std::string Utils::calculatedocHash(const std::filesystem::path &path)
{
    // open file
    std::ifstream file{path, std::ios::binary};
    if (!file.is_open())
        throw std::runtime_error("Failed to open file: " + path.string());

    std::vector<char> buffer(8192);             // 8KB buffer
    xxhash::XXH64_state_t *state = xxhash::XXH64_createState(); // create a new state for hash calculation
    if (!state)
        throw std::runtime_error("Failed to create hash state.");

    // calculate hash
    XXH64_reset(state, 0); // reset the state with initial hash value
    file.read(buffer.data(), buffer.size());
    while (file.gcount() > 0)
    {
        XXH64_update(state, buffer.data(), file.gcount()); // update hash with the read data
        file.read(buffer.data(), buffer.size());
    }
    xxhash::XXH64_hash_t hash = xxhash::XXH64_digest(state); // get the final hash value
    XXH64_freeState(state);                  // free the state
    file.close();                            // close the file

    return std::to_string(hash); // convert hash to string and return
}

std::string Utils::calculateHash(const std::string &content)
{
    xxhash::XXH64_state_t *state = xxhash::XXH64_createState(); // create a new state for hash calculation
    if (!state)
        throw std::runtime_error( "Failed to create hash state.");

    // calculate hash
    xxhash::XXH64_reset(state, 0);                       // reset the state with initial hash value
    xxhash::XXH64_update(state, content.data(), content.size()); // update hash with the content
    xxhash::XXH64_hash_t hash = XXH64_digest(state);             // get the final hash value
    xxhash::XXH64_freeState(state);                              // free the state

    return std::to_string(hash); // convert hash to string and return
}

std::string Utils::wstring_to_string(const std::wstring &wstr)
{
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    return converter.to_bytes(wstr);
}

std::wstring Utils::string_to_wstring(const std::string &str)
{
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    return converter.from_bytes(str);
}

std::string Utils::normalizeLineEndings(const std::string &input)
{
    std::string result(input.size(), '\0');
    std::transform(input.begin(), input.end(), result.begin(), [](unsigned char c) -> unsigned {
        return (c == '\r') ? ' ' : c;
    });
    return result;
}

void Utils::setup_utf8_console()
{
#ifdef _WIN32
    // set console to UTF-8
    system("chcp 65001 > null");

    // set locale to UTF-8
    std::ios_base::sync_with_stdio(false);
    std::locale utf8_locale(std::locale(), new std::codecvt_utf8<wchar_t>());
    std::wcout.imbue(utf8_locale);
#else
    // set locale to UTF-8
    std::locale::global(std::locale("en_US.UTF-8"));
#endif
}

int64_t Utils::getTimeStamp()
{
    auto now = std::chrono::system_clock::now(); // get current time
    auto duration = now.time_since_epoch(); // get duration since epoch
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(duration).count(); // convert to seconds
    return timestamp; // return as int
}

int Utils::randomInt(int min, int max)
{
    static std::random_device rd;
    static std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(min, max);
    return dis(gen);
}

std::string Utils::chunkTosequence(const std::string& content, const std::string& metadata)
{
    std::string seq = "";
    seq += "[METADATA]" + metadata + "\n";
    seq += "[CONTENT]" + content + "\n";
    return seq;
}

std::string Utils::toLower(const std::string &str)
{
    std::string lowerStr = str;
    std::transform(lowerStr.begin(), lowerStr.end(), lowerStr.begin(), [](unsigned char c) -> unsigned char{
        return (c < 128) ? tolower(c) : c;
    });
    return lowerStr;
}

std::vector<std::string> Utils::splitLine(const std::string &str)
{
    std::vector<std::string> lines;
    std::istringstream iss(str);
    std::string line;
    while (std::getline(iss, line))
    {
        if(line.empty())
            continue;
        lines.push_back(line);
    }
    return lines;
}

nlohmann::json Utils::readJsonFile(const std::filesystem::path &path)
{
    std::ifstream file(path);
    if (!file)
    {
        throw std::runtime_error("Failed to open file: " + path.string());
    }
    nlohmann::json json;
    try
    {
        file >> json;
    }
    catch (const nlohmann::json::parse_error &e)
    {
        throw std::runtime_error("JSON parse error in file " + path.string() + ": " + e.what());
    }
    return json;
}

std::string Utils::getTimeStr()
{
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::localtime(&time);
    char buffer[100];
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &tm);
    std::sprintf(buffer + strlen(buffer), ".%03lld", static_cast<long long>(ms.count()));
    return std::string(buffer);
}

bool Utils::hasInput()
{
#ifdef _WIN32
    DWORD fileType = GetFileType(GetStdHandle(STD_INPUT_HANDLE));
    if (fileType == FILE_TYPE_CHAR)
    {
        return _kbhit() != 0;
    }
    else
    {
        HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
        DWORD bytesAvailable = 0;

        if (PeekNamedPipe(hStdin, NULL, 0, NULL, &bytesAvailable, NULL))
        {
            return bytesAvailable > 0;
        }
        return false;
    }
#else
    fd_set readfds;
    FD_ZERO(&readfds);
    FD_SET(STDIN_FILENO, &readfds);

    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 0;

    return select(STDIN_FILENO + 1, &readfds, NULL, NULL, &timeout) > 0;
#endif
}

void Utils::setThreadName(const std::string &name)
{
#if defined(__APPLE__)
    pthread_setname_np(name.substr(0, 15).c_str());

#elif defined(__linux__)
    pthread_setname_np(pthread_self(), name.substr(0, 15).c_str());

#elif defined(_WIN32)
    const int bufferSize = MultiByteToWideChar(CP_UTF8, 0, name.c_str(), -1, NULL, 0);
    if (bufferSize == 0)
        return;

    std::wstring wideName(bufferSize, 0);
    MultiByteToWideChar(CP_UTF8, 0, name.c_str(), -1, &wideName[0], bufferSize);

    HRESULT hr = SetThreadDescription(GetCurrentThread(), wideName.c_str());
#endif
}

//--------------------------CallbackManager--------------------------//
int64_t Utils::CallbackManager::registerCallback(const Callback &callback)
{
    std::lock_guard<std::mutex> lock(mutex);
    auto callbackId = Utils::getTimeStamp() + Utils::randomInt(0, 10000000);
    while(callbacks.find(callbackId) != callbacks.end())
    {
        callbackId = Utils::getTimeStamp() + Utils::randomInt(0, 10000000); // generate a unique callback id
    }
    callbacks[callbackId] = callback;
    return callbackId;
}

void Utils::CallbackManager::callCallback(int64_t callbackId, nlohmann::json &message)
{
    std::unique_lock<std::mutex> lock(mutex);
    auto it = callbacks.find(callbackId);
    Callback callback;
    if (it != callbacks.end())
    {
        callback = it->second;
        callbacks.erase(it); // remove callback after calling
    }
    else
    {
        throw std::runtime_error("Callback not found.");
    }
    lock.unlock();

    if(callback)
        callback(message);
}

//--------------------------MessageQueue--------------------------//
void Utils::MessageQueue::push(const std::shared_ptr<Message> &message)
{
    std::lock_guard<std::mutex> lock(mutex);
    queue.push(message);
    conditionVariable.notify_one();
    if(outerConditionVariable)
    {
        outerConditionVariable->notify_all();
    }
}

auto Utils::MessageQueue::pop() -> std::shared_ptr<Message>
{
    std::unique_lock<std::mutex> lock(mutex);
    conditionVariable.wait(lock, [this](){ 
        return !queue.empty() || shutdownFlag;
    });

    if(shutdownFlag)
    {
        return nullptr; 
    }

    auto message = queue.front();
    queue.pop();

    return message;
}

auto Utils::MessageQueue::tryPop() -> std::shared_ptr<Message>
{
    std::unique_lock<std::mutex> lock(mutex);
    if (queue.empty() || shutdownFlag.load())
    {
        return nullptr;
    }
    auto message = queue.front();
    queue.pop();
    return message;
}

auto Utils::MessageQueue::popFor(std::chrono::milliseconds duration) -> std::shared_ptr<Message>
{
    std::unique_lock<std::mutex> lock(mutex);
    conditionVariable.wait_for(lock, duration, [this]() { return !queue.empty() || shutdownFlag; });

    if (shutdownFlag)
    {
        return nullptr;
    }

    auto message = queue.front();
    queue.pop();

    return message;
}

auto Utils::MessageQueue::popWithCv(std::condition_variable *cv, std::function<bool()> condition) -> std::shared_ptr<Message>
{
    std::unique_lock<std::mutex> lock(mutex);
    outerConditionVariable = cv;
    outerConditionVariable->wait(lock, [this, condition]() {
        return !queue.empty() || shutdownFlag || (condition && condition());
    });
    outerConditionVariable = nullptr;

    if (shutdownFlag)
    {
        return nullptr;
    }

    if(queue.empty())
    {
        return nullptr;
    }

    auto message = queue.front();
    queue.pop();

    return message;
}

bool Utils::MessageQueue::empty()
{
    std::lock_guard<std::mutex> lock(mutex);
    return queue.empty();
}

void Utils::MessageQueue::shutdown()
{
    std::lock_guard<std::mutex> lock(mutex);
    shutdownFlag = true;
    conditionVariable.notify_all();
}

//---------------------------------Timer-----------------------------//
Utils::Timer::Timer(std::string message, std::source_location beginLocation)
    : message(message), beginLocation(beginLocation), running(true)
{
    startTime = clock_type::now();
}

void Utils::Timer::stop(std::source_location endLocation)
{
    auto endTime = clock_type::now();
    auto duration = std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(endTime - startTime).count();
    logger.info(message + " Timer stopped in " + std::to_string(duration) +
                " ms "
                "\nFrom " +
                beginLocation.file_name() + ":" + std::to_string(beginLocation.line()) + "\nTo   " +
                endLocation.file_name() + ":" + std::to_string(endLocation.line()) + " .");
    running = false;
}

Utils::Timer::~Timer()
{
    if (running)
    {
        auto endTime = clock_type::now();
        auto duration =
            std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(endTime - startTime).count();
        logger.info(message + " Timer stopped in " + std::to_string(duration) +
                    " ms"
                    "\nFrom " +
                    beginLocation.file_name() + ":" + std::to_string(beginLocation.line()) + "\nTo   destructor.");
        running = false;
        logger.warning("Timer stopped at destructor, result may be inaccurate.");
    }
}

//--------------------------------Logger-----------------------------//
const std::string Logger::levelToString(Level level)
{
    switch (level)
    {
    case Level::DEBUG:
        return "DEBUG";
    case Level::INFO:
        return "INFO";
    case Level::WARNING:
        return "WARNING";
    case Level::EXCEPTION:
        return "ERROR";
    case Level::FATAL:
        return "FATAL";
    default:
        return "UNKNOWN";
    }
}

void Logger::cleanOldLogFiles(std::filesystem::path logFileDir)
{
    std::vector<std::filesystem::path> logFiles = {};

    try
    {
        for (const auto &entry : std::filesystem::directory_iterator(logFileDir))
        {
            if (entry.is_regular_file() && entry.path().extension() == ".log") // filter .log files
            {
                logFiles.push_back(entry.path());
            }
        }

        if (logFiles.size() <= maxLogFileCount)
        {
            return;
        }

        std::sort(logFiles.begin(), logFiles.end(), [](const std::filesystem::path &a, const std::filesystem::path &b) {
            return std::filesystem::last_write_time(a) < std::filesystem::last_write_time(b);
        });

        size_t filesToDelete = logFiles.size() - maxLogFileCount;
        for (size_t i = 0; i < filesToDelete; ++i)
        {
            std::filesystem::remove(logFiles[i]);
            logger.info("Removed old log file: " + logFiles[i].filename().string());
        }
    }
    catch (const std::exception &e)
    {
        logger.warning("Error during log file cleanup: " + std::string(e.what()));
    }
}

Logger::Logger(const std::filesystem::path &logFileDir, bool toConsole, Level logLevel, int maxLogFileCount)
    : logLevel(logLevel), toConsole(toConsole), maxLogFileCount(maxLogFileCount)
{
    std::string timestamp = std::format("{:%Y%m%d-%H%M%S}", std::chrono::system_clock::now());
    std::string filename = timestamp + ".log";
    logFilePath = logFileDir / filename;
    if (!std::filesystem::exists(logFileDir))
    {
        std::filesystem::create_directories(logFileDir);
    }
    logFile.open(logFilePath, std::ios::app);
    if (!logFile.is_open())
    {
        std::cerr << "Failed to open log file: " << logFilePath << ", may not record logs." << std::endl;
    }
    log("[Logger] Logger initialized with log level: " + levelToString(logLevel), Level::INFO);
    cleanOldLogFiles(logFileDir);
}

void Logger::log(const std::string &message, Level level)
{
    if (level < logLevel)
        return;
    std::lock_guard<std::mutex> lock(mutex);
    auto timeStr = Utils::getTimeStr();
    std::string logMessage = timeStr + " [" + levelToString(level) + "] " + message + "\n";
    if (toConsole)
        std::cerr << logMessage << std::flush;
    if (!logFile.is_open())
        return;
    logFile << logMessage << std::flush;
}

void Logger::debug(const std::string &message)
{
    log(message, Level::DEBUG);
}

void Logger::info(const std::string &message)
{
    log(message, Level::INFO);
}

void Logger::warning(const std::string &message)
{
    log(message, Level::WARNING);
}

void Logger::exception(const std::string &message)
{
    log(message, Level::EXCEPTION);
}

void Logger::fatal(const std::string &message)
{
    log(message, Level::FATAL);
}

//--------------------------------Error------------------------------//
std::string Error::typeToString(Type type)
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

Error::Error(const std::string &message, Type type, const std::source_location location) : message(message), type(type) 
{
    auto typeStr = typeToString(type);
    logger.exception(typeStr + " Error: " + message + "\nat " + location.file_name() + ":" + std::to_string(location.line()) + " , function: " + std::string(location.function_name()));
}

Error Error::operator+(const Error &other) const
{
    return Error(message + "\n    Nested error: " + other.message, (type != Type::Unknown) ? type : other.type);
}

const char* Error::what() const noexcept
{
    return message.c_str();
}

auto Error::getType() const -> Type
{
    return type;
}

//--------------------------------PriorityMutex------------------------------//
void Utils::PriorityMutex::lock(bool priority, bool write)
{
    std::unique_lock<std::mutex> lock(mutex);
    if (priority)
    {
        if (write)
        {
            priorityWriteCount++;
        }
        else
        {
            priorityReadCount++;
        }
    }
    cv.wait(lock, [this, priority, write] {
        bool isYielding = std::this_thread::get_id() == yieldingThreadId;
        if (isYielding)
        {
            return priorityReadCount == 0;
        }
        if (!write) // read only
        {
            if (!locked)
            {
                return true;
            }
            if (!writing)
            {
                if (priority)
                {
                    return true;
                }
                else
                {
                    return priorityWriteCount == 0; // if no priority write waiters, allow read lock
                }
            }
            return false;
        }
        else
        {
            if (!allowWrite)
            {
                return false;
            }
            if (priority)
            {
                return !locked;
            }
            else
            {
                return !locked && priorityReadCount == 0 && priorityWriteCount == 0;
            }
        }
    });
    locked = true;
    writing = write;
    if (!write)
    {
        readerCount++;
    }
    if (priority)
    {
        if (write)
        {
            priorityWriteCount--;
        }
        else
        {
            priorityReadCount--;
        }
    }
}

void Utils::PriorityMutex::unlock(bool write)
{
    std::unique_lock<std::mutex> lock(mutex);
    if (write)
    {
        locked = false;
        writing = false;
    }
    else
    {
        readerCount--;
        if (readerCount == 0)
        {
            locked = false;
        }
    }
    cv.notify_all();
}

void Utils::PriorityMutex::yield(bool priority, bool write)
{
    if (!(!priority && write))
    {
        return;
    }
    {
        std::unique_lock<std::mutex> lock(mutex);
        if (!writing || priorityReadCount)
        {
            return;
        }
        allowWrite = false;
        locked = false;
        writing = false;
        yieldingThreadId = std::this_thread::get_id();
        cv.notify_all();
    }
    lock(priority, write);
    allowWrite = true;
}

bool Utils::PriorityMutex::hasPriorityWaiters(bool priority, bool write) const
{
    std::unique_lock<std::mutex> lock(mutex);
    if (priority)
    {
        return false;
    }
    return priorityWriteCount > 0 || priorityReadCount > 0;
}

bool Utils::PriorityMutex::isLocked() const
{
    std::unique_lock<std::mutex> lock(mutex);
    return locked;
}

//--------------------------------WorkerThread------------------------------//
thread_local Utils::WorkerThread *Utils::WorkerThread::currentThread = nullptr;

Utils::WorkerThread::~WorkerThread()
{
    shutdown();
}

void Utils::WorkerThread::pause()
{
    retFlag = true;
    notify();
}

void Utils::WorkerThread::start()
{
    if (is_running)
    {
        return;
    }
    shutdownFlag = false;
    retFlag = false;
    thread = std::thread(&WorkerThread::workFuncWrapper, this);
}

void Utils::WorkerThread::wakeUp()
{
    std::unique_lock<std::mutex> lock(mutex);
    if (is_waiting)
        wakeUpFlag = true;
    cv.notify_all();
}

void Utils::WorkerThread::shutdown()
{
    shutdownFlag = true;
    notify();
    pause();
    wakeUp();
    if (thread.joinable())
    {
        thread.join();
    }
}

void Utils::WorkerThread::workFuncWrapper()
{
    setThreadName(threadName);
    currentThread = this;
    is_running = true;
    while (!shutdownFlag)
    {
        retFlag = false;
        try
        {
            workFunction(retFlag, *this);
        }
        catch (const std::exception &e)
        {
            if (errorHandler)
            {
                errorHandler(e);
            }
            else
            {
                logger.warning("Worker thread error: " + std::string(e.what()) +
                               ", no error handler, may cause unexpected behavior.");
            }
        }
        std::unique_lock<std::mutex> lock(mutex);
        is_waiting = true;
        cv.wait(lock, [this] { return shutdownFlag.load() || wakeUpFlag.load(); });
        wakeUpFlag = false;
        is_waiting = false;
    }
    is_running = false;
}
