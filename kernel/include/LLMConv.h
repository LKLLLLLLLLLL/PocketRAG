#pragma once
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <functional>

#include <curl/curl.h>
#include <nlohmann/json.hpp>
// #include <ONNXModel.h>

/*
This class is used to initialize and cleanup curl library.
*/
class CurlInitializer {
public:
    CurlInitializer() { curl_global_init(CURL_GLOBAL_ALL); }
    ~CurlInitializer() { curl_global_cleanup(); }
};

/*
This class handles http sessions to openai api.
*/
class HttpClient
{
public:
    using streamResponseParser = std::function<bool(const std::string&, std::string&)>; // function to parse stream response
    using streamCallbackFunc = std::function<void(const std::string &)>; // function to handle stream response

    // store http code and error message
    // set 0 to CURL error code, and set 599 to parser error code
    struct httpResult
    {
        int http_code; // http status code
        std::string error_message; // http error message
        int retry_count; // retry count
        std::string response; // response content

        static bool needRetry(int http_code) // check if need retry
        {
            if (http_code == 429 || http_code == 500 || http_code == 502 || http_code == 503 || http_code == 504)
                return true; // retry for these status codes
            return false;
        }
        
        static std::string getErrorMessage(int http_code) // generate error_message
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
            if(http_code >= 400 && http_code < 500)
                return "Client Error";
            if(http_code >= 500 && http_code < 600)
                return "Server Error";
            return "Unknown Error";
        }
    };

private:
    CURL* curl;
    curl_slist *headers;

    int max_retry = 0; // max retry count, default 0, no retry
    int connect_timeout = 10; // connect timeout, s, default 10s
    bool verbose = false; // verbose mode, default false

    // join returned data to a string
    static size_t curlCallBack(void *ptr, size_t size, size_t nmemb, void *in_buffer);

    // wrap std::function to be used as a function ptr
    // used in curlRequest()
    struct CallbackWrapper;

    // send request and handle error in uniform way
    HttpClient::httpResult curlRequest(std::function<size_t(void *, size_t, size_t, void *)> callback, void *buffer, const std::string &request);

    /*
    handle stream response 
    has a streamCallback function, can be used like:
    ```
    auto streamdata = streamData(&buffer, &complete_response, &callBack);
    curlRequest(streamData::streamCallback, &streamdata)
    ```
    */
    struct streamData
    {
        std::string *buffer;                   // for uncomplete events
        std::string *complete_response;        // for complete response
        streamResponseParser parser;           // for parsing stream response
        streamCallbackFunc *callback; // for callback func, if no callback, set to nullptr

        streamData(std::string *buffer, std::string *complete_response, streamResponseParser parser, streamCallbackFunc *callback = nullptr) : buffer(buffer), complete_response(complete_response), parser(parser), callback(callback) {}

        static size_t streamCallback(void *ptr, size_t size, size_t nmemb, void *streamdata);
    };

    static void processSSE(streamData* streamdata);

public:
    HttpClient(const std::string &api_key, const std::string &api_url);
    ~HttpClient();

    // set max retry count and connect timeout
    void setRetryOptions(int max_retry = 0, int connect_timeout = 10000, bool verbose = false)
    {
        this->max_retry = max_retry;
        this->connect_timeout = connect_timeout;
        this->verbose = verbose;
    }

    // send request to api 
    // return the response the full http body
    HttpClient::httpResult sendRequest(const std::string &request_body);
    // send request to api and call parser to parse response and then callback function when a new response is received
    // will return the complete response(parsed by parser) when the stream is finished
    HttpClient::httpResult sendStreamRequest(const std::string &request_body, streamResponseParser parser, std::function<void(const std::string &)> callback = nullptr);
};

/*
This class handles a conversation to LLMmodel.
*/
class LLMConv
{
public:
    struct Message
    {
        std::string role; // the role of the message, either "user" or "assistant"
        std::string content; // the content of the message
    };

    // callback function when streaming response is received
    using streamCallbackFunc = HttpClient::streamCallbackFunc;

    enum class type{OpenAIapi, LlamaCpp}; // the type of the model, either OpenAI api or LlamaCpp

    using Config = std::map<std::string, std::string>; // the config of the model, can be used to set api key, api url, etc.

    // self-defined exception class for error handling
    class Error : public std::exception
    {
    public:
        enum class ErrorType {Network, NotFound, Authorization, RateLimit, Parser, InvalidArgument, Unknown};
        ErrorType error_type;      // error type
        std::string error_message; // error message
        Error(ErrorType error_type, const std::string &error_message) : error_type(error_type), error_message(error_message) {}
        const char* what() const noexcept override { return error_message.c_str(); } // override what() function to return error message
    };

protected:
    std::string modelName; // the name of the model, must equal to the model name in api or in the model file
    std::vector<Message> history; // the conversation history
    bool stream; // whether to use streaming or not

    // helper function for parsing config
    static std::string getStringConfig(const Config &config, const std::string &key, const std::string &default_value, bool required = false);
    static int getIntConfig(const Config &config, const std::string &key, int default_value, bool required = false);

public: 
    LLMConv(std::string modelName, bool stream = true) : modelName(modelName), stream(stream) {}
    virtual ~LLMConv() {}

    // Get the model name
    std::string getModelName() const { return modelName; }

    // factory function, create a LLMConv object based on the model name and config
    static std::shared_ptr<LLMConv> createConv(
        type modelType,
        const std::string& modelName, 
        const Config& config, 
        bool stream = true
    );

    // change model
    std::shared_ptr<LLMConv> resetModel(
        type modelType,
        const std::string &modelName,
        const Config &config,
        bool stream = true);
    // change model but keep the stream option
    std::shared_ptr<LLMConv> resetModel(
        type modelType,
        const std::string &modelName,
        const Config &config);

    virtual void setOptions(const std::string& key, const std::string& value) = 0;
    virtual void setOptions(const std::string& key, const std::vector<std::string>& values) = 0;

    virtual void setMessage(const std::string &role, const std::string &content);
    
    // send message and get responde
    // if stream = true, will return answer after the stream is finished
    virtual std::string getResponse() = 0;
    // send message and call streamCallBackFunc when a new response is received
    // if stream = false, will throw an exception
    virtual void getStreamResponse(streamCallbackFunc) = 0;

    // export message histroy in a vector
    std::vector<Message> exportHistory() const {return history;} ;
    // import message history in a vector
    virtual void importHistory(const std::vector<Message> &history) {this->history = history;};
};

/*
This class handles a conversation to OpenAI api. 
Derived from LLMConv.
*/
class OpenAIConv : public LLMConv
{
private:
    std::shared_ptr<HttpClient> httpClient; // http client to send request

    nlohmann::json request; // share request comtent except "messages"
    nlohmann::json history_json; // the conversation history in json format

    // let openAIConv instance can only be created by LLMConv::createConv
    OpenAIConv(const std::string &modelName, const Config &config, bool stream); // private constructor to prevent direct instantiation
    friend class LLMConv; // allow LLMConv to access private members

    class OpenAIResponseParser // nested class to parse response
    {
    public:
        // parse a chunk of stream response
        static bool parseStreamChunk(const std::string &chunk, std::string &content);
        // parse the full response
        static std::string parseFullResponse(const std::string &response);
    };

    // handle http result and return the response
    // will throw an exception if http code is not 200
    std::string handleHttpResult(const HttpClient::httpResult &result);

public: 
    ~OpenAIConv() = default;

    // set options in the request, this options will be sent to the api
    // cannot set options in Config, if need to set options in Config, please use resetModel()
    // this method has no check, make sure the key and value are valid to the api
    void setOptions(const std::string& key, const std::string& value) override;
    // set options in the request, this options will be sent to the api
    // cannot set options in Config, if need to set options in Config, please use resetModel()
    // this method has no check, make sure the key and value are valid to the api
    void setOptions(const std::string& key, const std::vector<std::string>& values) override;

    void setMessage(const std::string &role, const std::string &content);
    
    // overloading function to save history both in vector and json
    void importHistory(const std::vector<Message> &history);

    // will return the response message whether stream is true or false
    // if stream is true, will return the response after the stream is finished
    std::string getResponse() override;
    // will call streamCallBackFunc when a new response is received
    // if stream is false, will throw an exception
    void getStreamResponse(streamCallbackFunc callBack) override;
};

/*
This class handles a conversation to local LlamaCpp model.
Derived from LLMConv.
*/
class LlamacppConv : public LLMConv
{
    //TODO
};