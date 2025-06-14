#pragma once
#include <string>
#include <vector>
#include <shared_mutex>
#include <cppjieba/Jieba.hpp>

#include "SqliteConnection.h"

/*
This class manages a Sqlite FTS5 table for text search.
This implementation will store full content and metadata in the database, may not be suitable for large documents.
It is safe to use this class in multiple threads. 

Manage a Sqlite FTS5 table with the following schema:
CREATE VIRTUAL TABLE IF NOT EXISTS tableName USING fts5(
    content, 
    metadata, 
    chunkId UNINDEXED,
    tokenize='jieba'
);
*/
class TextSearchTable
{
public:
    struct Chunk
    {
        std::string content;
        std::string metadata;
        int64_t chunkId; // chunk id, primary key
    };

    struct ResultChunk
    {
        static const std::string HIGHLIGHT_BEGINS;
        static const std::string HIGHLIGHT_ENDS;

        double similarity; // similarity score, higher is similar, equals 1.0 - (1.0 / (1.0 - bm25Score))

        int64_t chunkId; // chunk id
        std::string content; // content of the chunk with highlighted keywords
        std::string metadata; // metadata of the chunk with highlighted keywords
    };

private:
    SqliteConnection &sqlite; // store reference to SqliteConnection 
    std::string tableName;

    mutable std::shared_mutex mutex; // mutex for thread safety

    static const int MIN_KEYWORD_LENGTH = 2; // minimum length of keyword to be highlighted

public:
    TextSearchTable(SqliteConnection &sqlite, const std::string &tableName);
    ~TextSearchTable() = default; // destructor

    TextSearchTable(const TextSearchTable&) = delete; // disable copy constructor
    TextSearchTable& operator=(const TextSearchTable&) = delete; // disable copy assignment operator

    TextSearchTable(TextSearchTable &&other) = delete; // disable move constructor
    TextSearchTable &operator=(TextSearchTable &&other) = delete; // disable move assignment operator

    // add a chunk to the table, if exists the same row with chunkId, will update the row
    void addChunk(const Chunk &chunk);

    // delete a chunk from the table, if not exists, throw an exception
    void deleteChunk(int64_t chunkId);

    // search for chunks in the table
    std::vector<ResultChunk> search(const std::string &query, int limit = 10);

    // get a pair with content and metadata of a chunk by chunkId
    std::pair<std::string, std::string> getContent(int64_t chunkId);

    // drop table from sqlite
    static void dropTable(SqliteConnection &sqlite, const std::string &tableName);

    // highlight keywords in the text
    static std::string reHighlight(const std::string &text, const std::string &query);
};
