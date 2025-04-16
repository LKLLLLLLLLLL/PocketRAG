#pragma once
#include <iostream>
#include <string>
#include <vector>
#include <set>
#include <functional>

#include <curl/curl.h>
#include <nlohmann/json.hpp>
// #include <ONNXModel.h>

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
    using streamCallBackFunc = std::function<void(const std::string&)>;

    enum class type{OpenAIapi, LlamaCpp}; // the type of the model, either OpenAI api or LlamaCpp

protected:
    std::string modelName; // the name of the model, must equal to the model name in api or in the model file
    std::vector<Message> history; // the conversation history
    bool stream; // whether to use streaming or not

public:
    LLMConv(std::string modelName, bool stream = true) : modelName(modelName), stream(stream) {}
    virtual ~LLMConv() {}

    // Get the model name
    std::string getModelName() const { return modelName; }

    // factory function, create a LLMConv object based on the model name and config
    static std::shared_ptr<LLMConv> createConv(
        type modelType,
        const std::string& modelName, 
        const std::map<std::string, std::string>& config, 
        bool stream = true
    );

    // change model 
    std::shared_ptr<LLMConv> resetModel(
        type modelType,
        const std::string &modelName, 
        const std::map<std::string, std::string> &config, 
        bool stream = true
    );
    // change model but keep the stream option
    std::shared_ptr<LLMConv> resetModel(
        type modelType,
        const std::string &modelName,
        const std::map<std::string, std::string> &config
    );

    virtual void setMessage(const std::string &role, const std::string &content);
    
    // send message and get responde
    // if stream = true, will return answer after the stream is finished
    virtual std::string getResponse() = 0;
    // send message and call streamCallBackFunc when a new response is received
    // if stream = false, will throw an exception
    virtual void getStreamResponse(streamCallBackFunc) = 0;

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
    CURL* curl; // a curl handle
    curl_slist* header; // a shared header

    std::string api_key; // your OpenAI API key
    std::string api_url; // the OpenAI API URL

    nlohmann::json request; // share request comtent except "messages"
    nlohmann::json history_json; // the conversation history in json format

    OpenAIConv(const std::string &modelName, const std::map<std::string, std::string> &config, bool stream); // private constructor to prevent direct instantiation
    friend class LLMConv; // allow LLMConv to access private members

public:
    ~OpenAIConv();

    // overloading function to save history both in vector and json
    void setMessage(const std::string &role, const std::string &content);
    void importHistory(const std::vector<Message> &history);

    // will return the response message whether stream is true or false
    // if stream is true, will return the response after the stream is finished
    std::string getResponse() override;
    // will call streamCallBackFunc when a new response is received
    // if stream is false, will throw an exception
    void getStreamResponse(streamCallBackFunc callBack) override;
};

class LlamacppConv : public LLMConv
{
    //TODO
};