#include <string>
#include <vector>
#include <cppjieba/Jieba.hpp>

#include "SqliteConnection.h"

/*
This class manages a Sqlite FTS5 table for text search.
For each row, will store content, metadata, keys(Embedding ids and chunkids), keyword generated automatically will be joind to given metadata.
This implementation will store full content and metadata in the database, may not be suitable for large documents.
*/
class TextSearchTable
{
public:
    struct Chunk
    {
        std::string content;
        std::string metadata;
        int64_t embeddingId; // embedding id
        int64_t chunkId; // chunk id
    };

    struct ResultChunk
    {
        static const std::string HIGHLIGHT_BEGINS;
        static const std::string HIGHLIGHT_ENDS;

        double similarity; // similarity score, higher is similar, equals 1.0 - (1.0 / (1.0 - bm25Score))

        int64_t chunkId; // chunk id
        int64_t embeddingId; // embedding id
        std::string content; // content of the chunk with highlighted keywords
        std::string metadata; // metadata of the chunk with highlighted keywords
    };

    struct Exception : public std::exception
    {
        enum class Type { notFound, unknownError };
        Type type; // type of the exception
        std::string message; // error message

        Exception(Type type, const std::string &message) : type(type), message(message) {}
        const char* what() const noexcept override { return message.c_str(); } // override what() method
    };
private:
    SqliteConnection &sqlite; // store reference to SqliteConnection 
    std::string tableName;

    cppjieba::Jieba *jieba = nullptr; // Global Jieba tokenizer instance

public:
    TextSearchTable(SqliteConnection &sqlite, const std::string &tableName);
    ~TextSearchTable() = default; // destructor

    TextSearchTable(const TextSearchTable&) = delete; // disable copy constructor
    TextSearchTable& operator=(const TextSearchTable&) = delete; // disable copy assignment operator

    // add a chunk to the table, if exists the same row with chunkId and embeddingId, will update the row
    void addChunk(const Chunk &chunk);

    // delete a chunk from the table, if not exists, throw an exception
    void deleteChunk(int64_t chunkId, int64_t embeddingId);

    // search for chunks in the table
    std::vector<ResultChunk> search(const std::string &query, int limit = 10);

    // get a pair with content and metadata of a chunk by chunkId and embeddingId
    std::pair<std::string, std::string> getContent(int64_t chunkId, int64_t embeddingId);
};