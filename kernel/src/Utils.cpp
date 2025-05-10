#include "Utils.h"

#include <iostream>
#include <filesystem>
#include <fstream>
#include <string>
#include <codecvt>
#include <regex>
#include <thread>
#include <mutex>
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
    std::string normalized = std::regex_replace(input, std::regex("\r\n"), "\n"); // replace \r\n with \n
    normalized = std::regex_replace(normalized, std::regex("\r"), "\n");          // replace \r with \n
    return normalized;
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

int Utils::getTimeStamp()
{
    auto now = std::chrono::system_clock::now(); // get current time
    auto duration = now.time_since_epoch(); // get duration since epoch
    auto timestamp = std::chrono::duration_cast<std::chrono::seconds>(duration).count(); // convert to seconds
    return static_cast<int>(timestamp); // return as int
}

//--------------------------CallbackManager--------------------------//
int Utils::CallbackManager::registerCallback(const Callback &callback)
{
    std::lock_guard<std::mutex> lock(mutex);
    auto timeStamp = Utils::getTimeStamp();
    if (callbacks.find(timeStamp) == callbacks.end())
    {
        callbacks[timeStamp] = callback;
    }
    else
    {
        throw std::runtime_error("Callback already registered with same time stamp.");
    }
    return timeStamp;
}

void Utils::CallbackManager::callCallback(int callbackId, nlohmann::json &message)
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
