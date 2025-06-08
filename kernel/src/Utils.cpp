#include "Utils.h"

#include <chrono>
#include <iostream>
#include <filesystem>
#include <fstream>
#include <memory>
#include <string>
#include <mutex>
#include <random>
#include <condition_variable>
#include <queue>
#include <unordered_set>
#include <codecvt>

std::string Utils::calculatedocHash(const std::filesystem::path &path)
{
    std::ifstream file{path, std::ios::binary};
    if (!file.is_open())
        throw std::runtime_error("Failed to open file: " + path.string());

    std::string content = std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    file.close();

    return calculateHash(content);
}

std::string Utils::calculateHash(const std::string &content)
{
    size_t bufferSize = 8192;
    xxhash::XXH3_state_t *state = xxhash::XXH3_createState();
    if (!state)
    {
        xxhash::XXH3_freeState(state);
        throw std::runtime_error( "Failed to create hash state.");
    }

    xxhash::XXH3_128bits_reset(state);
    size_t offset = 0;
    while(offset < content.size())
    {
        size_t chunkSize = std::min(bufferSize, content.size() - offset);
        xxhash::XXH3_128bits_update(state, content.data() + offset, chunkSize);
        offset += chunkSize;
    }

    xxhash::XXH128_hash_t hash = xxhash::XXH3_128bits_digest(state);
    xxhash::XXH3_freeState(state);

    return std::format("{:016x}{:016x}", hash.high64, hash.low64);
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

void Utils::setupUtf8()
{
#ifdef _WIN32
    // set console to UTF-8
    system("chcp 65001 > null");

    // set cout to UTF-8
    std::ios_base::sync_with_stdio(false);
    std::locale utf8_locale(std::locale(), new std::codecvt_utf8<wchar_t>());
    std::wcout.imbue(utf8_locale);

    // set the global locale to UTF-8
    std::locale::global(std::locale(".UTF-8"));
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
    std::snprintf(buffer + strlen(buffer), sizeof(buffer) - strlen(buffer),".%03lld", static_cast<long long>(ms.count()));
    return std::string(buffer);
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

std::string Utils::removeInvalidUtf8(const std::string &str)
{
    std::string result;
    size_t i = 0;

    while (i < str.size())
    {
        unsigned char c = static_cast<unsigned char>(str[i]);

        if (c <= 0x7F)
        { // ASCII
            result += c;
            i++;
        }
        else if ((c & 0xE0) == 0xC0)
        { // 2byte
            if (i + 1 < str.size() && (static_cast<unsigned char>(str[i + 1]) & 0xC0) == 0x80)
            {
                result += str[i];
                result += str[i + 1];
                i += 2;
            }
            else
            {
                result += '?';
                i++;
            }
        }
        else if ((c & 0xF0) == 0xE0)
        { // 3byte
            if (i + 2 < str.size() && (static_cast<unsigned char>(str[i + 1]) & 0xC0) == 0x80 &&
                (static_cast<unsigned char>(str[i + 2]) & 0xC0) == 0x80)
            {
                result += str[i];
                result += str[i + 1];
                result += str[i + 2];
                i += 3;
            }
            else
            {
                result += '?';
                i++;
            }
        }
        else if ((c & 0xF8) == 0xF0)
        { // 4byte
            if (i + 3 < str.size() && (static_cast<unsigned char>(str[i + 1]) & 0xC0) == 0x80 &&
                (static_cast<unsigned char>(str[i + 2]) & 0xC0) == 0x80 &&
                (static_cast<unsigned char>(str[i + 3]) & 0xC0) == 0x80)
            {
                result += str[i];
                result += str[i + 1];
                result += str[i + 2];
                result += str[i + 3];
                i += 4;
            }
            else
            {
                result += '?';
                i++;
            }
        }
        else
        { // other invalid byte
            result += '?';
            i++;
        }
    }

    return result;
}

bool Utils::isTextFile(const std::filesystem::path &fullPath)
{
    // First check the extension
    std::string ext = fullPath.extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);

    static const std::unordered_set<std::string> textExtensions = {".txt", ".md", ".json", ".xml", ".html",
                                                                   ".css", ".js", ".c",    ".cpp", ".h",
                                                                   ".hpp", ".py", ".java", ".cs",  ".php"};

    if (textExtensions.find(ext) != textExtensions.end())
    {
        return true; // Known text extension
    }

    std::ifstream file(fullPath, std::ios::binary);
    if (!file.is_open())
        return false;

    // only check the first 8192 bytes for performance
    std::vector<char> buffer(8192);
    file.read(buffer.data(), buffer.size());
    std::streamsize bytesRead = file.gcount();
    file.close();

    if (bytesRead == 0)
        return true;

    // Check for BOM
    if (bytesRead >= 3 && static_cast<unsigned char>(buffer[0]) == 0xEF &&
        static_cast<unsigned char>(buffer[1]) == 0xBB && static_cast<unsigned char>(buffer[2]) == 0xBF)
    {
        return true;
    }

    // Count character types
    int validUtf8Chars = 0;
    int printableChars = 0;
    int nullBytes = 0;
    int controlChars = 0;

    for (std::streamsize i = 0; i < bytesRead;)
    {
        unsigned char byte = static_cast<unsigned char>(buffer[i]);

        // ASCII characters
        if (byte <= 0x7F)
        {
            validUtf8Chars++;
            if (byte >= 32 || byte == '\t' || byte == '\n' || byte == '\r')
            {
                printableChars++;
            }
            else if (byte == 0)
            {
                nullBytes++;
            }
            else
            {
                controlChars++;
            }
            i++;
        }
        // Multi-byte UTF-8 sequences
        else if ((byte & 0xE0) == 0xC0)
        {
            if (i + 1 >= bytesRead || (static_cast<unsigned char>(buffer[i + 1]) & 0xC0) != 0x80)
                return false; // Invalid UTF-8
            validUtf8Chars++;
            printableChars++; // Multi-byte characters are usually printable
            i += 2;
        }
        else if ((byte & 0xF0) == 0xE0)
        {
            if (i + 2 >= bytesRead || (static_cast<unsigned char>(buffer[i + 1]) & 0xC0) != 0x80 ||
                (static_cast<unsigned char>(buffer[i + 2]) & 0xC0) != 0x80)
                return false;
            validUtf8Chars++;
            printableChars++;
            i += 3;
        }
        else if ((byte & 0xF8) == 0xF0)
        {
            if (i + 3 >= bytesRead || (static_cast<unsigned char>(buffer[i + 1]) & 0xC0) != 0x80 ||
                (static_cast<unsigned char>(buffer[i + 2]) & 0xC0) != 0x80 ||
                (static_cast<unsigned char>(buffer[i + 3]) & 0xC0) != 0x80)
                return false;
            validUtf8Chars++;
            printableChars++;
            i += 4;
        }
        else
        {
            return false; // Invalid UTF-8 starting byte
        }
    }

    // Determine if it's a text file
    if (validUtf8Chars == 0)
        return false;

    double nullRatio = static_cast<double>(nullBytes) / bytesRead;
    double printableRatio = static_cast<double>(printableChars) / validUtf8Chars;
    double controlRatio = static_cast<double>(controlChars) / validUtf8Chars;

    // Text files should have high ratio of printable characters, low ratio of null bytes and control characters
    return (nullRatio < 0.05 && printableRatio > 0.70 && controlRatio < 0.30);
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
    logger.info("[PERF] " + message + " Timer stopped in " + std::to_string(duration) + " ms "
                "\nFrom " + beginLocation.file_name() + ":" + std::to_string(beginLocation.line()) + 
                "\nTo   " + endLocation.file_name() + ":" + std::to_string(endLocation.line()) + " .");
    running = false;
}

Utils::Timer::~Timer()
{
    if (running)
    {
        auto endTime = clock_type::now();
        auto duration =
            std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(endTime - startTime).count();
        logger.info("[PERF] " + message + " Timer stopped in " + std::to_string(duration) + " ms "
            "\nFrom " + beginLocation.file_name() + ":" + std::to_string(beginLocation.line()) + 
            "\nTo   destructor.");
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
    log("Kernel version: " + std::string(KERNEL_VERSION), Level::INFO);
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
            return priorityReadCount == 0 && readerCount == 0;
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
    if (!(priority == false && write == true))
    {
        return;
    }
    {
        std::unique_lock<std::mutex> lock(mutex);
        if (!writing || priorityReadCount == 0)
        {
            return;
        }
        allowWrite = false;
        locked = false;
        writing = false;
        yieldingThreadId = std::this_thread::get_id();
        cv.notify_all();
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(10)); // avoid other threads cannot acquire the lock immediately
    lock(priority, write);
    allowWrite = true;
    yieldingThreadId = std::thread::id();
}

bool Utils::PriorityMutex::hasPriorityWaiters(bool priority, bool write) const
{
    std::unique_lock<std::mutex> lock(mutex);
    if (priority)
    {
        return false;
    }
    return priorityWriteCount > 0;
}

bool Utils::PriorityMutex::isLocked() const
{
    std::unique_lock<std::mutex> lock(mutex);
    return locked;
}

//--------------------------------LockGuard------------------------------//
Utils::LockGuard::LockGuard(PriorityMutex &mutex, bool priority, bool write)
    : mutex(mutex), priority(priority), write(write)
{
    mutex.lock(priority, write);
}

Utils::LockGuard::~LockGuard()
{
    mutex.unlock(write);
}

void Utils::LockGuard::yield()
{
    mutex.yield(priority, write);
}

bool Utils::LockGuard::needRelease()
{
    return mutex.hasPriorityWaiters(priority, write);
}

//--------------------------------WorkerThread------------------------------//
thread_local Utils::WorkerThread *Utils::WorkerThread::currentThread = nullptr;

Utils::WorkerThread::~WorkerThread()
{
    stop();
    if(thread.joinable())
    {
        thread.join();
    }
}

void Utils::WorkerThread::start()
{
    std::lock_guard<std::mutex> lock(mutex);
    if (currentState != State::Return)
    {
        wakeUp(false);
        return;
    }
    nextState = State::Running;
    thread = std::thread(&WorkerThread::workFuncWrapper, this);
}

void Utils::WorkerThread::stop()
{
    std::lock_guard<std::mutex> lock(mutex);
    nextState = State::Return;
    noticeFlag = true;
    notice.notify_all();
    pauseCondition.notify_all();
}

void Utils::WorkerThread::pause()
{
    std::lock_guard<std::mutex> lock(mutex);
    nextState = State::Paused;
    notify();
}

void Utils::WorkerThread::wakeUp(bool needLock)
{
    std::shared_ptr<std::lock_guard<std::mutex>> lock;
    if (needLock)
    {
        lock = std::make_shared<std::lock_guard<std::mutex>>(mutex);
    }
    if (currentState == State::Paused)
        nextState = State::Running;
    pauseCondition.notify_all();
}

void Utils::WorkerThread::notify()
{
    std::unique_lock<std::mutex> lock(mutex);
    noticeFlag = true;
    notice.notify_all();
}

void Utils::WorkerThread::wait()
{
    std::unique_lock<std::mutex> lock(mutex);
    notice.wait(lock, [this]() { return noticeFlag; });
    noticeFlag = false;
}

bool Utils::WorkerThread::isActive() const
{
    std::lock_guard<std::mutex> lock(mutex);
    return currentState != State::Return;
}

std::condition_variable &Utils::WorkerThread::getNoticeCv()
{
    return notice;
}

bool Utils::WorkerThread::hasNotice() const
{
    std::lock_guard<std::mutex> lock(mutex);
    return noticeFlag;
}

Utils::WorkerThread *Utils::WorkerThread::getCurrentThread()
{
    return currentThread;
}

void Utils::WorkerThread::workFuncWrapper()
{
    setThreadName(threadName);
    currentThread = this;
    std::unique_lock<std::mutex> lock(mutex);
    currentState = State::Running;
    while (nextState != State::Return)
    {
        currentState = State::Paused;
        pauseCondition.wait(lock, [this] { return nextState != State::Paused; });
        if(nextState == State::Return)
        {
            break;
        }
        currentState = State::Running;
        lock.unlock();
        try
        {
            workFunction([this]()->bool{
                std::lock_guard<std::mutex> lock(mutex);
                return nextState != State::Running;
            }, *this);
            std::lock_guard<std::mutex> lock(mutex);
            if (nextState == State::Running) // avoid running again after work function returns
            {
                nextState = State::Paused;
            }
        }
        catch (const std::exception &e)
        {
            {
                std::lock_guard<std::mutex> lock(mutex);
                if (nextState == State::Running) // avoid running again after exception
                {
                    nextState = State::Paused;
                }
            }
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
        lock.lock();
    }
    currentState = State::Return;
}

//---------------------------- Jieba Tokenizer -----------------------------//
namespace jiebaTokenizer
{
cppjieba::Jieba *jieba = nullptr; // Global Jieba tokenizer instance
std::mutex jiebaMutex;            // to protect jieba pointer
}; // namespace jiebaTokenizer

// FTS5 tokenizer interface functions
int jiebaTokenizer::jieba_tokenizer_create(void *sqlite3_api, const char **azArg, int nArg, Fts5Tokenizer **ppOut)
{
    *ppOut = (Fts5Tokenizer *)jieba;
    return SQLITE_OK;
}
void jiebaTokenizer::jieba_tokenizer_delete(Fts5Tokenizer *pTokenizer)
{
    // no need to free here
}
int jiebaTokenizer::jieba_tokenizer_tokenize(Fts5Tokenizer *pTokenizer, void *pCtx, int flags, const char *pText,
                                             int nText, int (*xToken)(void *, int, const char *, int, int, int))
{
    get_jieba_ptr();

    cppjieba::Jieba *jieba = (cppjieba::Jieba *)pTokenizer;
    std::string text(pText, nText);
    std::vector<std::string> words;

    // tokenize
    cut(text, words);

    // output each token result
    int offset = 0;
    for (const auto &word : words)
    {
        size_t pos = text.find(word, offset);
        if (pos != std::string::npos)
        {
            offset = pos + word.length();
            int rc = xToken(pCtx, 0, word.c_str(), word.length(), pos, pos + word.length());
            if (rc != SQLITE_OK)
                return rc;
        }
    }

    return SQLITE_OK;
}

// register jieba tokenizer to specified SQLite database
void jiebaTokenizer::register_jieba_tokenizer(sqlite3 *db)
{
    static fts5_tokenizer tokenizer = {jieba_tokenizer_create, jieba_tokenizer_delete, jieba_tokenizer_tokenize};

    fts5_api *fts5api = nullptr;
    sqlite3_stmt *stmt = nullptr;

    try
    {
        auto statement = sqlite3_prepare_v2(db, "SELECT fts5(?)", -1, &stmt, nullptr);
        if (statement != SQLITE_OK)
        {
            throw Error{"Failed to prepare statement, sql error" + std::string(sqlite3_errmsg(db)),
                        Error::Type::Database};
        }
        sqlite3_bind_pointer(stmt, 1, (void *)&fts5api, "fts5_api_ptr",
                             nullptr); // bind the fts5_api pointer to the statement
        sqlite3_step(stmt);            // execute the statement
        sqlite3_finalize(stmt);        // finalize the statement

        // register the tokenizer to the SQLite database
        auto rc = fts5api->xCreateTokenizer(fts5api, "jieba", (void *)jieba, &tokenizer, nullptr);
        if (rc != SQLITE_OK)
        {
            throw Error{"Failed to register jieba tokenizer, sql error" + std::string(sqlite3_errmsg(db)),
                        Error::Type::Database};
        }
    }
    catch (const Error &e)
    {
        throw Error{"Failed to register jieba tokenizer: ", Error::Type::Database} + e;
    }
}

cppjieba::Jieba *jiebaTokenizer::get_jieba_ptr()
{
    if (jieba != nullptr)
        return jieba;
    {
        std::lock_guard<std::mutex> lock(jiebaMutex);
        Utils::Timer timer("[Jieba] jieba initialization");
        if (jieba == nullptr) // initialize jieba object
        {
            jieba = new cppjieba::Jieba(DICT_PATH, HMM_PATH, USER_DICT_PATH, IDF_PATH,
                                        STOP_WORD_PATH); // PATH has been defined in the cmakefile
        }
        timer.stop();
    }
    return jieba;
}

void jiebaTokenizer::cut(const std::string &text, std::vector<std::string> &words, bool needLower)
{
    get_jieba_ptr();

    auto ltext = text;
    if (needLower)
        ltext = Utils::toLower(text);
    jieba->Cut(ltext, words);
}

void jiebaTokenizer::cutForSearch(const std::string &text, std::vector<std::string> &words, bool needLower)
{
    get_jieba_ptr();

    auto ltext = text;
    if (needLower)
        ltext = Utils::toLower(text);
    jieba->CutForSearch(ltext, words);
}

void jiebaTokenizer::extractKeyword(const std::string &text, std::vector<std::string> &keywords, int topK)
{
    get_jieba_ptr();

    std::vector<std::pair<std::string, double>> keywordWeights{};
    jieba->extractor.Extract(text, keywordWeights, topK);

    keywords.clear();
    keywords.reserve(keywordWeights.size());

    for (const auto &kw : keywordWeights)
    {
        if (Utils::utf8Length(kw.first) >= 2)
        {
            keywords.push_back(kw.first);
        }
    }
}
