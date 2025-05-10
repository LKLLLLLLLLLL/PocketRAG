#include "Session.h"

void Session::docStateReporter(std::vector<std::string> docs)
{
    // for debug
    std::cout << "Changed documents: ";
    for (const auto &doc : docs)
    {
        std::cout << doc << ", ";
    }
    std::cout << std::endl;
}

void Session::progressReporter(std::string path, double progress)
{
    // for debug
    auto now = std::chrono::steady_clock::now();
    static auto lastProgress = 0.0;
    static std::chrono::steady_clock::time_point lastprintTime;
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - lastprintTime).count();
    auto progressDiff = progress - lastProgress;
    if (elapsed < 1 && progress <= 0.99 && progress >= 0.03 && progressDiff < 0.15) // print progress every second
        return;
    lastprintTime = now;
    lastProgress = progress;
    std::cout << "Processing " << path << ": " << progress * 100 << "%" << std::endl; // print progress
}

Session::Session(int sessionId, std::string repoName, std::filesystem::path repoPath) : sessionId(sessionId), sessionMessageQueue(std::make_shared<Utils::MessageQueue>())
{
    repository = std::make_shared<Repository>(repoName, repoPath, docStateReporter, progressReporter);
    conversationThread = std::thread(&Session::conversationProcess, this);
}