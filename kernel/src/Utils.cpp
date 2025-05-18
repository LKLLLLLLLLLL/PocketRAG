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
    std::transform(lowerStr.begin(), lowerStr.end(), lowerStr.begin(), [](unsigned char c) -> unsigned {
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

Logger::Logger(const std::string &logFileDir, bool toConsole, Level logLevel)
    : logLevel(logLevel), toConsole(toConsole)
{
    std::string timestamp = std::format("{:%Y%m%d-%H%M%S}", std::chrono::system_clock::now());
    std::string filename = timestamp + ".log";
    logFilePath = logFileDir + "/" + filename;
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
