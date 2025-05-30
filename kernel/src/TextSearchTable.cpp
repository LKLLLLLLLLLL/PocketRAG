#include "TextSearchTable.h"
#include "Utils.h"
#include <string>

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
        get_jieba_ptr();

        cppjieba::Jieba *jieba = (cppjieba::Jieba *)pTokenizer;
        std::string text(pText, nText);
        std::vector<std::string> words;

        // tokenize
        cut(text, words);

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
    void register_jieba_tokenizer(sqlite3 *db)
    {
        static fts5_tokenizer tokenizer = {
            jieba_tokenizer_create,
            jieba_tokenizer_delete,
            jieba_tokenizer_tokenize};

        fts5_api *fts5api = nullptr;
        sqlite3_stmt *stmt = nullptr;

        try
        {
            auto statement = sqlite3_prepare_v2(db, "SELECT fts5(?)", -1, &stmt, nullptr);
            if (statement != SQLITE_OK)
            {
                throw Error{"Failed to prepare statement, sql error" + std::string(sqlite3_errmsg(db)), Error::Type::Database};
            }
            sqlite3_bind_pointer(stmt, 1, (void *)&fts5api, "fts5_api_ptr", nullptr); // bind the fts5_api pointer to the statement
            sqlite3_step(stmt);                                                       // execute the statement
            sqlite3_finalize(stmt);                                                   // finalize the statement

            // register the tokenizer to the SQLite database
            auto rc = fts5api->xCreateTokenizer(fts5api, "jieba", (void *)jieba, &tokenizer, nullptr);
            if (rc != SQLITE_OK)
            {
                throw Error{"Failed to register jieba tokenizer, sql error" + std::string(sqlite3_errmsg(db)), Error::Type::Database};
            }
        }
        catch (const Error &e)
        {
            throw Error{"Failed to register jieba tokenizer: ", Error::Type::Database} + e;
        }
    }

    cppjieba::Jieba *get_jieba_ptr()
    {
        if(jieba != nullptr) 
            return jieba;
        {
            std::lock_guard<std::mutex> lock(jiebaMutex);
            Utils::Timer timer("[Jieba] jieba initialization");
            if (jieba == nullptr) // initialize jieba object
            {
                jieba = new cppjieba::Jieba(DICT_PATH, HMM_PATH, USER_DICT_PATH, IDF_PATH, STOP_WORD_PATH); // PATH has been defined in the cmakefile
            }
            timer.stop();
        }
        return jieba;
    }

};

void jiebaTokenizer::cut(const std::string &text, std::vector<std::string> &words, bool needLower)
{
    get_jieba_ptr();

    std::lock_guard<std::mutex> lock(jiebaMutex);
    auto ltext = text;
    if(needLower)
        ltext = Utils::toLower(text);
    jieba->Cut(ltext, words);
}

void jiebaTokenizer::cutForSearch(const std::string &text, std::vector<std::string> &words, bool needLower)
{
    get_jieba_ptr();

    std::lock_guard<std::mutex> lock(jiebaMutex);
    auto ltext = text;
    if (needLower)
        ltext = Utils::toLower(text);
    jieba->CutForSearch(ltext, words);
}

//-----------------------TextSearchTable---------------------
const std::string TextSearchTable::ResultChunk::HIGHLIGHT_BEGINS = "<mark>";
const std::string TextSearchTable::ResultChunk::HIGHLIGHT_ENDS = "</mark>";

TextSearchTable::TextSearchTable(SqliteConnection &sqlite, const std::string &tableName): sqlite(sqlite), tableName(tableName)
{
    // create the FTS5 table if it does not exist
    sqlite.execute("CREATE VIRTUAL TABLE IF NOT EXISTS " + tableName + " USING fts5("
        "content, "
        "metadata, "
        "chunkId UNINDEXED,"
        "tokenize='jieba');"
    );
}

// search in fts5 table before adding a new chunk, may be slow
void TextSearchTable::addChunk(const Chunk &chunk)
{
    std::unique_lock writelock(mutex); // lock for writing
    auto query = sqlite.getStatement("SELECT COUNT(*) FROM " + tableName + " WHERE chunkId = ?");
    query.bind(1, chunk.chunkId);
    query.step();
    int count = query.get<int>(0);
    auto content = chunk.content;
    auto metadata = chunk.metadata;

    assert(count <= 1); // should not have more than one chunk with the same chunkId 
    if(count == 1) // existint chunk, update it
    {
        auto update = sqlite.getStatement("UPDATE " + tableName + " SET content = ?, metadata = ? WHERE chunkId = ?");
        update.bind(1, content);
        update.bind(2, metadata);
        update.bind(3, chunk.chunkId);
        update.step();
    }
    else // new chunk, insert it
    {
        auto insert = sqlite.getStatement("INSERT INTO " + tableName + " (content, metadata, chunkId) VALUES (?, ?, ?)");
        insert.bind(1, content);
        insert.bind(2, metadata);
        insert.bind(3, chunk.chunkId);
        insert.step();
    }
}

void TextSearchTable::deleteChunk(int64_t chunkId)
{
    std::unique_lock writelock(mutex); // lock for writing
    auto deleteStmt = sqlite.getStatement("DELETE FROM " + tableName + " WHERE chunkId = ?");
    deleteStmt.bind(1, chunkId);
    deleteStmt.step();
    
    if(deleteStmt.changes() == 0)
    {
        throw Error{"No chunk found with chunkId: " + std::to_string(chunkId), Error::Type::Internal};
    }
}

auto TextSearchTable::search(const std::string &query, int limit) -> std::vector<ResultChunk>
{
    // tokenize the query using jieba
    std::vector<std::string> keywords;
    jiebaTokenizer::cutForSearch(query, keywords); 

    if(keywords.empty())
    {
        return {}; // no keywords, return empty result
    }
    std::string queryStr;
    for (size_t i = 0; i < keywords.size(); ++i)
    {
        std::string safeKeyword;
        for (char c : keywords[i]) 
        {
            if (std::isalnum(static_cast<unsigned char>(c)) || c > 127u) 
            { 
                safeKeyword += c;
            }
        }
        
        if (!safeKeyword.empty()) 
        {
            if (!queryStr.empty()) queryStr += " OR ";
            queryStr += safeKeyword;
        }
    }
    if(queryStr.empty())
    {
        return {}; // no keywords, return empty result
    }

    // construct the query stmt
    auto& begin = ResultChunk::HIGHLIGHT_BEGINS;
    auto& end = ResultChunk::HIGHLIGHT_ENDS;
    auto qerySql = 
    "SELECT highlight(" + tableName + ", 0, '" + begin + "', '" + end + "') AS highlighted_content, "
            "highlight(" + tableName + ", 1, '" + begin + "', '" + end + "') AS highlighted_metadata, "
            "chunkId, bm25(" + tableName + ") AS score "
    "FROM " + tableName + " "
    "WHERE " + tableName + " MATCH ? "
    "ORDER BY score "  
    "LIMIT ?";
    auto queryStmt = sqlite.getStatement(qerySql);
    queryStmt.bind(1, queryStr);
    queryStmt.bind(2, limit);

    std::shared_lock readlock(mutex); // lock for reading
    std::vector<ResultChunk> resultChunks;
    while(queryStmt.step())
    {
        ResultChunk chunk;
        chunk.content = queryStmt.get<std::string>(0);
        chunk.metadata = queryStmt.get<std::string>(1);
        chunk.chunkId = queryStmt.get<int64_t>(2);
        auto bm25Score = queryStmt.get<double>(3);
        chunk.similarity = 1.0 - (1.0 / (1.0 - bm25Score)); // convert bm25 score to similarity score
        
        resultChunks.push_back(chunk);
    }

    return resultChunks;
}

std::pair<std::string, std::string> TextSearchTable::getContent(int64_t chunkId)
{
    std::shared_lock readlock(mutex); // lock for reading
    auto queryStmt = sqlite.getStatement("SELECT content, metadata FROM " + tableName + " WHERE chunkId = ?");
    queryStmt.bind(1, chunkId);

    if(!queryStmt.step())
    {
        throw Error{"No chunk found with chunkId: " + std::to_string(chunkId), Error::Type::Internal};
    }

    return {queryStmt.get<std::string>(0), queryStmt.get<std::string>(1)};
}

void TextSearchTable::dropTable(SqliteConnection &sqlite, const std::string &tableName)
{
    sqlite.execute("DROP TABLE IF EXISTS " + tableName + ";"); // drop the table if exists
}

std::string TextSearchTable::reHighlight(const std::string &text, const std::vector<std::string> &keywords)
{
    if (text.empty() || keywords.empty())
    {
        return text;
    }
    std::string result = text;
    
    // filter kewords
    std::vector<std::string> safeKeywords;
    for (size_t i = 0; i < keywords.size(); ++i)
    {
        std::string safeKeyword;
        for (char c : keywords[i])
        {
            if (std::isalnum(static_cast<unsigned char>(c)) || c > 127u)
            {
                safeKeyword += c;
            }
        }
        if (!safeKeyword.empty())
        {
            safeKeywords.push_back(safeKeyword);
        }
    }
    if(safeKeywords.empty())
    {
        return result;
    }

    // remove duplicate and contained keywords
    std::vector<std::string> uniqueKeywords;
    for (const auto &keyword : safeKeywords)
    {
        bool found = false;
        for (auto it = uniqueKeywords.begin(); it != uniqueKeywords.end();)
        {
            bool isSubstr = (it->find(keyword) != std::string::npos);
            if (isSubstr)
            {
                found = true;
                break;
            }
            bool isSuperstr = (keyword.find(*it) != std::string::npos);
            if (isSuperstr)
            {
                it = uniqueKeywords.erase(it);
                continue;
            }
            ++it;
        }
        if (!found)
        {
            uniqueKeywords.push_back(keyword);
        }
    }

    // remove short keywords
    for(auto it = uniqueKeywords.begin(); it != uniqueKeywords.end();)
    {
        if (Utils::utf8Length(*it) < MIN_KEYWORD_LENGTH)
        {
            it = uniqueKeywords.erase(it);
        }
        else
        {
            ++it;
        }
    }

    for (const auto &keyword : uniqueKeywords)
    {
        auto pos = result.find(keyword);
        while (pos != std::string::npos)
        {
            result.insert(pos, ResultChunk::HIGHLIGHT_BEGINS);
            pos += keyword.length() + ResultChunk::HIGHLIGHT_BEGINS.length();
            result.insert(pos, ResultChunk::HIGHLIGHT_ENDS);
            pos += ResultChunk::HIGHLIGHT_ENDS.length();
            pos = result.find(keyword, pos);
        }
    }
    return result;
}
