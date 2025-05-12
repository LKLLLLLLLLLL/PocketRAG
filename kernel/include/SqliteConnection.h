#pragma once
#include <string>
#include <vector>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <memory>
#include <set>
#include <mutex>
#include <stack>
#include <thread>
#include <unordered_map>

#include <sqlite3.h>

namespace 
{
    struct SqliteInitializer
    {
        SqliteInitializer()
        {
            sqlite3_config(SQLITE_CONFIG_SERIALIZED); // enable thread safety mode for SQLite
        }
    };
    static SqliteInitializer sqliteInitializer; // static initializer, run initialize once at the start of the program
};


/*
This class manages a SQLite database connection.
It will automatically create new sqlite connection for each thread, guarantee thread safety.
*/
class SqliteConnection
{
public:
    struct Exception: std::exception
    {
        enum class Type{openError, executeError, transactionError, fatalError, unknownError, threadError};
        Type type;
        std::string message; 

        Exception(Type type, const std::string &message): type(type), message(message) {}
        const char* what() const noexcept override { return message.c_str(); } // override what() method
    };

    class Statement;

    class Transaction;

    struct Nulltype {}; // used to represent a null value in SQLite
    static constexpr Nulltype null = Nulltype{}; 

private:
    std::string dbName;
    std::filesystem::path dbDirPath; // path to the database dir, will open or create the tablename.db file in this dir

    struct LocalData // thread local data for each connection
    {
        sqlite3 *sqliteDB = nullptr;
        std::stack<std::string> transactionStack;

        ~LocalData()
        {
            if (!transactionStack.empty())
            {
                sqlite3_exec(sqliteDB, "ROLLBACK;", nullptr, nullptr, nullptr); // rollback all transactions
                while (!transactionStack.empty())
                {
                    transactionStack.pop();
                }
            }
            if (sqliteDB != nullptr)
            {
                sqlite3_close(sqliteDB); // close the SQLite database connection
                sqliteDB = nullptr;      // set the pointer to null
            }
        }
    };
    
    class LocalDataManager;
    friend class LocalDataManager; // allow localDataManager to access private members

    static LocalDataManager dataManager; // thread local data manager for each connection

    void openSqlite(LocalData& data); // open SQLite database connection and initialize sqlite pointer

public:
    SqliteConnection(const std::string &dbDirPath, const std::string &tableName);
    ~SqliteConnection();

    SqliteConnection(const SqliteConnection&) = delete; // disable copy constructor
    SqliteConnection& operator=(const SqliteConnection&) = delete; // disable copy assignment operator

    SqliteConnection(SqliteConnection &&other) = delete; // disable move constructor
    SqliteConnection &operator=(SqliteConnection &&other) = delete; // disable move assignment operator

    // execute a sample SQL statement, return changes count
    int execute(const std::string &sql);

    // get the last insert id from the database
    int64_t getLastInsertId();

    // prepare a statement for execution
    Statement getStatement(const std::string &sql);

    Transaction beginTransaction(); // begin a transaction

    bool inTransaction(); // check if in transaction
};


/*
This class manage tread local data for each connection
*/
class SqliteConnection::LocalDataManager 
{
private:
    struct hash // calculate hash for std::pair<SqliteConnection *, std::thread::id>
    {
        size_t operator()(const std::pair<SqliteConnection *, std::thread::id> &key) const;
    };

    std::unordered_map<std::pair<SqliteConnection *, std::thread::id>, LocalData, hash> connMap{}; // map: (connection, threadId) -> local data
    mutable std::mutex mutex;

    struct LocalDataCleaner
    {
        ~LocalDataCleaner();
    };
    static thread_local LocalDataCleaner cleaner; // when this thread closed, clean up all connections
    friend struct LocalDataCleaner; 

public:
    LocalData &get(SqliteConnection *conn); // return or create local data for this connection and thread

    // interface for SqliteConnection to remove all relative data to himself
    void removeConnection(SqliteConnection *conn);
};


/*
This class wraps a SQLite statement.
It can be used to execute SQL statements and fetch results.
Can only be created and used in same thread.
*/
class SqliteConnection::Statement
{
public:
    struct stepResult
    {
        int changes; // number of changes made by the SQL statement
        bool isDone; // false if there are more rows to fetch
    };
private:
    sqlite3_stmt *stmt = nullptr; // SQLite statement pointer

    bool has_result = false; // true if the statement has a result set

    // only allow SqliteConnection to create Statement
    Statement(sqlite3 *db, const std::string &sql);
    friend class SqliteConnection; 

    std::thread::id threadId; // thread id of the connection

    void checkThread() const // check if the statement is used in the same thread
    {
        if (threadId != std::this_thread::get_id())
            throw Exception{Exception::Type::threadError, "SQLite statement is not used in the same thread."};
    }

public:
    ~Statement();

    Statement(const Statement &) = delete;
    Statement &operator=(const Statement &) = delete;

    // allow move constructor and move assignment operator
    Statement(Statement &&other) noexcept;
    Statement &operator=(Statement &&other) noexcept;

    // bind a value to the statement
    // handle null value
    void bind(int index, const Nulltype &)
    {
        checkThread();
        sqlite3_bind_null(stmt, index);
    }
    // handle other types
    template <typename T>
    void bind(int index, T value)
    {
        checkThread();
        if constexpr (std::is_same_v<T, int>)
            sqlite3_bind_int(stmt, index, value);
        else if constexpr (std::is_same_v<T, int64_t> || std::is_same_v<T, size_t>)
            sqlite3_bind_int64(stmt, index, value);
        else if constexpr (std::is_same_v<T, double>)
            sqlite3_bind_double(stmt, index, value);
        else if constexpr (std::is_same_v<T, std::string>)
            sqlite3_bind_text(stmt, index, value.c_str(), -1, SQLITE_TRANSIENT);
        else
            static_assert(std::is_same_v<T, void>, "Unsupported type for SQLite binding.");
    }
    // bind a pointer to the statement, requires a name to identify the pointer
    void bind(int index, void* ptr, const char* name)
    {
        checkThread();
        sqlite3_bind_pointer(stmt, index, ptr, name, nullptr);
    }

    // get execute result
    // if no result, throw an exception
    template <typename T>
    T get(int index) const
    {
        checkThread();
        if(!has_result)
            throw Exception{Exception::Type::executeError, "No result available."};
        if constexpr (std::is_same_v<T, int>)
            return sqlite3_column_int(stmt, index);
        else if constexpr (std::is_same_v<T, int64_t>)
            return sqlite3_column_int64(stmt, index);
        else if constexpr (std::is_same_v<T, double>)
            return sqlite3_column_double(stmt, index);
        else if constexpr (std::is_same_v<T, std::string>)
        {
            const unsigned char *text = sqlite3_column_text(stmt, index);
            return text ? std::string(reinterpret_cast<const char *>(text)) : "";
        }
        else
            static_assert(std::is_same_v<T, void>, "Unsupported type for SQLite retrieval.");
    }

    // execute the statement and return the result
    // return false if statement is done, true if there are more rows to fetch
    bool step();

    // return the number of changes made by the last executed statement
    int changes() const;

    // get the number of columns in the result set
    int getColumnCount() const;

    // get the name of the column at the specified index
    std::string getColumnName(int col) const;

    // reset result for next step
    void reset();
};


/*
This class manages a SQLite transaction.
Can only be created by SqliteConnection.
Can only be created and used in the same thread.
*/
class SqliteConnection::Transaction
{
private:
    SqliteConnection& sqlite; // reference to the SqliteConnection object
    bool isActive = true; // transaction status

    // if transaction is the bottom one, transactionName = "TRANSACTION"
    // else it represents the name of savepoint, eg."savepoint_1"
    std::string transactionName; // name of the transaction

    std::thread::id threadId; // thread id of the connection

    void checkThread() const; // check if the transaction is used in the same thread

    // only allow SqliteConnection to create Transaction
    Transaction(SqliteConnection &sqlite, std::string transactionName) : sqlite(sqlite), isActive(true), transactionName(transactionName), threadId(std::this_thread::get_id()) {}
    friend class SqliteConnection;

public:
    ~Transaction();

    Transaction(const Transaction&) = delete; // disable copy constructor
    Transaction& operator=(const Transaction&) = delete; // disable copy assignment operator
    Transaction(Transaction &&other) = delete; // disable move constructor
    Transaction &operator=(Transaction &&other) = delete; // disable move assignment operator

    bool checkActive() const { return isActive; } // check if transaction is active
    void commit(); // commit the transaction
    void rollback(); // rollback the transaction
};
