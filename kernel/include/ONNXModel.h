#pragma once
#include <string>
#include <vector>
#include <memory>
#include <filesystem>
#include <mutex>

#include <onnxruntime_cxx_api.h>
#include <sentencepiece_processor.h>

extern std::filesystem::path dataPath;

/*
This class is a base class of all ONNX models.
Can't be instantiated directly.
make sure one instance is only used by one thread. 
*/
class ONNXModel
{
public:
    enum class device{cpu, cuda, coreML}; // only support cpu or cuda now
    std::string device_to_string(device dev)
    {
        switch(dev)
        {
            case device::cpu: return "CPU";
            case device::cuda: return "CUDA";
            case device::coreML: return "CoreML";
            default: return "Unknown";
        }
    }


    static std::vector<device> getAvailableDevices()
    {
        std::vector<device> devices;
        if(checkCapability(device::cpu))
            devices.push_back(device::cpu);
        if(checkCapability(device::cuda))
            devices.push_back(device::cuda);
        if(checkCapability(device::coreML))
            devices.push_back(device::coreML);
        return devices;
    }
private:
    static std::mutex mutex;    // mutex for all static variables

    // storage all instances' modelDirPath, let instances with same model use sheared session to save memory
    static std::unordered_map<std::filesystem::path, std::weak_ptr<Ort::Session>> instancesSessions;
    static std::unordered_map<Ort::Session *, std::shared_ptr<std::mutex>> sessionMutexes; // mutex for each session, to make sure only one thread can run the session at a time

    static std::atomic<int> instanceCount;
    std::filesystem::path modelDirPath; // the path of the model directory

    static bool checkCapability(device dev);
  protected:
    static std::shared_ptr<Ort::Env> env; // manage ONNX environment, only initialized once
    static std::shared_ptr<Ort::AllocatorWithDefaultOptions> allocator; // allocator
    static std::shared_ptr<Ort::MemoryInfo> memoryInfo; // memory info for tensor creation

    std::shared_ptr<Ort::Session> session = nullptr; // ONNX session, include a model
    std::shared_ptr<std::mutex> sessionMutex = nullptr; // mutex for this session

    // ONNXRuntime is a graph-based runtime, when running, need to specify the input and output names of the model
    std::vector<std::string> inputNames; // storage input names of the model
    std::vector<std::string> outputNames; // stroage output names of the model

    // instantiate the ONNX model, 
    // will find `model.onnx` & `model.onnx_data` in the modelDirPath, 
    ONNXModel(std::filesystem::path targetModelDirPath, device dev = device::cpu, int maxThreads = 0);

public:
    // initialize the ONNX environment for all ONNX models
    static void initialize();

    // release the ONNX environment when all ONNX Model instances are destroyed
    static void release();
    // destructor
    ~ONNXModel();

};

/*
This class are designed to handle embedding models.
Derived from ONNXModel.
BE CAREFUL: some implementation may differ between different embedding models
make sure one instance is only used by one thread.
*/
class EmbeddingModel : public ONNXModel
{
private:
    int embeddingDimension; // embedding dimension, get from model
    int maxLength = 0;
    constexpr static int defaultMaxLength = 512; // default max length of input text, if the model does not have max length, set to 512
    std::shared_ptr<sentencepiece::SentencePieceProcessor> tokenizer = nullptr; // tokenizer of embedding model, use sentencepiece

    // tokenize input string to ids and attention mask
    // input string must be encoded in utf-8
    // asssume that the embedding model needs input sentences like <BOS>content<EOS> and <BOS> == <CLS>
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::string &text) const;

    // tokenize batch of strings to ids and attention mask
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::vector<std::string> &texts) const;

public:
    // instantiate the ONNX model,
    // will find `model.onnx` & `model.onnx_data` & `sentencepiece.bpe.model` in the modelDirPath,
    // modelDirPath should end with `/`
    EmbeddingModel(std::filesystem::path targetModelDirPath, device dev = device::cpu, int maxThreads = 0);
    ~EmbeddingModel() = default;

    // get embedding dimension
    inline int getDimension() const { return embeddingDimension; }
    inline int getMaxLength() const { return maxLength; }

    // generate embedding for a single string
    // input string must be encoded in utf-8
    std::vector<float> embed(const std::string &text) const;

    // generate embedding for a batch of strings
    std::vector<std::vector<float>> embed(const std::vector<std::string> &texts) const;
};

/*
This class are designed to handle embedding models.
Derived from ONNXModel.
*/
class RerankerModel : public ONNXModel
{
private:
    int maxLength = 0;
    constexpr static int defaultMaxLength = 512; // default max length of input text, if the model does not have max length, set to 512
    std::shared_ptr<sentencepiece::SentencePieceProcessor> tokenizer = nullptr;

    // assume that input sequence is like <BOS>query_content<EOS>doc_content<EOS> and <BOS> == <CLS>
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::string& query, const std::string& content) const;
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::string& query, const std::vector<std::string>& contents) const;

public:
    RerankerModel(std::filesystem::path targetModelDirPath, device dev = device::cpu, int maxThreads = 0);

    inline int getMaxLength() const { return maxLength; }

    // score all input contents with query
    float rank(const std::string &query, const std::string &content) const;
    std::vector<float> rank(const std::string &query, const std::vector<std::string> &contents) const;
};