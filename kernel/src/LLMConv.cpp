#include <LLMConv.h>

#include <iostream>
#include <string>
#include <vector>

#include <curl/curl.h>
#include <nlohmann/json.hpp>

//---------------------------LLMConv---------------------------//
std::shared_ptr<LLMConv> LLMConv::createConv(
    type modelType,
    const std::string &modelName,
    const std::map<std::string, std::string> &config,
    bool stream)
{
    if(modelType == type::OpenAIapi)
    {
        // Create an OpenAI API conversation object
        return std::shared_ptr<LLMConv>(new OpenAIConv(modelName, config, stream));
    }
    else if(modelType == type::LlamaCpp)
    {
        // Create a LlamaCpp conversation object
        // return std::make_shared<LlamacppConv>(modelName, config, stream);
        throw std::invalid_argument("LlamaCpp model type is not implemented yet");
    }
    else
    {
        throw std::invalid_argument("Unknown model type");
    }
}

std::shared_ptr<LLMConv> LLMConv::resetModel(
    type modelType,
    const std::string &modelName,
    const std::map<std::string, std::string> &config,
    bool stream)
{
    // create new instance of LLMConv with the new model name and config
    auto newConv = createConv(modelType, modelName, config, stream);

    // copy the conversation history from the current instance to the new instance
    // do not copy strightly, because subclasses may have their own implement
    auto history = exportHistory();
    newConv->importHistory(history);

    return newConv;
}

std::shared_ptr<LLMConv> LLMConv::resetModel(
    type modelType,
    const std::string &modelName,
    const std::map<std::string, std::string> &config)
{
    return resetModel(modelType, modelName, config, this->stream);
}

void LLMConv::setMessage(const std::string &role, const std::string &content)
{
    auto message = Message{role, content};
    history.push_back(message);
}


//--------------------------OpenAIConv-------------------------//
OpenAIConv::OpenAIConv(const std::string &modelName, const std::map<std::string, std::string> &config, bool stream): LLMConv(modelName, stream)
{
    // parse config and set the parameters
    auto value = config.find("api_key");
    if(value == config.end())
        throw std::invalid_argument("\"api_key\" not found in config");
    api_key = value->second;
    value = config.find("api_url");
    if(value == config.end())
        throw std::invalid_argument("\"api_url\" not found in config");
    api_url = value->second;
    int max_tokens = 100; // default max tokens
    value = config.find("max_tokens");
    if(value != config.end())   
    {
        try
        {
            max_tokens = std::stoi(value->second);
        }
        catch (const std::exception &e)
        {
            throw std::invalid_argument("\"max_tokens\" is not a valid integer: " + value->second);
        }
    }

    // init curl handle
    curl = curl_easy_init();
    if(!curl)
        throw std::runtime_error("Cannot initialize CURL");
    // init http header
    header = nullptr;
    header = curl_slist_append(header, "Content-Type: application/json");
    std::string auth_header = "Authorization: Bearer " + api_key;
    header = curl_slist_append(header, auth_header.c_str());
    // init history.json
    history_json = nlohmann::json::array();
    // init request.json
    request = nlohmann::json::object();
    request["model"] = modelName;
    request["stream"] = stream; // enable streaming
    request["max_tokens"] = max_tokens; // set max tokens
    // set curl options: request url, header; json body will set when call getResponse
    curl_easy_setopt(curl, CURLOPT_URL, api_url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header);
    curl_easy_setopt(curl, CURLOPT_VERBOSE, 1L); //for debug
}

OpenAIConv::~OpenAIConv()
{
    if(header) curl_slist_free_all(header);
    if(curl) curl_easy_cleanup(curl);
}

void OpenAIConv::setMessage(const std::string &role, const std::string &content)
{
    // set message to history
    LLMConv::setMessage(role, content);
    // set message to json
    history_json.push_back({{"role", role}, {"content", content}});
}

void OpenAIConv::importHistory(const std::vector<Message> &history)
{
    // copy history to history
    LLMConv::importHistory(history);

    //copy history to history_json
    history_json.clear();
    for(const auto &message : history)
    {
        nlohmann::json json_message;
        json_message["role"] = message.role;
        json_message["content"] = message.content;
        history_json.push_back(json_message);
    }
}

// helper function to write response to string, only valid in LLMConc.cpp
// used in OpenAIConv::getResponse()
static size_t curlCallBack(void *ptr, size_t size, size_t nmemb, std::string *buffer)
{
    size_t realsize = size * nmemb;
    buffer->append((char *)ptr, realsize);
    return realsize;
}

// helper function to parse stream response
// used in OpenAIConv::getResponse()
static size_t streamCurlCallback(void *ptr, size_t size, size_t nmemb, std::pair<std::string *, std::string *> *response_buffer)
{
    size_t realsize = size * nmemb;

    std::string *buffer = response_buffer->first; // for incomplete events
    std::string *complete = response_buffer->second; // for complete response

    // append new data to buffer
    buffer->append(static_cast<char *>(ptr), realsize);

    // parse buffer, buffer may have several complete events and incomplete events
    size_t pos = 0;
    size_t event_start = 0;
    while ((pos = buffer->find("\n\n", event_start)) != std::string::npos)
    {
        // extract the event from buffer
        std::string event = buffer->substr(event_start, pos - event_start + 2);
        event_start = pos + 2;

        // find the start of the event
        if (event.find("data: ") == 0)
        {
            std::string data_str = event.substr(6); // skip "data: " prefix
            if (data_str.length() >= 2)
                data_str = data_str.substr(0, data_str.length() - 2); // remove "\n\n" at the end

            if (data_str == "[DONE]") // check for end signal
                continue;
            
            // parse json
            try
            {
                nlohmann::json json = nlohmann::json::parse(data_str);
                std::string content = json["choices"][0]["delta"]["content"];
                complete->append(content);
            }
            catch (const std::exception &e)
            {
                throw std::runtime_error("Wrong request format: " + data_str +
                                         "\n    nlohmann_json throw: " + std::string(e.what()));
            }
        }
    }

    // keep the remaining data in buffer
    if (event_start < buffer->length())
        *buffer = buffer->substr(event_start);
    else
        buffer->clear();

    return realsize;
}

std::string OpenAIConv::getResponse()
{
    // set request body
    request["messages"] = history_json;
    std::string request_body = request.dump();
    curl_easy_setopt(curl, CURLOPT_POST, 1L); // set http method to POST
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request_body.c_str());
    // set waitting time
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L); // connect timeout 10 seconds
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L); // timeout 60 seconds

    std::string return_response;
    if(stream) // stream mode
    {
        std::string buffer;            // buffer for incomplete events
        std::string complete_response; // buffer for complete response
        std::pair<std::string *, std::string *> response_buffer(&buffer, &complete_response);

        // set response buffer and callback function
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, streamCurlCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_buffer);

        // send request
        CURLcode res = curl_easy_perform(curl);
        if (res != CURLE_OK)
        {
            throw std::runtime_error("CURL error: " + std::string(curl_easy_strerror(res)));
        }

        // checck HTTP status code
        long http_code = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
        if (http_code != 200)
        {
            throw std::runtime_error("HTTP error: " + std::to_string(http_code));
        }

        // streamCurlCallback will put the response to complete_response
        return_response = complete_response;
    }
    else // non-stream mode
    {
        // set response buffer
        std::string response_buffer;
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlCallBack); // curl cannot write to string directly, need to use a callback function
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_buffer);

        // send request
        CURLcode res = curl_easy_perform(curl);
        if(res != CURLE_OK)
        {
            throw std::runtime_error("CURL error: " + std::string(curl_easy_strerror(res)));
        }

        // check HTTP status code
        long http_code = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
        if(http_code != 200)
        {
            throw std::runtime_error("HTTP error: " + std::to_string(http_code));
        }

        // parse response
        nlohmann::json response_json = nlohmann::json::parse(response_buffer);
        try
        {
            std::string response = response_json["choices"][0]["message"]["content"];
            setMessage("assistant", response);
            return_response = response;
        }
        catch (const std::exception &e)
        {
            throw std::runtime_error("Wrong request format: " + response_buffer +
                                    "\n    nlohmann_json throw: " + std::string(e.what()));
        }
    }

    return return_response;
}

// helper function to parse stream response and call the callback function every time a new response is received
// used in OpenAIConv::getStreamResponse()
static size_t streamCallCurlCallback(void *ptr, size_t size, size_t nmemb, std::tuple<std::string *, std::string *, LLMConv::streamCallBackFunc *> *userData)
{
    size_t realsize = size * nmemb;

    std::string *buffer = std::get<0>(*userData);                // for incomplete events
    std::string *complete = std::get<1>(*userData);         // for complete response
    LLMConv::streamCallBackFunc *callback = std::get<2>(*userData); // callback function

    // append new data to buffer
    buffer->append(static_cast<char *>(ptr), realsize);

    // parse buffer, buffer may have several complete events and incomplete events
    size_t pos = 0;
    size_t event_start = 0;
    while ((pos = buffer->find("\n\n", event_start)) != std::string::npos)
    {
        // extract the event from buffer
        std::string event = buffer->substr(event_start, pos - event_start + 2);
        event_start = pos + 2;

        // find the start of the event
        if (event.find("data: ") == 0)
        {
            std::string data_str = event.substr(6); // skip "data: " prefix
            if (data_str.length() >= 2)
                data_str = data_str.substr(0, data_str.length() - 2); // remove "\n\n" at the end

            if (data_str == "[DONE]") // check for end signal
                continue;

            // parse json
            try
            {
                nlohmann::json json = nlohmann::json::parse(data_str);
                std::string content = json["choices"][0]["delta"]["content"];
                complete->append(content);
                // call the callback function with the new response
                (*callback)(content);
            }
            catch (const std::exception &e)
            {
                throw std::runtime_error("Wrong request format: " + data_str +
                                         "\n    nlohmann_json throw: " + std::string(e.what()));
            }
        }
    }

    // keep the remaining data in buffer
    if (event_start < buffer->length())
        *buffer = buffer->substr(event_start);
    else
        buffer->clear();

    return realsize;
}

void OpenAIConv::getStreamResponse(streamCallBackFunc callBack)
{
    if(!stream)
        throw std::runtime_error("Stream mode is not enabled, please set stream to true when creating the conversation object.");
    // set request body
    request["messages"] = history_json;
    std::string request_body = request.dump();
    curl_easy_setopt(curl, CURLOPT_POST, 1L); // set http method to POST
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request_body.c_str());
    // set waitting time
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L); // connect timeout 10 seconds
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);        // timeout 60 seconds

    std::string buffer;            
    std::string complete_response; 
    auto userData = std::make_tuple(&buffer, &complete_response, &callBack);
    // set response buffer and callback function
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, streamCallCurlCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &userData);

    // send request
    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK)
    {
        throw std::runtime_error("CURL error: " + std::string(curl_easy_strerror(res)));
    }

    // checck HTTP status code
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    if (http_code != 200)
    {
        throw std::runtime_error("HTTP error: " + std::to_string(http_code));
    }

    if (!complete_response.empty())
    {
        setMessage("assistant", complete_response);
    }
}

