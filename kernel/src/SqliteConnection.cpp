#include <SqliteConnection.h>

#include <string>
#include <vector>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <stack>
#include <memory>
#include <mutex>

#include <sqlite3.h>
#include <cppjieba/Jieba.hpp>

// ---------------------SqliteConnection---------------------

std::set<std::filesystem::path> SqliteConnection::dbPathSet;
std::mutex SqliteConnection::dbPathSetMutex;

// helper function to register the jieba tokenizer to SQLite database
namespace
{
    cppjieba::Jieba *jieba = nullptr; // Global Jieba tokenizer instance
    std::mutex jiebaMutex; // to protect jieba pointer

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
        jieba->CutForSearch(text, words);

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
            if(jieba == nullptr)// initialize jieba object
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

        try{        
            auto statement = db.getStatement("SELECT fts5(?)");
            statement.bind(1, (void *)&fts5api, "fts5_api_ptr"); // bind the fts5_api pointer to the statement
            statement.step(); 

            statement.reset(); // reset the statement for reuse
            if (fts5api == nullptr)
            {
                throw SqliteConnection::SqliteException{SqliteConnection::SqliteException::Type::unknownError, "Failed to get FTS5 API pointer"};
            }

            // register the tokenizer to the SQLite database
            auto rc = fts5api->xCreateTokenizer(fts5api, "jieba", (void *)jieba, &tokenizer, nullptr);
            if(rc != SQLITE_OK)
            {
                throw SqliteConnection::SqliteException{SqliteConnection::SqliteException::Type::unknownError, "Failed to register jieba tokenizer"};
            }
        } 
        catch(const SqliteConnection::SqliteException &e)
        {
            throw SqliteConnection::SqliteException{SqliteConnection::SqliteException::Type::unknownError, "Failed to register jieba tokenizer: " + std::string(e.what())};
        }
    }
}

SqliteConnection::SqliteConnection(const std::string &dbPath, const std::string &tableName, bool addTokenizer) : dbPath(dbPath), tableName(tableName)
{
    dbFullPath = std::filesystem::path(dbPath) / (tableName + ".db");

    // check and update dbPathSet
    {
        std::lock_guard<std::mutex> lock(dbPathSetMutex); // lock the mutex to protect dbPathSet

        // check if the database path is already opened
        if (dbPathSet.find(dbFullPath) != dbPathSet.end())
            throw SqliteException{SqliteException::Type::openError, "Database path already opened: " + dbFullPath.string()};

        // add the database path to the set
        dbPathSet.insert(dbFullPath); 
    }
    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbPath))
        std::filesystem::create_directories(dbPath);

    // try to create SQLite database
    auto returnCode = sqlite3_open_v2(dbFullPath.string().c_str(), &sqliteDB, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, nullptr);
    if (returnCode != SQLITE_OK)
    {
        std::lock_guard<std::mutex> lock(dbPathSetMutex); // lock the mutex to protect dbPathSet
        dbPathSet.erase(dbFullPath); // remove the database path from the set
        throw SqliteException{SqliteException::Type::openError, "Failed to create SQLite database: " + dbFullPath.string() + "\n    sqlite error " + sqlite3_errmsg(sqliteDB)};
    }

    // register the jieba tokenizer if needed
    if(addTokenizer)
    {
        register_jieba_tokenizer(*this); // register the tokenizer to the SQLite database
    }
}

SqliteConnection::~SqliteConnection()
{
    // rollback all transactions if not empty
    if(!transactionStack.empty())
    {
        this->execute("ROLLBACK;"); // rollback all transactions
    }

    // close the SQLite database connection
    if (sqliteDB != nullptr)
        sqlite3_close(sqliteDB);

    {
        std::lock_guard<std::mutex> lock(dbPathSetMutex); // lock the mutex to protect dbPathSet
        if(dbPathSet.find(dbFullPath) != dbPathSet.end())
            dbPathSet.erase(dbFullPath); // remove the database path from the set
    }
}

int SqliteConnection::execute(const std::string &sql)
{
    auto returnCode = sqlite3_exec(sqliteDB, sql.c_str(), nullptr, nullptr, nullptr);
    if(returnCode != SQLITE_OK)
    {
        throw SqliteException{SqliteException::Type::executeError, "Failed to execute SQLite statement: " + sql + "\n    sqlite error " + std::string(sqlite3_errmsg(sqliteDB))};
    }
    return sqlite3_changes(sqliteDB); // return the number of changes made by the SQL statement
}

auto SqliteConnection::getStatement(const std::string &sql) -> Statement
{
    return Statement{sqliteDB, sql}; // create a new statement object
}

auto SqliteConnection::beginTransaction() -> Transaction
{
    try
    {
        if(transactionStack.empty())
        {
            this->execute("BEGIN TRANSACTION;"); // start a new transaction
            transactionStack.push("TRANSACTION"); // push the transaction name to the stack
            return {*this, "TRANSACTION"}; // return a new transaction object
        }
        else
        {
            std::string transactionName = "savepoint_" + std::to_string(transactionStack.size());
            this->execute("SAVEPOINT " + transactionName + ";"); // create a new savepoint
            transactionStack.push(transactionName); // push the savepoint name to the stack
            return {*this, transactionName}; // return a new transaction object
        }
    }
    catch (const SqliteException &e)
    {
        throw SqliteException{SqliteException::Type::transactionError, "Failed to begin transaction: " + std::string(e.what())};
    }
}

// ----------------------Statement----------------------
SqliteConnection::Statement::Statement(sqlite3 *db, const std::string &sql)
{
    auto returnCode = sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw SqliteException{SqliteException::Type::unknownError, "Failed to prepare SQLite statement: " + sql + "\n    sqlite error " + std::string(sqlite3_errmsg(db))};
}

SqliteConnection::Statement::~Statement()
{
    if (stmt != nullptr)
        sqlite3_finalize(stmt); // finalize the statement to free resources
}

SqliteConnection::Statement::Statement(Statement &&other) noexcept
{
    std::swap(stmt, other.stmt); 
}

SqliteConnection::Statement& SqliteConnection::Statement::operator=(Statement &&other) noexcept
{
    std::swap(stmt, other.stmt); 
    return *this;
}

bool SqliteConnection::Statement::step()
{
    auto returnCode = sqlite3_step(stmt);
    if (returnCode == SQLITE_ROW) 
    {
        return true;
    }
    else if (returnCode == SQLITE_DONE) 
    {
        return false;
    }
    else
    {
        throw SqliteException{SqliteException::Type::executeError, "Failed to execute SQLite statement: " + std::string(sqlite3_errmsg(sqlite3_db_handle(stmt)))};
    }
}

// ----------------------Transaction---------------------
SqliteConnection::Transaction::~Transaction()
{
    if(!isActive)
    {
        return; 
    }
    try
    {
        this->rollback();
    }
    catch (const SqliteException &e)
    {
        std::cerr << "[FATAL ERROR] Failed to rollback transaction: " << e.what() << std::endl;
    }
}

void SqliteConnection::Transaction::commit()
{
    if(!isActive)
    {
        throw SqliteException{SqliteException::Type::transactionError, "Transaction is not active, cannot commit."};
    }
    if(sqlite.transactionStack.top() != transactionName)
    {
        throw SqliteException{SqliteException::Type::transactionError, "Transaction has sub transactions active, cannot commit."};
    }
    try
    {
        if (transactionName == "TRANSACTION")
        {
            sqlite.execute("COMMIT;"); 
        }
        else
        {
            sqlite.execute("RELEASE " + transactionName + ";"); 
        }
        isActive = false;
        sqlite.transactionStack.pop();
    }
    catch (const SqliteException &e)
    {
        throw SqliteException{SqliteException::Type::fatalError, "Failed to commit transaction: " + std::string(e.what())};
    }
}

void SqliteConnection::Transaction::rollback()
{
    if (!isActive)
    {
        throw SqliteException{SqliteException::Type::transactionError, "Transaction is not active, cannot rollback."};
    }
    if (sqlite.transactionStack.top() != transactionName)
    {
        throw SqliteException{SqliteException::Type::transactionError, "Transaction has sub transactions active, cannot rollback."};
    }
    try
    {
        if (transactionName == "TRANSACTION")
        {
            sqlite.execute("ROLLBACK;"); 
        }
        else
        {
            sqlite.execute("ROLLBACK TO SAVEPOINT " + transactionName + ";"); 
            sqlite.execute("RELEASE SAVEPOINT " + transactionName + ";");
        }
        isActive = false;
        sqlite.transactionStack.pop();
    }
    catch (const SqliteException &e)
    {
        throw SqliteException{SqliteException::Type::fatalError, "Failed to rollback transaction: " + std::string(e.what())};
    }
}