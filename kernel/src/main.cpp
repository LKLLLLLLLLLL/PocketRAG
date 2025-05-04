#include "Session.h"
#include "DocPipe.h"
#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "ONNXModel.h"

#include <iostream>
#include <filesystem>

int main()
{
    setup_utf8_console();

    std::filesystem::path repoPath = "./repo"; 
    std::string repoName = "repo";
    int sessionId = 1; // example session ID
    Session session(repoName, repoPath, sessionId);
    if (!std::filesystem::exists("./repo/.PocketRAG/_vector_bge_m3.faiss"))
    {
        session.addEmbedding(1, "bge_m3", "D:/Code/PocketRAG/models/bge-m3", 512); // example embedding
    }
    while(true)
    {
        session.checkDoc(); // check documents in the repository
        session.refreshDoc([](std::string path, double progress){
            std::cout << "Processing " << path << ": " << progress * 100 << "%" << std::endl; // print progress
        }); // refresh documents in the repository
        std::string query;
        std::cout << "Enter your query: ";
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
    }
}