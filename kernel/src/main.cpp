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
//         auto results = Repository.search(query,Repository::searchAccuracy::high, 5); // search with a limit of 10 results
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
//             std::cout << "-----------------\n\n"; // separator for different results
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
//         {"default", "bge-m3", "../../models/bge-m3", 50},
//         // {"1024", "bge-m3", "../../models/bge-m3", 200}
//     });

//     query(Repository); // query the database

//     return 0;
// }







#include "Utils.h"
#include "KernelServer.h"

int main()
{
    Utils::setup_utf8_console();

    KernelServer::openServer().run();

    return 0;
}