// #include "Repository.h"
// #include "Utils.h"

// #include <iostream>
// #include <filesystem>
// #include <chrono>

// void query(Repository& Repository)
// {
//     while(true)
//     {
//         std::string query;
//         std::cout << "Enter your query: \n";
//         std::getline(std::cin, query);
//         if(query.empty())
//             break; // exit if the query is empty
//         auto start = std::chrono::steady_clock::now();
//         auto results = Repository.search(query,Repository::searchAccuracy::high, 10); // search with a limit of 10 results
//         auto end = std::chrono::steady_clock::now();
//         auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
//         std::cout << "Search took " << elapsed << " ms\n";
//         for (const auto &result : results)
//         {
//             std::cout << "Chunk ID: " << result.chunkId << ", Score: " << result.score << std::endl;
//             std::cout << "Content: " << result.highlightedContent << std::endl;
//             std::cout << "Metadata: \n" << result.highlightedMetadata << std::endl;
//             std::cout << "beginLine: " << result.beginLine << ", endLine: " << result.endLine << std::endl;
//             std::cout << "File Path: " << result.filePath << std::endl;
//             std::cout << "-----------------\n\n"; // separator for diffe9rent results
//             std::cout << "-----------------------------------\n"; // separator for different embedding results
//         }
//     }
// }

// int main()
// {
//     Utils::setup_utf8_console();

//     std::filesystem::path repoPath = ".\\repo"; 
//     std::string repoName = "repo";
//     std::filesystem::path rankerModel = "../../models/bge-reranker-v2-m3";
//     auto lastprintTime = std::chrono::steady_clock::now();
//     Repository Repository(repoName, repoPath, 
//         [](std::vector<std::string> docs)
//         {
//             std::cout << "Changed documents: " ;
//             for (const auto& doc : docs)
//             {
//                 std::cout << doc << ", "; // print changed documents
//             }
//             std::cout << std::endl;
//         }, 
//         [&lastprintTime](std::string path, double progress)
//         {
//             auto now = std::chrono::steady_clock::now();
//             static auto lastProgress = 0.0;
//             auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - lastprintTime).count();
//             auto progressDiff = progress - lastProgress;
//             if (elapsed < 1 && progress <= 0.99 && progress >= 0.03 && progressDiff < 0.15) // print progress every second
//                 return;
//             lastprintTime = now;
//             lastProgress = progress;
//             std::cout << "Processing " << path << ": " << progress * 100 << "%" << std::endl; // print progress
//         }, 
//         [](std::string path)
//         {
//             std::cout << "Done processing " << path << std::endl; // print done message
//         }
//     );
//     // Repository.configReranker(rankerModel);
//     Repository.configEmbedding({
//         {"default", "bge-m3", "../../models/bge-m3", 256},
//         {"1024", "bge-m3", "../../models/bge-m3", 512}
//     });

//     query(Repository); // query the database

//     return 0;
// }







// #include "Utils.h"
// #include "KernelServer.h"

// int main()
// {
//     Utils::setup_utf8_console();

//     KernelServer::openServer().run();

//     return 0;
// }





#include "LLMConv.h"
#include "Utils.h"
#include <iostream>

int main()
{
    Utils::setup_utf8_console();
    // 创建配置
    LLMConv::Config config;
    config["api_key"] = "sk-b00e637efcc341988f2be629b9ebf40a";        // API密钥
    config["api_url"] = "https://api.deepseek.com/v1/chat/completions"; // API端点
    config["connect_timeout"] = "10";                                 // 最大等待时间
    config["max_retry"] = "3";                                        // 请求失败重试次数

    // 创建对话实例
    auto conv = LLMConv::createConv(LLMConv::type::OpenAIapi, // API类型
                                    "deepseek-chat",          // 模型名称
                                    config                   // 配置
    );

    conv->setMessage("system", R"(
        你是一位大模型提示词生成专家，请根据用户的需求编写一个智能助手的提示词，来指导大模型进行内容生成，要求：
        1. 以 Markdown 格式输出
        2. 贴合用户需求，描述智能助手的定位、能力、知识储备
        3. 提示词应清晰、精确、易于理解，在保持质量的同时，尽可能简洁
        4. 只输出提示词，不要输出多余解释)"
    );
    conv->setMessage("user", "请帮我生成一个可以生成RAG搜索词的智能助手的简短英文提示词，由于该RAG应用包括了“向量搜索”与“关键词搜索”，请要求智能助手在生成搜索词时，考虑到这两种搜索方式的特点，保证搜索词的准确性和相关性。");
    conv->getStreamResponse([](const std::string &response) {
        std::cout << response << std::flush; // 输出响应
    });

    return 0;
}