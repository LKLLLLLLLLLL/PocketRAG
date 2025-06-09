#include "TextSearchTable.h"
#include "Utils.h"
#include <string>

//-----------------------TextSearchTable---------------------//
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

std::string TextSearchTable::reHighlight(const std::string &text, const std::string &query)
{
    if (text.empty() || query.empty())
    {
        return text;
    }
    std::string result = text;
    
    // gernerate kerwords
    std::vector<std::string> keywords{};
    jiebaTokenizer::cut(query, keywords, false);

    // filter kewords
    std::vector<std::string> filteredKeywords{};
    for (size_t i = 0; i < keywords.size(); ++i)
    {
        std::string keyword;
        for (char c : keywords[i])
        {
            if (std::isalnum(static_cast<unsigned char>(c)) || c > 127u)
            {
                keyword += c;
            }
        }
        if (!keyword.empty())
        {
            filteredKeywords.push_back(keyword);
        }
    }
    if(keywords.empty())
    {
        return result;
    }

    // remove duplicate and contained keywords
    std::vector<std::string> uniqueKeywords{};
    for (const auto &keyword : filteredKeywords)
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
        if (Utils::utf8Length(*it) < MIN_KEYWORD_LENGTH && Utils::utf8Length(query) >= MIN_KEYWORD_LENGTH)
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
