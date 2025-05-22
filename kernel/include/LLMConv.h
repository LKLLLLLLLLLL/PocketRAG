#pragma once
#include <string>
#include <vector>
#include <map>
#include <functional>

#include <curl/curl.h>
#include <nlohmann/json.hpp>

namespace
{
    class CurlInitializer {
    public:
        CurlInitializer() { curl_global_init(CURL_GLOBAL_ALL); }
        ~CurlInitializer() { curl_global_cleanup(); }
    };
    static CurlInitializer curlInitializer; // make sure curl is initialized before any other code
}

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

        static bool needRetry(int http_code); // check if need retry
        
        static std::string getErrorMessage(int http_code); // generate error_message
    };

private:
    CURL* curl;
    curl_slist *headers;

    int max_retry = 0; // max retry count, default 0, no retry
    int connect_timeout = 10; // connect timeout, s, default 10s
    bool verbose = false; // verbose mode, default false

    std::atomic<bool> stop = false; // stop flag, default false

    // join returned data to a string
    static size_t nonStresamCallBack(void *ptr, size_t size, size_t nmemb, void *in_buffer);

    // wrap std::function to be used as a function ptr
    // used in curlRequest()
    struct CallbackWrapper;
    friend struct CallbackWrapper;

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
    void setRetryOptions(int max_retry = 0, int connect_timeout = 10, bool verbose = false)
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

    // stop stream or retries and return http code 200
    void stopConnection() { stop = true; }
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

    struct TokenUsage
    {
        int prompt_tokens;     // input tokens
        int completion_tokens; // output tokens
        int total_tokens;      // equal to prompt_tokens + completion_tokens

        TokenUsage operator+(const TokenUsage &other) const
        {
            return {prompt_tokens + other.prompt_tokens, completion_tokens + other.completion_tokens,
                    total_tokens + other.total_tokens};
        }
    };

protected:
    std::string modelName; // the name of the model, must equal to the model name in api or in the model file
    std::vector<Message> history; // the conversation history

    // helper function for parsing config
    static std::string getStringConfig(const Config &config, const std::string &key, const std::string &default_value, bool required = false);
    static int getIntConfig(const Config &config, const std::string &key, int default_value, bool required = false);

    LLMConv(std::string modelName) : modelName(modelName) {}
public: 
    virtual ~LLMConv() {}

    // Get the model name
    std::string getModelName() const { return modelName; }

    // test apikey url and model name
    virtual bool test() const = 0;

    // factory function, create a LLMConv object based on the model name and config
    static std::shared_ptr<LLMConv> createConv(type modelType, const std::string& modelName, const Config& config);

    // change model
    std::shared_ptr<LLMConv> resetModel(type modelType, const std::string &modelName, const Config &config);

    virtual void setOptions(const std::string& key, const std::string& value) = 0;
    virtual void setOptions(const std::string& key, const std::vector<std::string>& values) = 0;
    virtual void setOptions(const std::string& key, int value) = 0;

    virtual void setMessage(const std::string &role, const std::string &content);
    
    // send message and get responde, will automatically set stream to false
    virtual std::string getResponse() = 0;
    // send message and call streamCallBackFunc when a new response is received
    // will automatically set stream to true
    virtual std::string getStreamResponse(streamCallbackFunc) = 0;

    // return three type of token usage
    // for stream response, because api will not return the token usage, it only estimate the token usage
    virtual TokenUsage getLastResponseUsage() = 0;

    virtual void stopConnection() = 0;

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
    OpenAIConv(const std::string &modelName, const Config &config); // private constructor to prevent direct instantiation
    friend class LLMConv; // allow LLMConv to access private members

    TokenUsage tokenUsage;

    // parse a chunk of stream response, will not set the token usage
    bool parseStreamChunk(const std::string &chunk, std::string &content);
    // parse the full response, this will automatically set the token usage
    // if setDeltaUsage is true, it will set completion_tokens = new_prompt_tokens - old_prompt_tokens
    std::string parseFullResponse(const std::string &response, bool setDeltaUsage = false);

    // handle http result and return the response
    // will throw an exception if http code is not 200
    static std::string handleHttpResult(const HttpClient::httpResult &result);

    // this method will send two requests to api, to calculate the token usage
    int calculateTokenUsage();

public: 
    ~OpenAIConv() = default;

    // test apikey, url, model name, and network connection
    // will throw an exception if test failed
    bool test() const override;

    // set options in the request, this options will be sent to the api
    // cannot set options in Config, if need to set options in Config, please use resetModel()
    // this method has no check, make sure the key and value are valid to the api
    void setOptions(const std::string& key, const std::string& value) override;
    // set options in the request, this options will be sent to the api
    // cannot set options in Config, if need to set options in Config, please use resetModel()
    // this method has no check, make sure the key and value are valid to the api
    void setOptions(const std::string& key, const std::vector<std::string>& values) override;
    void setOptions(const std::string &key, int value) override;

    void setMessage(const std::string &role, const std::string &content) override;
    
    // overloading function to save history both in vector and json
    void importHistory(const std::vector<Message> &history) override;

    // will return the response message, and set stream to false
    std::string getResponse() override;
    // will call streamCallBackFunc when a new response is received, set stream to true
    std::string getStreamResponse(streamCallbackFunc callBack) override;

    // return token usage of the last response
    TokenUsage getLastResponseUsage() override;

    // stop connection and return received content
    // safe to be called by other threads
    void stopConnection() override;
};

/*
This class handles a conversation to local LlamaCpp model.
Derived from LLMConv.
*/
class LlamacppConv : public LLMConv
{
    //TODO
};