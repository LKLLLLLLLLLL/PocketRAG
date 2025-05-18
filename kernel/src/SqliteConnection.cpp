#include "SqliteConnection.h"

#include <string>
#include <filesystem>
#include <stack>
#include <mutex>
#include <sqlite3.h>
#include <cppjieba/Jieba.hpp>

#include "TextSearchTable.h"

SqliteConnection::LocalDataManager SqliteConnection::dataManager;

namespace
{
    struct SqliteInitializer
    {
    private:
        SqliteInitializer()
        {
            sqlite3_config(SQLITE_CONFIG_SERIALIZED); // enable thread safety mode for SQLite
        }
    public:
        static void initialize()
        {
            static SqliteInitializer instance; // create a static instance of SqliteInitializer
        }
    };
};

// ---------------------SqliteConnection---------------------
void SqliteConnection::openSqlite(LocalData &data)
{
    auto dbFullPath = std::filesystem::path(dbDirPath) / (dbName + ".db"); // full path for the database file

    // try to create SQLite database
    auto returnCode = sqlite3_open_v2(dbFullPath.string().c_str(), &data.sqliteDB, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, nullptr);
    if (returnCode != SQLITE_OK)
    {
        throw Error{"Failed to open SQLite database: " + dbFullPath.string() + ", sqlite error " + std::string(sqlite3_errmsg(data.sqliteDB)), Error::Type::Database};
    }

    // register the jieba tokenizer to the SQLite database
    jiebaTokenizer::register_jieba_tokenizer(data.sqliteDB);

    sqlite3_busy_timeout(data.sqliteDB, 10000); // set busy timeout to 10 seconds
}

SqliteConnection::SqliteConnection(const std::string &dbDirPath, const std::string &dbName) : dbDirPath(dbDirPath), dbName(dbName)
{
    SqliteInitializer::initialize();
    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbDirPath))
        std::filesystem::create_directories(dbDirPath);

    // activate thread safety mode
    execute("PRAGMA journal_mode=WAL;");      // set journal mode to WAL for better concurrency
    logger.info("SQLite database opened at " + dbDirPath + "/" + dbName + ".db");
}

SqliteConnection::~SqliteConnection()
{
    dataManager.removeConnection(this); // remove the connection from the local data manager
}

int SqliteConnection::execute(const std::string &sql)
{  
    auto sqliteDB = dataManager.get(this).sqliteDB; 
    auto returnCode = sqlite3_exec(sqliteDB, sql.c_str(), nullptr, nullptr, nullptr);
    if(returnCode != SQLITE_OK)
    {
        throw Error{"Failed to execute SQLite statement: " + sql + "\nsqlite error " + std::string(sqlite3_errmsg(sqliteDB)), Error::Type::Database};
    }
    return sqlite3_changes(sqliteDB); // return the number of changes made by the SQL statement
}

int64_t SqliteConnection::getLastInsertId() 
{
    auto sqliteDB = dataManager.get(this).sqliteDB; 
    return sqlite3_last_insert_rowid(sqliteDB); // get the last insert id from the database handle
}

auto SqliteConnection::getStatement(const std::string &sql) -> Statement
{
    auto sqliteDB = dataManager.get(this).sqliteDB; 
    return Statement{sqliteDB, sql}; // create a new statement object
}

auto SqliteConnection::beginTransaction() -> Transaction
{
    try
    {
        auto& transactionStack = dataManager.get(this).transactionStack;
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
    catch (const Error &e)
    {
        throw Error{"Failed to begin transaction, because: ", Error::Type::Database} + e;
    }
}

bool SqliteConnection::inTransaction() 
{ 
    return !dataManager.get(this).transactionStack.empty(); 
}

// ----------------------LocalDataManager----------------------
size_t SqliteConnection::LocalDataManager::hash::operator()(const std::pair<SqliteConnection *, std::thread::id> &key) const
{
    return std::hash<SqliteConnection *>()(key.first) ^ std::hash<std::thread::id>()(key.second);
}

SqliteConnection::LocalDataManager::LocalDataCleaner::~LocalDataCleaner() // when this thread closed, clean up all connections
{
    std::lock_guard<std::mutex> lock(dataManager.mutex);
    auto it = dataManager.connMap.begin();
    while (it != dataManager.connMap.end())
    {
        auto &[key, data] = *it;
        auto &[conn, threadId] = key;
        if (threadId != std::this_thread::get_id())
        {
            it++;
        }
        it = dataManager.connMap.erase(it);
    }
}

auto SqliteConnection::LocalDataManager::get(SqliteConnection *conn) -> LocalData&
{
    std::lock_guard<std::mutex> lock(mutex);
    auto threadId = std::this_thread::get_id(); // get the current thread id
    auto it = connMap.find({conn, threadId}); // find the connection in the map
    if (it == connMap.end())
    {
        connMap[{conn, threadId}] = LocalData{}; // create new local data for the connection
        it = connMap.find({conn, threadId});     // get the local data for the connection
        conn->openSqlite(it->second); // open SQLite database for the connection
    }
    return it->second; // return the local data for the connection
}

void SqliteConnection::LocalDataManager::removeConnection(SqliteConnection *conn)
{
    std::lock_guard<std::mutex> lock(mutex);
    auto it = connMap.begin();
    while(it != connMap.end())
    {
        auto &[key, data] = *it;
        auto& [connPtr, threadId] = key;
        if(conn != connPtr)
        {
            ++it; // move to the next element
            continue;
        }
        it = connMap.erase(it);
    }
}

// ----------------------Statement----------------------
SqliteConnection::Statement::Statement(sqlite3 *db, const std::string &sql) : threadId(std::this_thread::get_id())
{
    auto returnCode = sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw Error{"Failed to prepare SQLite statement: " + sql + ", sqlite error " + std::string(sqlite3_errmsg(db)), Error::Type::Database};
}

void SqliteConnection::Statement::checkThread() const
{
    if (threadId != std::this_thread::get_id())
        throw Error{"SQLite statement is not used in the same thread.", Error::Type::Internal};
}

SqliteConnection::Statement::~Statement()
{
    if (stmt != nullptr)
        sqlite3_finalize(stmt); // finalize the statement to free resources
}

SqliteConnection::Statement::Statement(Statement &&other) noexcept : threadId(std::this_thread::get_id())
{
    std::swap(stmt, other.stmt); 
}

SqliteConnection::Statement& SqliteConnection::Statement::operator=(Statement &&other) noexcept
{
    checkThread();
    std::swap(stmt, other.stmt); 
    return *this;
}

bool SqliteConnection::Statement::step()
{
    checkThread();
    auto returnCode = sqlite3_step(stmt);
    if (returnCode == SQLITE_ROW) 
    {
        has_result = true;
        return true;
    }
    else if (returnCode == SQLITE_DONE) 
    {
        has_result = false;
        return false;
    }
    else
    {
        throw Error{"Failed to step SQLite statement, sql error " + std::string(sqlite3_errmsg(sqlite3_db_handle(stmt))), Error::Type::Database};
    }
}

int SqliteConnection::Statement::changes() const
{
    checkThread();
    return sqlite3_changes(sqlite3_db_handle(stmt)); // get changes count from the database handle
}

int SqliteConnection::Statement::getColumnCount() const
{
    checkThread();
    return sqlite3_column_count(stmt);
}

std::string SqliteConnection::Statement::getColumnName(int col) const
{
    checkThread();
    auto name = sqlite3_column_name(stmt, col);
    return name ? name : "";
}

void SqliteConnection::Statement::reset()
{
    checkThread();
    sqlite3_reset(stmt);
}

// ----------------------Transaction---------------------
void SqliteConnection::Transaction::checkThread() const 
{
    if (threadId != std::this_thread::get_id())
        throw Error{"SQLite transaction is not used in the same thread.", Error::Type::Internal};
}

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
    catch (const Error &e)
    {
        logger.warning("Failed to rollback transaction: " + std::string(e.what()) + ", may cause data conflict!");
    }
}

SqliteConnection::Transaction::Transaction(Transaction &&other) : sqlite(other.sqlite), isActive(other.isActive), transactionName(other.transactionName), threadId(other.threadId)
{
    other.isActive = false;
    other.transactionName = "";
}

auto SqliteConnection::Transaction::operator=(Transaction &&other) -> Transaction&
{
    if (this != &other) 
    { 
        if (isActive) 
        {
            this->rollback();
        }

        if (&sqlite != &other.sqlite) 
        {
            throw Error{"Cannot move transaction between different connections.", Error::Type::Internal};
        }

        isActive = other.isActive;
        transactionName = other.transactionName;
        threadId = other.threadId;

        other.isActive = false;
        other.transactionName = "";
    }
    return *this;
}

void SqliteConnection::Transaction::commit()
{
    checkThread();
    if(!isActive)
    {
        throw Error{"Transaction is not active, cannot commit.", Error::Type::Internal};
    }
    if(sqlite.dataManager.get(&sqlite).transactionStack.top() != transactionName)
    {
        throw Error{"Transaction has sub transactions active, cannot commit.", Error::Type::Internal};
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
        sqlite.dataManager.get(&sqlite).transactionStack.pop();
    }
    catch (const Error &e)
    {
        throw Error{"Failed to commit transaction: ", Error::Type::Database} + e;
    }
}

void SqliteConnection::Transaction::rollback()
{
    checkThread();
    if (!isActive)
    {
        throw Error{"Transaction is not active, cannot rollback.", Error::Type::Internal};
    }
    if (sqlite.dataManager.get(&sqlite).transactionStack.top() != transactionName)
    {
        throw Error{"Transaction has sub transactions active, cannot rollback.", Error::Type::Internal};
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
        sqlite.dataManager.get(&sqlite).transactionStack.pop();
    }
    catch (const Error &e)
    {
        throw Error{"Failed to rollback transaction: ", Error::Type::Database} + e;
    }
}