#include <string>
#include <vector>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <memory>
#include <set>
#include <mutex>
#include <stack>

#include <sqlite3.h>

/*
This class manages a SQLite database connection.
Gurantee that every database path is unique.
DO NOT CALL METHODS IN MULTIPLE THREADS.
if set addTokenizer = true, it will register a jieba tokenizer to the SQLite database.
*/
class SqliteConnection
{
public:
    struct Exception: std::exception
    {
        enum class Type{openError, executeError, transactionError, fatalError, unknownError};
        Type type;
        std::string message; 

        Exception(Type type, const std::string &message): type(type), message(message) {}
        const char* what() const noexcept override { return message.c_str(); } // override what() method
    };

    class Statement;

    class Transaction;

private:
    sqlite3 *sqliteDB = nullptr;
    std::string dbPath; // path to store databases
    std::string tableName;
    std::filesystem::path dbFullPath; // full path to the database file, generated from dbPath and tableName

    static std::set<std::filesystem::path> dbPathSet;  // make sure every database path is unique
    static std::mutex dbPathSetMutex; // mutex to protect dbPathSet

    std::stack<std::string> transactionStack; // stack to manage transactions, only store activate transactions

public:
    SqliteConnection(const std::string &dbPath, const std::string &tableName);
    ~SqliteConnection();

    SqliteConnection(const SqliteConnection&) = delete; // disable copy constructor
    SqliteConnection& operator=(const SqliteConnection&) = delete; // disable copy assignment operator

    // execute a sample SQL statement, return changes count
    int execute(const std::string &sql);
    // prepare a statement for execution
    Statement getStatement(const std::string &sql);

    Transaction beginTransaction(); // begin a transaction
};


/*
This class wraps a SQLite statement.
It can be used to execute SQL statements and fetch results.
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

    // only allow SqliteConnection to create Statement
    Statement(sqlite3 *db, const std::string &sql);
    friend class SqliteConnection; 

public:
    ~Statement();

    Statement(const Statement &) = delete;
    Statement &operator=(const Statement &) = delete;

    // allow move constructor and move assignment operator
    Statement(Statement &&other) noexcept;
    Statement &operator=(Statement &&other) noexcept;

    // bind a value to the statement
    template <typename T>
    void bind(int index, T value)
    {
        if constexpr (std::is_same_v<T, int>)
            sqlite3_bind_int(stmt, index, value);
        else if constexpr (std::is_same_v<T, int64_t>)
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
        sqlite3_bind_pointer(stmt, index, ptr, name, nullptr);
    }

    // execute the statement and return the result
    // return false if statement is done, true if there are more rows to fetch
    bool step();
    
    // return the number of changes made by the last executed statement
    int changes() const
    {
        return sqlite3_changes(sqlite3_db_handle(stmt)); // get changes count from the database handle
    }

    // get execute result
    template <typename T>
    T get(int index) const
    {
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

    // get the number of columns in the result set
    int getColumnCount() const
    {
        return sqlite3_column_count(stmt);
    }

    // get the name of the column at the specified index
    std::string getColumnName(int col) const
    {
        auto name = sqlite3_column_name(stmt, col);
        return name ? name : "";
    }

    // reset result for next step
    void reset() {sqlite3_reset(stmt);}
};


/*
This class manages a SQLite transaction.
Can only be created by SqliteConnection.
*/
class SqliteConnection::Transaction
{
private:
    SqliteConnection& sqlite; // reference to the SqliteConnection object
    bool isActive = true; // transaction status

    // if transaction is the bottom one, transactionName = "TRANSACTION"
    // else it represents the name of savepoint, eg."savepoint_1"
    std::string transactionName; // name of the transaction

    // only allow SqliteConnection to create Transaction
    Transaction(SqliteConnection &sqlite, std::string transactionName) : sqlite(sqlite), isActive(true), transactionName(transactionName) {}
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
