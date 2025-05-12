// #include "Repository.h"
// #include "DocPipe.h"
// #include "SqliteConnection.h"
// #include "VectorTable.h"
// #include "TextSearchTable.h"
// #include "ONNXModel.h"
// #include "Utils.h"

// #include <iostream>
// #include <filesystem>

// void query(Repository& Repository)
// {
//     while(true)
//     {
//         std::string query;
//         std::cout << "Enter your query: \n";
//         std::getline(std::cin, query);
//         if(query.empty())
//             break; // exit if the query is empty
//         auto results = Repository.search(query, 5); // search with a limit of 10 results
//         for (const auto &result : results)
//         {
//             for (const auto &res : result)
//             {
//                 std::cout << "Chunk ID: " << res.chunkId << ", Score: " << res.score << std::endl;
//                 std::cout << "Content: " << res.content << std::endl;
//                 std::cout << "Metadata: " << res.metadata << std::endl;
//                 std::cout << "-----------------\n"; // separator for different results
//             }
//             std::cout << "-----------------------------------\n"; // separator for different embedding results
//         }
//     }
// }

// int main()
// {
//     Utils::setup_utf8_console();

//     std::filesystem::path repoPath = ".\\repo"; 
//     std::string repoName = "repo";
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
//         }
//     );
//     Repository.configEmbedding({
//         {"default", "bge-m3", "../../models/bge-m3", 512},
//         {"1024", "bge-m3", "../../models/bge-m3", 1024}
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




#include "ONNXModel.h"
#include "Utils.h"
int main()
{
    Utils::setup_utf8_console();

    RerankerModel model("../../models/bge-reranker-v2-m3", ONNXModel::device::cpu, ONNXModel::perfSetting::high);

    std::string query = "What is the capital of France?";
    std::vector<std::string> contents = {
        "The capital of France is Paris.",
        "The capital of Germany is Berlin.",
        "The capital of Italy is Rome.",
        "The capital of Spain is Madrid.",
        "The capital of Portugal is Lisbon."
    };
    std::vector<float> scores = model.rank(query, contents);
    for (size_t i = 0; i < contents.size(); ++i)
    {
        std::cout << "Content: " << contents[i] << ", Score: " << scores[i] << std::endl;
    }

    return 0;
}