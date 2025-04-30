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

// ---------------------SqliteConnection---------------------

std::set<std::filesystem::path> SqliteConnection::dbPathSet;
std::mutex SqliteConnection::dbPathSetMutex;

SqliteConnection::SqliteConnection(const std::string &dbPath, const std::string &tableName) : dbPath(dbPath), tableName(tableName)
{
    dbFullPath = std::filesystem::path(dbPath) / (tableName + ".db");

    // check and update dbPathSet
    {
        std::lock_guard<std::mutex> lock(dbPathSetMutex); // lock the mutex to protect dbPathSet

        // check if the database path is already opened
        if (dbPathSet.find(dbFullPath) != dbPathSet.end())
            throw Exception{Exception::Type::openError, "Database path already opened: " + dbFullPath.string()};

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
        throw Exception{Exception::Type::openError, "Failed to create SQLite database: " + dbFullPath.string() + "\n    sqlite error " + sqlite3_errmsg(sqliteDB)};
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
        throw Exception{Exception::Type::executeError, "Failed to execute SQLite statement: " + sql + "\n    sqlite error " + std::string(sqlite3_errmsg(sqliteDB))};
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
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::transactionError, "Failed to begin transaction: " + std::string(e.what())};
    }
}

// ----------------------Statement----------------------
SqliteConnection::Statement::Statement(sqlite3 *db, const std::string &sql)
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
        throw Exception{Exception::Type::executeError, "Failed to execute SQLite statement: " + std::string(sqlite3_errmsg(sqlite3_db_handle(stmt)))};
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
    catch (const Exception &e)
    {
        std::cerr << "[FATAL ERROR] Failed to rollback transaction: " << e.what() << std::endl;
    }
}

void SqliteConnection::Transaction::commit()
{
    if(!isActive)
    {
        throw Exception{Exception::Type::transactionError, "Transaction is not active, cannot commit."};
    }
    if(sqlite.transactionStack.top() != transactionName)
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
        sqlite.transactionStack.pop();
    }
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::fatalError, "Failed to commit transaction: " + std::string(e.what())};
    }
}

void SqliteConnection::Transaction::rollback()
{
    if (!isActive)
    {
        throw Exception{Exception::Type::transactionError, "Transaction is not active, cannot rollback."};
    }
    if (sqlite.transactionStack.top() != transactionName)
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
        sqlite.transactionStack.pop();
    }
    catch (const Exception &e)
    {
        throw Exception{Exception::Type::fatalError, "Failed to rollback transaction: " + std::string(e.what())};
    }
}