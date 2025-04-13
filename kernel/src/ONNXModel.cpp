#include <ONNXmodel.h>

#include <iostream>
#include <string>
#include <vector>
#include <stdexcept>
#include <memory>
#include <unordered_set>
#include <codecvt>

#include <algorithm>
#include <numeric>

#include <onnxruntime_cxx_api.h>

//--------------------------- Helper Functions ------------------------
// Convert wstring to string
std::string wstring_to_string(const std::wstring &wstr) 
{
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    return converter.to_bytes(wstr);
}

// set console to UTF-8 to avoid garbled characters
void setup_utf8_console()
{
#ifdef _WIN32
    // set console to UTF-8
    system("chcp 65001 > nul");

    // set locale to UTF-8
    std::ios_base::sync_with_stdio(false);
    std::locale utf8_locale(std::locale(), new std::codecvt_utf8<wchar_t>());
    std::wcout.imbue(utf8_locale);
#else
    // set locale to UTF-8
    std::locale::global(std::locale("en_US.UTF-8"));
#endif
}

/*
Print tensor data and shape for dubug
example:
>>> printTensorData(input_ids, "input_ids")
input_ids shape: [1 15 ]
Values (first 10): 1 5 100012 49124 27682 1343 3 48411 149308 226613
*/
void printTensorData(const Ort::Value &tensor, const std::string &name, int maxSamples = 10)
{
    auto typeInfo = tensor.GetTensorTypeAndShapeInfo();
    auto shape = typeInfo.GetShape();
    auto elemType = typeInfo.GetElementType();

    std::cout << name << " shape: [";
    for (auto dim : shape)
        std::cout << dim << " ";
    std::cout << "]" << std::endl;

    if (elemType == ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64)
    {
        auto data = tensor.GetTensorData<int64_t>();
        // 修复 accumulate - 确保初始值类型匹配
        int64_t size = 1;
        for (auto dim : shape)
            size *= dim; // 手动计算替代 std::accumulate

        // 修复 std::min 调用 - 确保类型匹配
        int sampleCount = (size < maxSamples) ? static_cast<int>(size) : maxSamples;

        std::cout << "Values (first " << sampleCount << "): ";
        for (int i = 0; i < sampleCount; i++)
        {
            std::cout << data[i] << " ";
        }
        std::cout << std::endl;
    }
    // 可以添加其他类型的处理...
}

// ------------------------ ONNXModel ------------------------
bool ONNXModel::is_initialized = false;
Ort::Env ONNXModel::env{nullptr}; 
std::unordered_set<std::wstring> ONNXModel::instancesModel;

void ONNXModel::initialize()
{
    if(is_initialized)
        throw std::runtime_error("ONNX environment has been initialized already.");
    env = Ort::Env(ORT_LOGGING_LEVEL_WARNING, "ONNXModelEnv"); // ONNX runtime will log warnings and errors
    is_initialized = true;
}

ONNXModel::ONNXModel(const std::wstring &targetModelDirPath, device dev, perfSetting perf): 
    allocator(),
    memoryInfo(Ort::MemoryInfo::CreateCpu(OrtDeviceAllocator, OrtMemTypeDefault)),
    modelDirPath(targetModelDirPath)
{
    // check if the model has been instantiated
    if (instancesModel.find(targetModelDirPath) != instancesModel.end())
        throw std::runtime_error("The model has been instantiated already: " + std::string(targetModelDirPath.begin(), targetModelDirPath.end()));

    // initialize 
    if(!is_initialized)
        initialize();

    // configure device and perf setting
    sessionOptions.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    if(dev == device::cuda)
    {
        OrtCUDAProviderOptions cudaOptions;
        sessionOptions.AppendExecutionProvider_CUDA(cudaOptions);
    }
    else if(dev == device::cpu)
    {
        if(perf == perfSetting::low) // limit max thread
        {
            sessionOptions.SetIntraOpNumThreads(2); 
            sessionOptions.SetInterOpNumThreads(2);
        }
        // sessionOptions use all thread in default
    }

    // open session
    session.reset(new Ort::Session(env, (targetModelDirPath + L"model.onnx").c_str(), sessionOptions));
    if(!session)
        throw std::runtime_error("Failed to load ONNX model: " + std::string(targetModelDirPath.begin(), targetModelDirPath.end()));

    // regist targetModelDirPath
    instancesModel.insert(targetModelDirPath);

    // update input and output names
    size_t numInputs = session->GetInputCount();
    size_t numOutputs = session->GetOutputCount();
    inputNames.resize(numInputs);
    outputNames.resize(numOutputs);
    for (size_t i = 0; i < numInputs; ++i)
    {
        Ort::AllocatedStringPtr inputNamePtr = session->GetInputNameAllocated(i, allocator);
        inputNames[i] = inputNamePtr.get();
    }
    for (size_t i = 0; i < numOutputs; ++i)
    {
        Ort::AllocatedStringPtr outputNamePtr = session->GetOutputNameAllocated(i, allocator);
        outputNames[i] = outputNamePtr.get();
    }
}

ONNXModel::~ONNXModel()
{
    // remove modelDirPath from instancesModel
    instancesModel.erase(modelDirPath);
    session.reset(); // release session
}

// ------------------------ EmbeddingModel ------------------------
EmbeddingModel::EmbeddingModel(const std::wstring &targetModelDirPath, device dev, perfSetting perf) : 
    ONNXModel(targetModelDirPath, dev, perf)
{
    // load tokenizer
    std::string modelPath = wstring_to_string(targetModelDirPath) + "sentencepiece.bpe.model";
    auto status = tokenizer.Load(modelPath.c_str());
    if (!status.ok())
    {
        throw std::runtime_error("Failed to load tokenizer model: " + modelPath);
    }

    // get embedding dimension from model
    // asume the second output is the embedding output
    Ort::TypeInfo typeInfo = session->GetOutputTypeInfo(1);
    embeddingDimension = typeInfo.GetTensorTypeAndShapeInfo().GetShape().back(); // get the last dimension of the output shape
}

std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> EmbeddingModel::tokenize(const std::string &text) const
{
    // tokenize text to ids
    std::vector<int> tempTokenIds;
    tokenizer.Encode(text, &tempTokenIds); // tokenize text to ids

    // get max length
    int64_t maxLength = tempTokenIds.size() + 2; // +2 for [BOS] and [EOS]
    if(maxLength > 8192)
    {
        std::cout << "Warning: the input text is too long, will be truncated to 8192." << std::endl;
        maxLength = 8192;
    }

    // move token ids to tokenIds and add [BOS] and [EOS] tokens
    std::vector<int64_t> tokenIds(maxLength, 0);
    auto copySize = std::min(tempTokenIds.size(), static_cast<size_t>(maxLength - 2));
    std::copy(tempTokenIds.begin(),
              tempTokenIds.begin() + copySize,
              tokenIds.begin() + 1);
    tokenIds[0] = tokenizer.bos_id(); // [BOS] token id
    tokenIds[maxLength - 1] = tokenizer.eos_id(); // [EOS] token id
    // generate attention mask
    std::vector<int64_t> attentionMask(maxLength, 1); // all tokens are valid tokens
    // generate shape
    std::vector<int64_t> shape = {1, static_cast<int64_t>(tokenIds.size())};

    return {std::move(tokenIds), std::move(attentionMask), std::move(shape)}; // return token ids and attention mask and shape
}

// this implement may be slow
// untested version
std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> EmbeddingModel::tokenize(const std::vector<std::string> &texts) const
{
    // tokenize batch of texts to ids, and compute max length
    int maxLength = 0;
    std::vector<std::vector<int>> tempTokenIds;
    for (const auto &text : texts)
    {
        std::vector<int> tempTokenId;
        tokenizer.Encode(text, &tempTokenId);
        maxLength = std::max(maxLength, static_cast<int>(tempTokenId.size()) + 2);
        tempTokenIds.push_back(std::move(tempTokenId));
    }

    // get max length
    if(maxLength > 8192)
    {
        std::cout << "Warning: the input text is too long, will be truncated to 8192." << std::endl;
        maxLength = 8192;
    }

    // move token ids to tokenIds and add [BOS] and [EOS] tokens, and generate attention mask
    std::vector<int64_t> tokenIds(maxLength * tempTokenIds.size(), tokenizer.pad_id()); // all tokens are padding tokens
    std::vector<int64_t> attentionMask(maxLength * tempTokenIds.size(), 0); // all tokens are padding tokens
    for(int i = 0; i < tempTokenIds.size(); i++)
    {
        int sequenceLength = std::min(static_cast<int>(tempTokenIds[i].size()), maxLength - 2);
        std::copy(tempTokenIds[i].begin(),
                  tempTokenIds[i].begin() + sequenceLength,
                  tokenIds.begin() + i * maxLength + 1);
        tokenIds[i * maxLength] = tokenizer.bos_id(); // [BOS] token id
        tokenIds[i * maxLength + sequenceLength + 1] = tokenizer.eos_id(); // [EOS] token id
        std::fill(attentionMask.begin() + i * maxLength,
                  attentionMask.begin() + i * maxLength + sequenceLength + 2, 1); // set attention mask to 1 for real tokens
    }
    // generate shape
    std::vector<int64_t> shape = {static_cast<int64_t>(tempTokenIds.size()), static_cast<int64_t>(maxLength)}; // batch size and max length

    // // convert to Ort tensor
    // std::vector<int64_t> shape = {static_cast<int64_t>(tempTokenIds.size()), static_cast<int64_t>(maxLength)}; // batch size and max length
    // Ort::Value token_ids_tensor = Ort::Value::CreateTensor<int64_t>(memoryInfo, tokenIds.data(), tokenIds.size(), shape.data(), shape.size());
    // Ort::Value attention_mask_tensor = Ort::Value::CreateTensor<int64_t>(memoryInfo, attentionMask.data(), attentionMask.size(), shape.data(), shape.size());

    return {std::move(tokenIds), std::move(attentionMask),std::move(shape)}; // return token ids and attention mask
}

// asume thai the first input is input_ids and the second is attention_mask
std::vector<float> EmbeddingModel::embed(const std::string &text) const
{
    // tokenize input text
    auto [input_ids_vector, input_attention_mask_vector, shape] = tokenize(text);

    // convert to Ort tensor
    Ort::Value input_ids = Ort::Value::CreateTensor<int64_t>(memoryInfo, input_ids_vector.data(), input_ids_vector.size(), shape.data(), shape.size());
    Ort::Value input_attention_mask = Ort::Value::CreateTensor<int64_t>(memoryInfo, input_attention_mask_vector.data(), input_attention_mask_vector.size(), shape.data(), shape.size());

    printTensorData(input_ids, "input_ids"); // debug
    printTensorData(input_attention_mask, "input_attention_mask"); // debug

    // prepare input tensors
    std::vector<Ort::Value> input_tensors;
    input_tensors.push_back(std::move(input_ids));
    input_tensors.push_back(std::move(input_attention_mask));

    // prepare input names and output names
    std::vector<const char *> inputNamesPtr = {inputNames[0].c_str(), inputNames[1].c_str()}; // assume that the first input is input_ids and the second is attention_mask
    std::vector<const char *> outputNamesPtr = {outputNames[1].c_str()}; // assume that the second output is the embedding output, only compute the embedding output to save time

    // run inference
    auto output_tensors = session->Run(Ort::RunOptions{nullptr}, inputNamesPtr.data(), input_tensors.data(), input_tensors.size(), outputNamesPtr.data(), outputNamesPtr.size());

    auto embeddingVectorPtr = output_tensors[0].GetTensorMutableData<float>(); // get the output tensor data
    std::vector<float> embeddingVector(embeddingVectorPtr, embeddingVectorPtr + embeddingDimension); // copy the output tensor data to a vector

    return embeddingVector; // return the embedding vector
}

