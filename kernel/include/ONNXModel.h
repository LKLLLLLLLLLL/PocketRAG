#pragma once
#include <string>
#include <vector>
#include <stdexcept>
#include <memory>
#include <unordered_set>

#include <onnxruntime_cxx_api.h>
#include <sentencepiece_processor.h>

// set console to UTF-8 on Windows
void setup_utf8_console();
// Convert wstring to string
std::string wstring_to_string(const std::wstring &wstr);

/*
This class is a base class of all ONNX models.
Can't be instantiated directly.
this is a single threaded class.
*/
class ONNXModel
{
public:
    enum class device{cpu, cuda}; // only support cpu or cuda now
    enum class perfSetting{low, high}; // set performance exepect, only have effect on cpu
private:
    static bool is_initialized; // flag the initialization of ONNX environment 

    // storage all instances' modelDirPath, make sure no two instances have the same modelDirPath, for saving memory
    static std::unordered_set<std::wstring> instancesModel;

    std::wstring modelDirPath; // the path of the model directory
protected:
    static std::shared_ptr<Ort::Env> env; // manage ONNX environment, only initialized once
    static std::shared_ptr<Ort::AllocatorWithDefaultOptions> allocator; // allocator
    static std::shared_ptr<Ort::MemoryInfo> memoryInfo; // memory info for tensor creation
    std::shared_ptr<Ort::Session> session = nullptr; // ONNX session, loaded with model
    // std::shared_ptr<Ort::SessionOptions> sessionOptions = nullptr; // session options, can be customized for each model


    // ONNXRuntime is a graph-based runtime, when running, need to specify the input and output names of the model
    std::vector<std::string> inputNames; // storage input names of the model
    std::vector<std::string> outputNames; // stroage output names of the model

    // instantiate the ONNX model, 
    //will find `model.onnx` & `model.onnx_data` in the modelDirPath, 
    //modelDirPath should end with `/`
    ONNXModel(const std::wstring& targetModelDirPath, device dev = device::cpu, perfSetting perf = perfSetting::high);

public:
    // initialize the ONNX environment for all ONNX models
    static void initialize();
    // destructor
    virtual ~ONNXModel();

};

/*
This class are designed to handle embedding models. 
Derived from ONNXModel.
BE CAREFUL: some implementation may differ between different embedding models
*/
class EmbeddingModel : public ONNXModel
{
private:
    int embeddingId; // embedding id from sql table
    int embeddingDimension; // embedding dimension, get from model
    int maxInputLength; // max input length,  can be changed in the model
    std::shared_ptr<sentencepiece::SentencePieceProcessor> tokenizer = nullptr; // tokenizer of embedding model, use sentencepiece

    // tokenize input string to ids and attention mask
    // input string must be encoded in utf-8
    // asume that the embedding model needs input sentences like <BOS>content<EOS>
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::string &text) const;

    // tokenize batch of strings to ids and attention mask
    std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> tokenize(const std::vector<std::string> &texts) const;

public:
    // instantiate the ONNX model,
    // will find `model.onnx` & `model.onnx_data` & `sentencepiece.bpe.model` in the modelDirPath,
    // modelDirPath should end with `/`
    EmbeddingModel(int embeddingId, int maxInputLength,  const std::wstring &targetModelDirPath, device dev = device::cpu, perfSetting perf = perfSetting::high);

    // get embedding dimension
    inline int getDimension() const { return embeddingDimension; }
    // get embedding id
    inline int getId() const { return embeddingId; } 
    // get max input length
    inline int getMaxInputLength() const { return maxInputLength; }

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
class RerankingModel : public ONNXModel
{
    // TODO
};