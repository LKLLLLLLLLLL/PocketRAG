#include "SqliteConnection.h"

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

thread_local SqliteConnection::LocalDataManager SqliteConnection::dataManager;

// ---------------------SqliteConnection---------------------
void SqliteConnection::openSqlite(LocalData &data)
{
    auto dbFullPath = std::filesystem::path(dbDirPath) / (tableName + ".db"); // full path for the database file

    // try to create SQLite database
    auto returnCode = sqlite3_open_v2(dbFullPath.string().c_str(), &data.sqliteDB, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, nullptr);
    if (returnCode != SQLITE_OK)
    {
        throw Exception{Exception::Type::openError, "Failed to create SQLite database: " + dbFullPath.string() + "\n    sqlite error " + sqlite3_errmsg(data.sqliteDB)};
    }
}

SqliteConnection::SqliteConnection(const std::string &dbDirPath, const std::string &tableName) : dbDirPath(dbDirPath), tableName(tableName)
{
    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbDirPath))
        std::filesystem::create_directories(dbDirPath);

    // activate thread safety mode
    sqlite3_config(SQLITE_CONFIG_SERIALIZED); // enable thread safety mode for SQLite
    execute("PRAGMA journal_mode=WAL;");      // set journal mode to WAL for better concurrency
    execute("PRAGMA busy_timeout=5000;");     // set busy timeout to 5 seconds
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
        throw Exception{Exception::Type::executeError, "Failed to execute SQLite statement: " + sql + "\n    sqlite error " + std::string(sqlite3_errmsg(sqliteDB))};
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
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::transactionError, "Failed to begin transaction: " + std::string(e.what())};
    }
}

bool SqliteConnection::inTransaction() 
{ 
    return !dataManager.get(this).transactionStack.empty(); 
}

// ----------------------LocalDataManager----------------------
auto SqliteConnection::LocalDataManager::get(SqliteConnection *conn) -> LocalData&
{
    auto it = connMap.find(conn); // find the connection in the map
    if (it == connMap.end())
    {
        connMap[conn] = LocalData{};  // create new local data for the connection
        it = connMap.find(conn);      // get the local data for the connection
        conn->openSqlite(it->second); // open SQLite database for the connection
    }
    return it->second; // return the local data for the connection
}

SqliteConnection::LocalDataManager::~LocalDataManager() 
{
    for (auto &[conn, data] : connMap) // destructor to clean up all connections
    {
        // rollback all transactions if not empty
        if (!data.transactionStack.empty())
        {
            conn->execute("ROLLBACK;"); // rollback all transactions
        }
        // close the SQLite database connection
        if (data.sqliteDB != nullptr)
            sqlite3_close(data.sqliteDB);
    }
}

void SqliteConnection::LocalDataManager::removeConnection(SqliteConnection *conn)
{
    connMap.erase(conn); // remove the connection from the map
}

// ----------------------Statement----------------------
SqliteConnection::Statement::Statement(sqlite3 *db, const std::string &sql) : threadId(std::this_thread::get_id())
{
    auto returnCode = sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw Exception{Exception::Type::unknownError, "Failed to prepare SQLite statement: " + sql + "\n    sqlite error " + std::string(sqlite3_errmsg(db))};
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
        throw Exception{Exception::Type::executeError, "Failed to execute SQLite statement: " + std::string(sqlite3_errmsg(sqlite3_db_handle(stmt)))};
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
        throw Exception{Exception::Type::threadError, "SQLite transaction is not used in the same thread."};
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
    catch (const Exception &e)
    {
        std::cerr << "[FATAL ERROR] Failed to rollback transaction: " << e.what() << std::endl;
    }
}

void SqliteConnection::Transaction::commit()
{
    checkThread();
    if(!isActive)
    {
        throw Exception{Exception::Type::transactionError, "Transaction is not active, cannot commit."};
    }
    if(sqlite.dataManager.get(&sqlite).transactionStack.top() != transactionName)
    {
        throw Exception{Exception::Type::transactionError, "Transaction has sub transactions active, cannot commit."};
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
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::fatalError, "Failed to commit transaction: " + std::string(e.what())};
    }
}

void SqliteConnection::Transaction::rollback()
{
    checkThread();
    if (!isActive)
    {
        throw Exception{Exception::Type::transactionError, "Transaction is not active, cannot rollback."};
    }
    if (sqlite.dataManager.get(&sqlite).transactionStack.top() != transactionName)
    {
        throw Exception{Exception::Type::transactionError, "Transaction has sub transactions active, cannot rollback."};
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
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::fatalError, "Failed to rollback transaction: " + std::string(e.what())};
    }
}