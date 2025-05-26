#include "ONNXmodel.h"

#include <iostream>
#include <string>
#include <sys/stat.h>
#include <vector>
#include <memory>
#include <unordered_map>
#include <filesystem>
#include <algorithm>

#include <onnxruntime_cxx_api.h>

#include "Utils.h"

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
        
        int64_t size = 1;
        for (auto dim : shape)
            size *= dim; 

        
        int sampleCount = (size < maxSamples) ? static_cast<int>(size) : maxSamples;

        std::cout << "Values (first " << sampleCount << "): ";
        for (int i = 0; i < sampleCount; i++)
        {
            std::cout << data[i] << " ";
        }
        std::cout << std::endl;
    }
}

// ------------------------ ONNXModel ------------------------ //
std::shared_ptr<Ort::Env> ONNXModel::env;

std::mutex ONNXModel::mutex;
std::unordered_map<std::filesystem::path, std::weak_ptr<Ort::Session>> ONNXModel::instancesSessions;

std::shared_ptr<Ort::AllocatorWithDefaultOptions> ONNXModel::allocator;
std::shared_ptr<Ort::MemoryInfo> ONNXModel::memoryInfo;

std::unordered_map<Ort::Session *, std::shared_ptr<std::mutex>> ONNXModel::sessionMutexes;

namespace
{
    struct ONNXInitializer
    {
    private:
        ONNXInitializer()
        {
            ONNXModel::initialize();
        }
    public:
        static void initialize()
        {
            static ONNXInitializer instance;
        }
    };
}

void ONNXModel::initialize()
{
    env.reset(new Ort::Env(ORT_LOGGING_LEVEL_WARNING, "ONNXModelEnv")); // ONNX runtime will log warnings and errors
    allocator.reset(new Ort::AllocatorWithDefaultOptions()); // default allocator
    memoryInfo.reset(new Ort::MemoryInfo(Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault))); // default memory info in cpu
}

ONNXModel::ONNXModel(std::filesystem::path targetModelDirPath, device dev, perfSetting perf): 
    modelDirPath(targetModelDirPath)
{
    ONNXInitializer::initialize();
    {
        std::lock_guard<std::mutex> lock(mutex); // lock the mutex

        // check if there is already a session with the same modelDirPath
        bool isExist = false;
        auto it = instancesSessions.find(targetModelDirPath);
        if(it != instancesSessions.end() && !it->second.expired()) // session exists
        {
            auto sessionPtr = it->second.lock(); // get the session pointer
            if(sessionPtr)
            {
                session = sessionPtr; // use the existing session
                isExist = true;
            }
        }
        if(!isExist) // no existing session, create a new one
        {
            // configure device and perf setting
            Ort::SessionOptions sessionOptions;
            sessionOptions.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
            if (dev == device::cuda)
            {
                OrtCUDAProviderOptions cudaOptions;
                sessionOptions.AppendExecutionProvider_CUDA(cudaOptions);
            }
            else if (dev == device::cpu)
            {
                if (perf == perfSetting::low) // limit max thread
                {
                    sessionOptions.SetIntraOpNumThreads(2);
                    sessionOptions.SetInterOpNumThreads(2);
                }
                // sessionOptions use all thread in default
            }

            // open session
            auto modelPath = targetModelDirPath / "model.onnx";
            if (!std::filesystem::exists(modelPath))
                throw Error{"Model file not found at " + modelPath.string(), Error::Type::FileAccess};
            auto modelPathwString = Utils::string_to_wstring(modelPath.string());
#ifdef _WIN32
            session.reset(new Ort::Session(*env, modelPathwString.c_str(), sessionOptions));
#else
            session.reset(new Ort::Session(*env, modelPath.string().c_str(), sessionOptions));
#endif
            if (!session)
                throw Error{"Failed to create ONNX session for model: " + modelPath.string(), Error::Type::Unknown};
            
            // store the session in the map
            instancesSessions[targetModelDirPath] = session; // store the session in the map
        }
        // get session mutex
        if (isExist)
        {
            auto it = sessionMutexes.find(session.get());
            if (it != sessionMutexes.end())
            {
                sessionMutex = it->second; // use the existing mutex
            }
        }
        else
        {
            sessionMutex = std::make_shared<std::mutex>(); // create a new mutex
            sessionMutexes[session.get()] = sessionMutex;  // store the mutex in the map
        }
    }
    // update input and output names
    {
        std::lock_guard<std::mutex> lock(*sessionMutex);
        size_t numInputs = session->GetInputCount();
        size_t numOutputs = session->GetOutputCount();
        inputNames.resize(numInputs);
        outputNames.resize(numOutputs);
        for (size_t i = 0; i < numInputs; ++i)
        {
            Ort::AllocatedStringPtr inputNamePtr = session->GetInputNameAllocated(i, *allocator);
            inputNames[i] = inputNamePtr.get();
        }
        for (size_t i = 0; i < numOutputs; ++i)
        {
            Ort::AllocatedStringPtr outputNamePtr = session->GetOutputNameAllocated(i, *allocator);
            outputNames[i] = outputNamePtr.get();
        }
    }
}

ONNXModel::~ONNXModel()
{
    // remove from instancesSessions map if session is not used anymore
    {
        std::lock_guard<std::mutex> lock(mutex); // lock the mutex
        bool needReset = false;
        if(session.use_count() == 1) // only this instance is using the session, need to remove from map
        {
            needReset = true; // need to reset session
            // remove from instancesSessions map
            auto it = instancesSessions.find(modelDirPath);
            if(it != instancesSessions.end())
            {
                instancesSessions.erase(it); // remove from map
            }
            // remove from sessionMutexes map
            auto it2 = sessionMutexes.find(session.get());
            if(it2 != sessionMutexes.end())
            {
                sessionMutexes.erase(it2); // remove from map
            }
        }
        session.reset(); // release session
        sessionMutex.reset(); // release mutex
    }
}

// ------------------------ EmbeddingModel ------------------------ //
EmbeddingModel::EmbeddingModel(std::filesystem::path targetModelDirPath, device dev, perfSetting perf) : ONNXModel(targetModelDirPath, dev, perf)
{
    // load tokenizer
    tokenizer = std::make_unique<sentencepiece::SentencePieceProcessor>();
    std::string modelPath = (targetModelDirPath / "sentencepiece.bpe.model").string();
    auto status = tokenizer->Load(modelPath.c_str());
    if (!status.ok())
    {
        throw Error{"Failed to load tokenizer model at " + modelPath, Error::Type::FileAccess};
    }

    // get embedding dimension from model
    // asume the second output is the embedding output
    {
        std::lock_guard<std::mutex> lock(*sessionMutex); // lock the mutex
        Ort::TypeInfo typeInfo = session->GetOutputTypeInfo(1);
        embeddingDimension = typeInfo.GetTensorTypeAndShapeInfo().GetShape().back(); // get the last dimension of the output shape
    }

    //get max input length
    auto configPath = targetModelDirPath / "config.json";
    if(std::filesystem::exists(configPath))
    {
        auto config = Utils::readJsonFile(configPath);
        try
        {
            maxLength = config["max_position_embeddings"];
        }
        catch(...){}
    } 
    if(maxLength == 0)
    {
        maxLength = defaultMaxLength;
    }
}

std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> EmbeddingModel::tokenize(const std::string &text) const
{
    if(text.empty())
        throw Error{"Input text is empty.", Error::Type::Internal};
    
    // tokenize text to ids
    std::vector<int> tempTokenIds;
    tokenizer->Encode(text, &tempTokenIds); // tokenize text to ids

    // get max length
    int length = tempTokenIds.size() + 2; // +2 for [BOS] and [EOS]
    if (length > maxLength)
    {
        std::cout << "Warning: the input text is too long, will be truncated to " << std::to_string(maxLength) << " ." << std::endl;
        length = maxLength;
    }

    // move token ids to tokenIds and add [BOS] and [EOS] tokens
    std::vector<int64_t> tokenIds(length, tokenizer->pad_id());
    auto copySize = std::min(static_cast<int>(tempTokenIds.size()), length - 2);
    std::copy(tempTokenIds.begin(), tempTokenIds.begin() + copySize, tokenIds.begin() + 1);
    tokenIds[0] = tokenizer->bos_id(); // [BOS] token id
    tokenIds[length - 1] = tokenizer->eos_id(); // [EOS] token id
    // generate attention mask
    std::vector<int64_t> attentionMask(length, 1); // all tokens are valid tokens
    // generate shape
    std::vector<int64_t> shape = {1, length}; // 1 * max length

    return {std::move(tokenIds), std::move(attentionMask), std::move(shape)}; // return token ids and attention mask and shape
}

// this implement may be slow
// untested version
std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> EmbeddingModel::tokenize(const std::vector<std::string> &texts) const
{
    if(texts.empty())
        throw Error{"Input texts are empty.", Error::Type::Internal};
    
    // tokenize batch of texts to ids, and compute max length
    int length = 0;
    std::vector<std::vector<int>> tempTokenIds;
    for (const auto &text : texts)
    {
        std::vector<int> tempTokenId;
        tokenizer->Encode(text, &tempTokenId);
        length = std::max(length, static_cast<int>(tempTokenId.size()) + 2);
        tempTokenIds.push_back(std::move(tempTokenId));
    }

    if(length > maxLength)
    {
        std::cout << "Warning: the input text is too long, will be truncated to " << std::to_string(maxLength) << " ." << std::endl;
        length = maxLength;
    }

    // move token ids to tokenIds and add [BOS] and [EOS] tokens, and generate attention mask
    std::vector<int64_t> tokenIds(length * tempTokenIds.size(), tokenizer->pad_id()); // all tokens are padding tokens
    std::vector<int64_t> attentionMask(length * tempTokenIds.size(), 0); // all tokens are padding tokens
    for(int i = 0; i < tempTokenIds.size(); i++)
    {
        auto copySize = std::min(static_cast<int>(tempTokenIds[i].size()), length - 2);
        std::copy(tempTokenIds[i].begin(),
                  tempTokenIds[i].begin() + copySize,
                  tokenIds.begin() + i * length + 1);
        tokenIds[i * length] = tokenizer->bos_id(); // [BOS] token id
        tokenIds[i * length + length - 1] = tokenizer->eos_id(); // [EOS] token id
        std::fill(attentionMask.begin() + i * length,
                  attentionMask.begin() + i * length + length, 1); // set attention mask to 1 for real tokens
    }
    // generate shape
    std::vector<int64_t> shape = {static_cast<int64_t>(tempTokenIds.size()), static_cast<int64_t>(length)}; // batch size * max length

    return {std::move(tokenIds), std::move(attentionMask),std::move(shape)}; // return token ids and attention mask
}

// asume thai the first input is input_ids and the second is attention_mask
std::vector<float> EmbeddingModel::embed(const std::string &text) const
{
    // tokenize input text
    auto [input_ids_vector, input_attention_mask_vector, shape] = tokenize(text);

    // convert to Ort tensor
    // ort tensor only save pointer to data, make sure the data has not been deallocated
    Ort::Value input_ids = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_ids_vector.data(), input_ids_vector.size(), shape.data(), shape.size());
    Ort::Value input_attention_mask = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_attention_mask_vector.data(), input_attention_mask_vector.size(), shape.data(), shape.size());

    // prepare input tensors
    std::vector<Ort::Value> input_tensors;
    input_tensors.push_back(std::move(input_ids));
    input_tensors.push_back(std::move(input_attention_mask));

    // prepare input names and output names
    std::vector<const char *> inputNamesPtr = {inputNames[0].c_str(), inputNames[1].c_str()}; // assume that the first input is input_ids and the second is attention_mask
    std::vector<const char *> outputNamesPtr = {outputNames[1].c_str()}; // assume that the second output is the embedding output, only compute the embedding output to save time

    // run inference
    std::vector<Ort::Value> output_tensors;
    {
        std::lock_guard<std::mutex> lock(*sessionMutex); // lock the mutex
        output_tensors = session->Run(Ort::RunOptions{nullptr}, inputNamesPtr.data(), input_tensors.data(), input_tensors.size(), outputNamesPtr.data(), outputNamesPtr.size());
    }

    auto embeddingVectorPtr = output_tensors[0].GetTensorMutableData<float>(); // get the output tensor data
    std::vector<float> embeddingVector(embeddingVectorPtr, embeddingVectorPtr + embeddingDimension); // copy the output tensor data to a vector

    return embeddingVector; // return the embedding vector
}

std::vector<std::vector<float>> EmbeddingModel::embed(const std::vector<std::string> &texts) const
{
    // tokenize input texts
    auto [input_id_vectors, input_attention_mask_vectors, shape] = tokenize(texts);

    // convert to Ort tensor
    Ort::Value input_ids = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_id_vectors.data(), input_id_vectors.size(), shape.data(), shape.size());
    Ort::Value input_attention_mask = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_attention_mask_vectors.data(), input_attention_mask_vectors.size(), shape.data(), shape.size());

    // prepare input tensors
    std::vector<Ort::Value> input_tensors;
    input_tensors.push_back(std::move(input_ids));
    input_tensors.push_back(std::move(input_attention_mask));

    // prepare input names and output names
    std::vector<const char *> inputNamesPtr = {inputNames[0].c_str(), inputNames[1].c_str()}; // assume that the first input is input_ids and the second is attention_mask
    std::vector<const char *> outputNamesPtr = {outputNames[1].c_str()}; // assume that the second output is the embedding output, only compute the embedding output to save time

    // run inference
    std::vector<Ort::Value> output_tensors;
    {
        std::lock_guard<std::mutex> lock(*sessionMutex); // lock the mutex
        output_tensors = session->Run(Ort::RunOptions{nullptr}, inputNamesPtr.data(), input_tensors.data(), input_tensors.size(), outputNamesPtr.data(), outputNamesPtr.size());
    }

    auto embeddingVectorPtr = output_tensors[0].GetTensorMutableData<float>(); // get the output tensor data
    std::vector<std::vector<float>> embeddingVectors; // create a vector of vectors to store the embedding vectors
    for(size_t i = 0; i < texts.size(); i++)
    {
        std::vector<float> embeddingVector(embeddingVectorPtr + i * embeddingDimension, embeddingVectorPtr + (i + 1) * embeddingDimension); // copy the output tensor data to a vector
        embeddingVectors.push_back(std::move(embeddingVector)); // add the embedding vector to the vector of vectors
    }

    return embeddingVectors; // return the vector of embedding vectors
}

//------------------------- RerankerModel -------------------------//
RerankerModel::RerankerModel(std::filesystem::path targetModelDirPath, device dev, perfSetting perf) : ONNXModel(targetModelDirPath, dev, perf)
{
    // load tokenizer
    tokenizer = std::make_unique<sentencepiece::SentencePieceProcessor>();
    std::string modelPath = (targetModelDirPath / "sentencepiece.bpe.model").string();
    auto status = tokenizer->Load(modelPath.c_str());
    if (!status.ok())
    {
        throw Error{"Failed to load tokenizer model at " + modelPath, Error::Type::FileAccess};
    }

    // get max input length
    auto configPath = targetModelDirPath / "config.json";
    if (std::filesystem::exists(configPath))
    {
        auto config = Utils::readJsonFile(configPath);
        try
        {
            maxLength = config["max_position_embeddings"];
        }
        catch (...) {}
    }
    if (maxLength == 0)
    {
        maxLength = defaultMaxLength;
    }
}

std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> RerankerModel::tokenize(const std::string &query, const std::string &content) const
{
    if(query.empty() || content.empty())
        throw Error{"Input query or content is empty.", Error::Type::Internal};
    
    // tokenize text to ids
    std::vector<int> queryTokenIds;
    tokenizer->Encode(query, &queryTokenIds);
    std::vector<int> contentTokenIds;
    tokenizer->Encode(content, &contentTokenIds);

    // get length
    int64_t length = queryTokenIds.size() + contentTokenIds.size() + 3; // +3 for [BOS] and [EOS]*2
    if(length > maxLength)
    {
        std::cout << "Warning: the input text is too long, will be truncated to " << std::to_string(maxLength) << " ." << std::endl;
        length = maxLength;
    }

    std::vector<int64_t> inputIds(length, tokenizer->pad_id());
    std::copy(queryTokenIds.begin(), queryTokenIds.end(), inputIds.begin() + 1);
    auto copySize = std::min(contentTokenIds.size(), static_cast<size_t>(length - queryTokenIds.size() - 3));
    std::copy(contentTokenIds.begin(), contentTokenIds.begin() + copySize, inputIds.begin() + queryTokenIds.size() + 2);
    inputIds[0] = tokenizer->bos_id();
    inputIds[queryTokenIds.size() + 1] = tokenizer->eos_id();
    inputIds[length - 1] = tokenizer->eos_id();

    std::vector<int64_t> attentionMask(length, 1);
    std::vector<int64_t> shape = {1, length}; 
    return {std::move(inputIds), std::move(attentionMask), std::move(shape)};
}

std::tuple<std::vector<int64_t>, std::vector<int64_t>, std::vector<int64_t>> RerankerModel::tokenize(const std::string &query, const std::vector<std::string> &contents) const
{
    if (query.empty() || contents.empty())
        throw Error{"Input query or contents are empty.", Error::Type::Internal};

    std::vector<int> queryToken;
    tokenizer->Encode(query, &queryToken);
    std::vector<std::vector<int>> contentTokens;
    int length = 0;
    for (const auto &content : contents)
    {
        std::vector<int> contentToken;
        tokenizer->Encode(content, &contentToken);
        length = std::max(length, static_cast<int>(queryToken.size()) + static_cast<int>(contentToken.size()) + 3); // +3 for [BOS] and [EOS]*2
        contentTokens.push_back(std::move(contentToken));
    }

    if (length > maxLength)
    {
        std::cout << "Warning: the input text is too long, will be truncated to " << std::to_string(maxLength) << " ." << std::endl;
        length = maxLength;
    }

    std::vector<int64_t> inputIds(length * contents.size(), tokenizer->pad_id());
    std::vector<int64_t> attentionMask(length * contents.size(), 0);
    for(int i = 0; i < contents.size(); i++)
    {
        std::copy(queryToken.begin(), 
                  queryToken.end(), 
                  inputIds.begin() + i * length + 1);
        auto copySize = std::min(contentTokens[i].size(), length - queryToken.size() - 3);
        std::copy(contentTokens[i].begin(), 
                  contentTokens[i].begin() + copySize, 
                  inputIds.begin() + i * length + queryToken.size() + 2);
        inputIds[i * length] = tokenizer->bos_id();
        inputIds[i * length + queryToken.size() + 1] = tokenizer->eos_id();
        inputIds[i * length + length - 1] = tokenizer->eos_id();
        std::fill(attentionMask.begin() + i * length, attentionMask.begin() + (i + 1) * length, 1);
    }
    std::vector<int64_t> shape = {static_cast<int64_t>(contents.size()), static_cast<int64_t>(length)}; // batch size * max length

    return {std::move(inputIds), std::move(attentionMask), std::move(shape)}; // return token ids and attention mask
}

float RerankerModel::rank(const std::string &query, const std::string &content) const
{
    // tokenize input texts
    auto [input_ids_vector, input_attention_mask_vector, shape] = tokenize(query, content);

    // convert to Ort tensor
    Ort::Value input_ids = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_ids_vector.data(), input_ids_vector.size(), shape.data(), shape.size());
    Ort::Value input_attention_mask = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_attention_mask_vector.data(), input_attention_mask_vector.size(), shape.data(), shape.size());

    // prepare input tensors
    std::vector<Ort::Value> input_tensors;
    input_tensors.push_back(std::move(input_ids));
    input_tensors.push_back(std::move(input_attention_mask));

    // prepare input names and output names
    std::vector<const char *> inputNamesPtr = {inputNames[0].c_str(), inputNames[1].c_str()}; // assume that the first input is input_ids and the second is attention_mask
    std::vector<const char *> outputNamesPtr = {outputNames[0].c_str()}; // assume that the first output is the score output

    // run inference
    std::vector<Ort::Value> output_tensors;
    {
        std::lock_guard<std::mutex> lock(*sessionMutex); // lock the mutex
        output_tensors = session->Run(Ort::RunOptions{nullptr}, inputNamesPtr.data(), input_tensors.data(), input_tensors.size(), outputNamesPtr.data(), outputNamesPtr.size());
    }

    auto scoreVectorPtr = output_tensors[0].GetTensorMutableData<float>(); // get the output tensor data
    return Utils::sigmoid(scoreVectorPtr[0]); // return the score
}

std::vector<float> RerankerModel::rank(const std::string &query, const std::vector<std::string> &contents) const
{
    auto [input_ids_vector, input_attention_mask_vector, shape] = tokenize(query, contents);

    // convert to Ort tensor
    Ort::Value input_ids = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_ids_vector.data(), input_ids_vector.size(), shape.data(), shape.size());
    Ort::Value input_attention_mask = Ort::Value::CreateTensor<int64_t>(*memoryInfo, input_attention_mask_vector.data(), input_attention_mask_vector.size(), shape.data(), shape.size());
    // prepare input tensors
    std::vector<Ort::Value> input_tensors;
    input_tensors.push_back(std::move(input_ids));
    input_tensors.push_back(std::move(input_attention_mask));
    // prepare input names and output names
    std::vector<const char *> inputNamesPtr = {inputNames[0].c_str(), inputNames[1].c_str()}; // assume that the first input is input_ids and the second is attention_mask
    std::vector<const char *> outputNamesPtr = {outputNames[0].c_str()}; // assume that the first output is the score output
    // run inference
    std::vector<Ort::Value> output_tensors;
    {
        std::lock_guard<std::mutex> lock(*sessionMutex); // lock the mutex
        output_tensors = session->Run(Ort::RunOptions{nullptr}, inputNamesPtr.data(), input_tensors.data(), input_tensors.size(), outputNamesPtr.data(), outputNamesPtr.size());
    }
    auto scoreVectorPtr = output_tensors[0].GetTensorMutableData<float>(); // get the output tensor data
    std::vector<float> scores; // create a vector to store the scores
    for(size_t i = 0; i < contents.size(); i++)
    {
        scores.push_back(Utils::sigmoid(scoreVectorPtr[i])); // copy the output tensor data to a vector
    }
    return scores; // return the scores
}
