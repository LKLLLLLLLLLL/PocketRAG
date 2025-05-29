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



#include "Utils.h"
#include "KernelServer.h"
#include <cstdlib>
#include <iostream>

std::filesystem::path dataPath = std::filesystem::path (".") / "userData";
Logger logger(dataPath / "logs", false, Logger::Level::DEBUG);

void crash_handler();

void server_terminate_handler();

int main()
{
    std::set_terminate(server_terminate_handler);
    Utils::setup_utf8_console();
    {
        auto server = KernelServer(dataPath);
        try
        {
            server.run();
        }
        catch(...)
        {
            crash_handler();
            return EXIT_FAILURE;
        }
    }
    logger.info("KernelServer stopped.");
    return 0;
}

void crash_handler()
{
    try
    {
        auto error_ptr = std::current_exception();
        std::string error_message = "Unknown error";
        if (error_ptr)
        {
            try
            {
                std::rethrow_exception(error_ptr);
            }
            catch (const std::exception &e)
            {
                error_message = e.what();
                logger.fatal("KernelServer crashed with exception: " + error_message);
            }
            catch (...)
            {
                logger.fatal("KernelServer crashed with unknown type exception.");
            }
        }
        else
        {
            logger.fatal("KernelServer crashed with unknown exception.");
        }

        // send crash message to frontend
        nlohmann::json errorJson;
        errorJson["sessionId"] = -1;
        errorJson["toMain"] = true;
        errorJson["callbackId"] = 0;
        errorJson["isReply"] = false;
        errorJson["message"]["type"] = "kernelServerCrash";
        errorJson["message"]["error"] = error_message;
        std::cout << errorJson.dump() << std::endl << std::flush;
    }
    catch (...)
    {
        std::cerr << "KernelServer crashed, Failed to log exception. " << std::endl;
    }
}

void server_terminate_handler()
{
    crash_handler();
    std::exit(EXIT_FAILURE);
}
