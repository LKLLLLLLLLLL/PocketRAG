#include "TextSearchTable.h"

#include <iostream>

// helper function to register the jieba tokenizer to SQLite database
namespace jiebaTokenizer
{
    cppjieba::Jieba *jieba = nullptr; // Global Jieba tokenizer instance
    std::mutex jiebaMutex;            // to protect jieba pointer

    // FTS5 tokenizer interface functions
    int jieba_tokenizer_create(void *sqlite3_api, const char **azArg, int nArg, Fts5Tokenizer **ppOut)
    {
        *ppOut = (Fts5Tokenizer *)jieba;
        return SQLITE_OK;
    }
    void jieba_tokenizer_delete(Fts5Tokenizer *pTokenizer)
    {
        // no need to free here
    }
    int jieba_tokenizer_tokenize(Fts5Tokenizer *pTokenizer, void *pCtx, int flags, const char *pText, int nText, int (*xToken)(void *, int, const char *, int, int, int))
    {
        cppjieba::Jieba *jieba = (cppjieba::Jieba *)pTokenizer;
        std::string text(pText, nText);
        std::vector<std::string> words;

        // use search engine mode to tokenize
        {
            std::lock_guard<std::mutex> lock(jiebaMutex); 
            jieba->Cut(text, words);
        }

        // output each token result
        int offset = 0;
        for (const auto &word : words)
        {
            size_t pos = text.find(word, offset);
            if (pos != std::string::npos)
            {
                offset = pos + word.length();
                int rc = xToken(pCtx, 0, word.c_str(), word.length(), pos, pos + word.length());
                if (rc != SQLITE_OK)
                    return rc;
            }
        }

        return SQLITE_OK;
    }

    // register jieba tokenizer to specified SQLite database
    void register_jieba_tokenizer(SqliteConnection &db)
    {
        {
            std::lock_guard<std::mutex> lock(jiebaMutex);
            if (jieba == nullptr) // initialize jieba object
            {
                jieba = new cppjieba::Jieba(DICT_PATH, HMM_PATH, USER_DICT_PATH, IDF_PATH, STOP_WORD_PATH); // PATH has been defined in the cmakefile
            }
        }

        static fts5_tokenizer tokenizer = {
            jieba_tokenizer_create,
            jieba_tokenizer_delete,
            jieba_tokenizer_tokenize};

        fts5_api *fts5api = nullptr;
        sqlite3_stmt *stmt = nullptr;

        try
        {
            auto statement = db.getStatement("SELECT fts5(?)");
            statement.bind(1, (void *)&fts5api, "fts5_api_ptr"); // bind the fts5_api pointer to the statement
            statement.step();

            statement.reset(); // reset the statement for reuse
            if (fts5api == nullptr)
            {
                throw SqliteConnection::Exception{SqliteConnection::Exception::Type::unknownError, "Failed to get FTS5 API pointer"};
            }

            // register the tokenizer to the SQLite database
            auto rc = fts5api->xCreateTokenizer(fts5api, "jieba", (void *)jieba, &tokenizer, nullptr);
            if (rc != SQLITE_OK)
            {
                throw SqliteConnection::Exception{SqliteConnection::Exception::Type::unknownError, "Failed to register jieba tokenizer"};
            }
        }
        catch (const SqliteConnection::Exception &e)
        {
            throw SqliteConnection::Exception{SqliteConnection::Exception::Type::unknownError, "Failed to register jieba tokenizer: " + std::string(e.what())};
        }
    }

    cppjieba::Jieba *get_jieba_ptr()
    {
        {
            std::lock_guard<std::mutex> lock(jiebaMutex);
            if (jieba == nullptr) // initialize jieba object
            {
                jieba = new cppjieba::Jieba(DICT_PATH, HMM_PATH, USER_DICT_PATH, IDF_PATH, STOP_WORD_PATH); // PATH has been defined in the cmakefile
            }
        }
        return jieba;
    }
};

//-----------------------TextSearchTable---------------------
const std::string TextSearchTable::ResultChunk::HIGHLIGHT_BEGINS = "<b>";
const std::string TextSearchTable::ResultChunk::HIGHLIGHT_ENDS = "</b>";

TextSearchTable::TextSearchTable(SqliteConnection &sqlite, const std::string &tableName): sqlite(sqlite), tableName(tableName)
{
    // register the jieba tokenizer to the SQLite database
    jiebaTokenizer::register_jieba_tokenizer(sqlite);

    // get the global jieba pointer
    this->jieba = jiebaTokenizer::get_jieba_ptr();

    // create the FTS5 table if it does not exist
    sqlite.execute("CREATE VIRTUAL TABLE IF NOT EXISTS " + tableName + " USING fts5("
        "content, "
        "metadata, "
        "embeddingId UNINDEXED,"
        "chunkId UNINDEXED, "
        "tokenize='jieba')"
    );
}

void TextSearchTable::addChunk(const Chunk &chunk)
{
    auto query = sqlite.getStatement("SELECT COUNT(*) FROM " + tableName + " WHERE chunkId = ? AND embeddingId = ?");
    query.bind(1, chunk.chunkId);
    query.bind(2, chunk.embeddingId);
    query.step();
    int count = query.get<int>(0);

    assert(count <= 1); // should not have more than one chunk with the same chunkId and embeddingId
    if(count == 1) // existint chunk, update it
    {
        auto update = sqlite.getStatement("UPDATE " + tableName + " SET content = ?, metadata = ? WHERE chunkId = ? AND embeddingId = ?");
        update.bind(1, chunk.content);
        update.bind(2, chunk.metadata);
        update.bind(3, chunk.chunkId);
        update.bind(4, chunk.embeddingId);
        update.step();
    }
    else // new chunk, insert it
    {
        auto insert = sqlite.getStatement("INSERT INTO " + tableName + " (content, metadata, embeddingId, chunkId) VALUES (?, ?, ?, ?)");
        insert.bind(1, chunk.content);
        insert.bind(2, chunk.metadata);
        insert.bind(3, chunk.embeddingId);
        insert.bind(4, chunk.chunkId);
        insert.step();
    }
}

void TextSearchTable::deleteChunk(int64_t chunkId, int64_t embeddingId)
{
    auto deleteStmt = sqlite.getStatement("DELETE FROM " + tableName + " WHERE chunkId = ? AND embeddingId = ?");
    deleteStmt.bind(1, chunkId);
    deleteStmt.bind(2, embeddingId);
    deleteStmt.step();
    
    if(deleteStmt.changes() == 0)
    {
        throw Exception{Exception::Type::notFound, "No chunk found with chunkId: " + std::to_string(chunkId) + " and embeddingId: " + std::to_string(embeddingId)};
    }
}

auto TextSearchTable::search(const std::string &query, int limit) -> std::vector<ResultChunk>
{
    // tokenize the query using jieba
    std::vector<std::string> keywords;
    {
        std::lock_guard<std::mutex> lock(jiebaTokenizer::jiebaMutex);
        jieba->CutForSearch(query, keywords);
    }
    if(keywords.empty())
    {
        return {}; // no keywords, return empty result
    }
    std::string queryStr;
    for (size_t i = 0; i < keywords.size(); ++i)
    {
        if (keywords[i] == " " || keywords[i].empty() || keywords[i] == "\n" || keywords[i] == "\r\n" 
        ) continue; // skip empty keywords
        if (i > 0) queryStr += " OR ";
        queryStr += keywords[i];
    }
    // auto queryStr = query; // use the original query string

    // construct the query stmt
    auto& begin = ResultChunk::HIGHLIGHT_BEGINS;
    auto& end = ResultChunk::HIGHLIGHT_ENDS;
    auto queryStmt = sqlite.getStatement(
        "SELECT highlight(" + tableName + ", 0, '" + begin + "', '" + end + "') AS highlighted_content, "
               "highlight(" + tableName + ", 1, '" + begin + "', '" + end + "') AS highlighted_metadata, "
               "chunkId, embeddingId, bm25(" + tableName + ") AS score "
        "FROM " + tableName + " "
        "WHERE " + tableName + " MATCH ? "
        "ORDER BY score "  
        "LIMIT ?"
    );
    queryStmt.bind(1, queryStr);
    queryStmt.bind(2, limit);

    std::vector<ResultChunk> resultChunks;
    while(queryStmt.step())
    {
        ResultChunk chunk;
        chunk.content = queryStmt.get<std::string>(0);
        chunk.metadata = queryStmt.get<std::string>(1);
        chunk.chunkId = queryStmt.get<int64_t>(2);
        chunk.embeddingId = queryStmt.get<int64_t>(3);
        auto bm25Score = queryStmt.get<double>(4);
        chunk.similarity = 1.0 - (1.0 / (1.0 - bm25Score)); // convert bm25 score to similarity score
        
        resultChunks.push_back(chunk);
    }

    return resultChunks;
}

std::pair<std::string, std::string> TextSearchTable::getContent(int64_t chunkId, int64_t embeddingId)
{
    auto queryStmt = sqlite.getStatement("SELECT content, metadata FROM " + tableName + " WHERE chunkId = ? AND embeddingId = ?");
    queryStmt.bind(1, chunkId);
    queryStmt.bind(2, embeddingId);

    if(!queryStmt.step())
    {
        throw Exception{Exception::Type::notFound, "No chunk found with chunkId: " + std::to_string(chunkId) + " and embeddingId: " + std::to_string(embeddingId)};
    }

    return {queryStmt.get<std::string>(0), queryStmt.get<std::string>(1)};
}