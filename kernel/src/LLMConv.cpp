#include <LLMConv.h>

#include <string>
#include <vector>
#include <thread>
#include <chrono>

#include <curl/curl.h>
#include <nlohmann/json.hpp>

//---------------------------HttpClient---------------------------//
bool HttpClient::httpResult::needRetry(int http_code) // check if need retry
{
    if (http_code == 429 || http_code == 500 || http_code == 502 || http_code == 503 || http_code == 504)
        return true; // retry for these status codes
    return false;
}

std::string HttpClient::httpResult::getErrorMessage(int http_code) // generate error_message
{
    switch (http_code)
    {
    case 400:
        return "Bad Request";
    case 401:
        return "Unauthorized";
    case 403:
        return "Forbidden";
    case 404:
        return "Not Found";
    case 429:
        return "Too Many Requests";
    case 500:
        return "Internal Server Error";
    case 502:
        return "Bad Gateway";
    case 503:
        return "Service Unavailable";
    }
    if (http_code >= 400 && http_code < 500)
        return "Client Error";
    if (http_code >= 500 && http_code < 600)
        return "Server Error";
    return "Unknown Error";
}

size_t HttpClient::nonStresamCallBack(void *ptr, size_t size, size_t nmemb, void *in_buffer)
{
    auto buffer = static_cast<std::string *>(in_buffer);
    size_t realsize = size * nmemb;
    buffer->append((char *)ptr, realsize);
    return realsize;
}

struct HttpClient::CallbackWrapper
{
    std::function<size_t(void *, size_t, size_t, void *)> func;
    HttpClient* client;
    void *originalBuffer;

    // static callback function, can be called by function ptr
    static size_t curlBridgeCallback(void *ptr, size_t size, size_t nmemb, void *userdata)
    {
        auto wrapper = static_cast<CallbackWrapper *>(userdata);
        auto returnSize =  wrapper->func(ptr, size, nmemb, wrapper->originalBuffer); // call the original callback function
        if(wrapper->client->stop)
            return 0;
        return returnSize;
    }
};

HttpClient::httpResult HttpClient::curlRequest(std::function<size_t(void *, size_t, size_t, void *)> callback, void *buffer, const std::string &request)
{
    // set request body
    curl_easy_setopt(curl, CURLOPT_POST, 1L); // set http method to POST
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request.c_str());

    // set waitting time
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, connect_timeout); // connect timeout 10 seconds

    // set callback
    std::shared_ptr<HttpClient::CallbackWrapper> wrapper = std::make_shared<CallbackWrapper>(CallbackWrapper{callback, this, buffer});
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, &CallbackWrapper::curlBridgeCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, wrapper.get());

    int retried = 0;
    long http_code = 0;
    while(retried <= max_retry)
    {
        // send request
        CURLcode res = curl_easy_perform(curl);
        if (res == CURLE_WRITE_ERROR) // interupt by user
        {
            return {200, "User interrupt", retried, ""}; // return the error message
        }
        if (res != CURLE_OK)
            return{0, "CURL error: " + std::string(curl_easy_strerror(res)), retried, ""}; // return the error message
        
        // handle http status code
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
        if (http_code == 200)
            break; // success, break the loop
        if(!httpResult::needRetry(http_code))
            break;
        retried++;
        if(retried <= max_retry)
        {
            int wait_time = std::min(2000, (int)std::pow(2, retried) * 250);
            std::this_thread::sleep_for(std::chrono::milliseconds(wait_time)); // wait for a while before retrying
        }
    }
    return {http_code, httpResult::getErrorMessage(http_code), retried, ""}; // return the http code and error message
}

size_t HttpClient::streamData::streamCallback(void *ptr, size_t size, size_t nmemb, void *streamdata)
{
    size_t realsize = size * nmemb;

    auto data = static_cast<HttpClient::streamData *>(streamdata);
    std::string *buffer = data->buffer;                       // for incomplete events

    // append new data to buffer
    buffer->append(static_cast<char *>(ptr), realsize);

    processSSE(data); // process the buffer to extract events

    return realsize;
}

void HttpClient::processSSE(streamData* streamdata)
{
    std::string *buffer = streamdata->buffer;                       // for incomplete events
    std::string *complete_response = streamdata->complete_response; // for complete response
    streamResponseParser parser = streamdata->parser;               // for parsing stream response
    LLMConv::streamCallbackFunc *callback = streamdata->callback;   // callback function

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
            std::string content;
            parser(data_str, content);// parse the json string
            complete_response->append(content); // append the content to complete response

            // callback
            if (callback && !content.empty())
                (*callback)(content); // call the callback function
        }
    }

    // keep the remaining data in buffer
    if (event_start < buffer->length())
        *buffer = buffer->substr(event_start);
    else
        buffer->clear();
}

HttpClient::HttpClient(const std::string &api_key, const std::string &api_url)
{
    // init curl handle
    curl = curl_easy_init();
    if(!curl)
        throw std::runtime_error("Cannot initialize CURL");
    // init http header
    headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    std::string auth_header = "Authorization: Bearer " + api_key;
    headers = curl_slist_append(headers, auth_header.c_str());
    // set url and header to curl
    curl_easy_setopt(curl, CURLOPT_URL, api_url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_VERBOSE, verbose); 
}

HttpClient::~HttpClient()
{
    if(headers) curl_slist_free_all(headers);
    if(curl) curl_easy_cleanup(curl);
}

HttpClient::httpResult HttpClient::sendRequest(const std::string &request_body)
{
    stop = false;
    std::string response_buffer; // buffer for response
    auto result = curlRequest(nonStresamCallBack, &response_buffer, request_body); // send request and handle error in uniform way
    result.response = response_buffer; // set response to result
    return result;
}

HttpClient::httpResult HttpClient::sendStreamRequest(const std::string &request_body, streamResponseParser parser, std::function<void(const std::string &)> callback)
{
    stop = false;
    std::string buffer;            // buffer for incomplete events
    std::string complete_response; // buffer for complete response
    auto callback_func = callback ? &callback : nullptr; // callback function
    auto streamdata = streamData(&buffer, &complete_response, parser, callback_func);
    
    httpResult result;
    try
    {
        result = curlRequest(streamData::streamCallback, &streamdata, request_body); // send request and handle error in uniform way
    }
    catch (const std::exception &e)
    {
        result.http_code = 599; // set http code to 599
        result.error_message = "parser error: " + std::string(e.what());
    }

    result.response = complete_response; // set response to result
    return result;
}

//---------------------------LLMConv---------------------------//
std::shared_ptr<LLMConv> LLMConv::createConv(
    type modelType,
    const std::string &modelName,
    const Config &config)
{
    if(modelType == type::OpenAIapi)
    {
        // Create an OpenAI API conversation object
        return std::shared_ptr<LLMConv>(new OpenAIConv(modelName, config));
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
    const Config &config)
{
    // create new instance of LLMConv with the new model name and config
    auto newConv = createConv(modelType, modelName, config);

    // copy the conversation history from the current instance to the new instance
    // do not copy strightly, because subclasses may have their own implement
    auto history = exportHistory();
    newConv->importHistory(history);

    return newConv;
}

void LLMConv::setMessage(const std::string &role, const std::string &content)
{
    auto message = Message{role, content};
    history.push_back(message);
}

// get string value of given key, if find multiple keys, return the first one
std::string LLMConv::getStringConfig(const Config &config, const std::string &key, const std::string &default_value, bool required) 
{
    auto it = config.find(key);
    if (it == config.end() || it->second.empty())
    {
        if(required)
            throw Error(Error::ErrorType::InvalidArgument, "\"" + key + "\" is not found in config or empty!");
        else
            return default_value; // return default value if not found and not required
    }
    return it->second;
}

int LLMConv::getIntConfig(const Config &config, const std::string &key, int default_value, bool required) 
{
    auto it = config.find(key);
    if (it == config.end() || it->second.empty())
    {
        if(required)
            throw Error(Error::ErrorType::InvalidArgument, "\"" + key + "\" is not found in config!");
        else
            return default_value; // return default value if not found and not required
    }
    try
    {
        return std::stoi(it->second);
    }
    catch (const std::exception &e)
    {
        throw Error(Error::ErrorType::InvalidArgument, "\"" + key + "\" must be an integer: " + it->second + "    \nstd::stoi throw: " + std::string(e.what()));
    }
}

//--------------------------OpenAIConv-------------------------//
bool OpenAIConv::OpenAIResponseParser::parseStreamChunk(const std::string &chunk, std::string &content)
{
    try
    {
        nlohmann::json json = nlohmann::json::parse(chunk);

        if (json.contains("choices") &&
            json["choices"].size() > 0 &&
            json["choices"][0].contains("delta") &&
            json["choices"][0]["delta"].contains("content"))
        {

            content = json["choices"][0]["delta"]["content"];
            return true;
        }
        return false; // no content found in the chunk
    }
    catch (const std::exception &e)
    {
        throw Error(Error::ErrorType::Parser, "json parse error: " + chunk + "    \nnlohmann::json throw: " + std::string(e.what()));
    }
}

std::string OpenAIConv::OpenAIResponseParser::parseFullResponse(const std::string &response)
{
    try
    {
        nlohmann::json json = nlohmann::json::parse(response);
        return json["choices"][0]["message"]["content"];
    }
    catch (const std::exception &e)
    {
        throw Error(Error::ErrorType::Parser, "json parse error: " + response + "    \nnlohmann::json throw: " + std::string(e.what()));
    }
}


OpenAIConv::OpenAIConv(const std::string &modelName, const Config &config) : LLMConv(modelName)
{
    auto api_key = getStringConfig(config, "api_key", "", true);
    auto api_url = getStringConfig(config, "api_url", "", true);
    auto max_retry = getIntConfig(config, "max_retry", 3, false);
    auto connect_timeout = getIntConfig(config, "connect_timeout", 10, false);

    // init httpClient
    httpClient = std::make_shared<HttpClient>(api_key, api_url); // create http client
    httpClient->setRetryOptions(max_retry, connect_timeout); // set retry options

    // init history.json
    history_json = nlohmann::json::array();
    // init request.json
    request = nlohmann::json::object();
    request["model"] = modelName;
}

bool OpenAIConv::test() const
{
    auto tempRequest = request;
    tempRequest["max_tokens"] = 1;
    tempRequest["messages"] = nlohmann::json::array({ { {"role", "user"}, {"content", "Hello"} } });
    tempRequest["stream"] = false;
    auto result = httpClient->sendRequest(tempRequest.dump());
    handleHttpResult(result);
    return true; 
}

void OpenAIConv::setOptions(const std::string& key, const std::string& value)
{
    request[key] = value; // set options to request
}

void OpenAIConv::setOptions(const std::string& key, const std::vector<std::string>& values)
{
    nlohmann::json json_values = nlohmann::json::array(); // create json array
    for (const auto& value : values)
    {
        json_values.push_back(value); // add value to json array
    }
    request[key] = json_values; // set options to request
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

std::string OpenAIConv::handleHttpResult(const HttpClient::httpResult &result)
{
    if (result.http_code == 200)
        return result.response; // success, return response
    else if(result.http_code == 0) // Curl error
        throw Error(Error::ErrorType::Network, std::string("Network error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code == 400) // Bad request
        throw Error(Error::ErrorType::InvalidArgument, std::string("Bad request error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code == 401 || result.http_code == 403) // Unauthorized
        throw Error(Error::ErrorType::Authorization, std::string("Authorization error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code == 404) // Not found
        throw Error(Error::ErrorType::NotFound, std::string("Not found error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code == 429) // Too many requests
        throw Error(Error::ErrorType::RateLimit, std::string("Rate limit error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code >= 500 && result.http_code < 600) // Server error
        throw Error(Error::ErrorType::Network, std::string("Server error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else if(result.http_code == 599) // Parser error
        throw Error(Error::ErrorType::Parser, std::string("Parser error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
    else // Unknown error
        throw Error(Error::ErrorType::Unknown, std::string("Unknown error: ") + result.error_message + " (HTTP code: " + std::to_string(result.http_code) + ")");
}

std::string OpenAIConv::getResponse()
{
    // set request body
    request["messages"] = history_json;
    request["stream"] = false;

    auto result = httpClient->sendRequest(request.dump()); // send request and handle error in uniform way
    auto content = handleHttpResult(result); // handle http result and return the response
    // parse response
    auto response = OpenAIResponseParser::parseFullResponse(content);
    if(!response.empty())
        setMessage("assistant", response);
    return response;
}

std::string OpenAIConv::getStreamResponse(streamCallbackFunc callBack)
{
    // set request body
    request["messages"] = history_json;
    request["stream"] = true;

    auto result = httpClient->sendStreamRequest(request.dump(), OpenAIResponseParser::parseStreamChunk, callBack); // send request and handle error in uniform way
    std::string response = handleHttpResult(result); // handle http result and return the response
    
    if (!response.empty())
        setMessage("assistant", response);
    return response; 
}

void OpenAIConv::stopConnection()
{
    httpClient->stopConnection();
}
