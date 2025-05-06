#include "Session.h"
#include "DocPipe.h"
#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"
#include "Utils.h"

#include <iostream>
#include <filesystem>

int main()
{
    Utils::setup_utf8_console();

    std::filesystem::path repoPath = ".\\repo"; 
    std::string repoName = "repo";
    int sessionId = 1; // example session ID
    auto lastprintTime = std::chrono::steady_clock::now();
    Session session(repoName, repoPath, sessionId, 
        [](std::vector<std::string> docs)
        {
            std::cout << "Changed documents: " ;
            for (const auto& doc : docs)
            {
                std::cout << doc << ", "; // print changed documents
            }
            std::cout << std::endl;
        }, 
        [&lastprintTime](std::string path, double progress)
        {
            auto now = std::chrono::steady_clock::now();
            static auto lastProgress = 0.0;
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - lastprintTime).count();
            auto progressDiff = progress - lastProgress;
            if (elapsed < 1 && progress <= 0.98 && progress >= 0.03 && progressDiff < 0.15) // print progress every second
                return;
            lastprintTime = now;
            lastProgress = progress;
            std::cout << "Processing " << path << ": " << progress * 100 << "%" << std::endl; // print progress
        }
    );
    session.configEmbedding({
        {"default", "bge-m3", "../../models/bge-m3", 512},
        {"1024", "bge-m3", "../../models/bge-m3", 1024}
    });
    while(true)
    {
        std::string query;
        std::cout << "Enter your query: \n";
        std::getline(std::cin, query);
        if(query.empty())
        {
            break; // exit on empty query
        }
        auto results = session.search(query, 5); // search with a limit of 10 results
        for(const auto& result : results)
        {
            for(const auto& res : result)
            {
                std::cout << "Chunk ID: " << res.chunkId << ", Score: " << res.score << std::endl;
                std::cout << "Content: " << res.content << std::endl;
                std::cout << "Metadata: " << res.metadata << std::endl;
                std::cout << "-----------------\n"; // separator for different results
            }
            std::cout << "-----------------------------------\n"; // separator for different embedding results
        }
        session.configEmbedding({
            {"default", "bge-m3", "../../models/bge-m3", 512}
        });
    }
}