// #include "Session.h"

// #include <iostream>
// #include <filesystem>

// #include "SqliteConnection.h"
// #include "VectorTable.h"
// #include "TextSearchTable.h"
// #include "ONNXModel.h"

// Session::Session(std::string repoName, std::filesystem::path repoPath, int sessionId) : repoName(repoName), repoPath(repoPath), sessionId(sessionId)
// {
//     // open a sqlite connection
//     auto dbPath = repoPath / ".PocketRAG";
//     sqlite = std::make_shared<SqliteConnection>(dbPath.string(), repoName);

//     // open text search table
//     tTable = std::make_shared<TextSearchTable>(*sqlite, repoName + "_text_search");

//     // initialize sqliteDB and read config from sqliteDB
    
// }
