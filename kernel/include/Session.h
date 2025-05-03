// # pragma once
// #include <iostream>
// #include <filesystem>
// #include <string>
// #include <memory>

// #include "SqliteConnection.h"
// #include "VectorTable.h"
// #include "TextSearchTable.h"
// #include "ONNXModel.h"

// /*
// This class handles a session to a window, aka. a repository.
// */
// class Session
// {
// private:
//     std::string repoName;
//     std::filesystem::path repoPath;
//     int sessionId;

//     std::shared_ptr<SqliteConnection> sqlite;
//     std::shared_ptr<TextSearchTable> tTable;

// public:
//     Session(std::string repoName, std::filesystem::path repoPath, int sessionId);
//     ~Session();

//     Session(const Session&) = delete; // disable copy constructor
//     Session& operator=(const Session&) = delete; // disable copy assignment operator


// };