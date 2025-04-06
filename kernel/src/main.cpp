#include <iostream>
#include <vector>
#include <faiss/IndexFlat.h>
#include <sqlite3.h>

int main() {
    // FAISS 测试
    int dimension = 128;
    int database_size = 1000;
    int query_size = 5;

    // 创建一个 Flat 索引
    faiss::IndexFlatL2 index(dimension);

    // 生成一些随机向量作为数据库
    std::vector<float> database(dimension * database_size);
    for (int i = 0; i < dimension * database_size; ++i) {
        database[i] = float(rand()) / float(RAND_MAX);
    }

    // 将向量添加到索引中
    index.add(static_cast<faiss::idx_t>(database_size), database.data());

    // 生成一些随机查询向量
    std::vector<float> queries(dimension * query_size);
    for (int i = 0; i < dimension * query_size; ++i) {
        queries[i] = float(rand()) / float(RAND_MAX);
    }

    // 搜索最近邻
    int top_k = 5;
    std::vector<float> distances(query_size * top_k);
    std::vector<faiss::idx_t> labels(query_size * top_k);

    index.search(query_size, queries.data(), top_k, distances.data(), labels.data());

    std::cout << "FAISS 测试完成，找到了 " << query_size * top_k << " 个最近邻。" << std::endl;

    // SQLite3 测试
    sqlite3 *db;
    int rc = sqlite3_open("test.db", &db);

    if (rc) {
        std::cerr << "无法打开数据库: " << sqlite3_errmsg(db) << std::endl;
        sqlite3_close(db);
        return 1;
    }

    std::cout << "成功打开 SQLite3 数据库。" << std::endl;

    // 创建表
    const char *sql_create = "CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, value TEXT);";
    rc = sqlite3_exec(db, sql_create, 0, 0, 0);

    if (rc != SQLITE_OK) {
        std::cerr << "创建表失败: " << sqlite3_errmsg(db) << std::endl;
        sqlite3_close(db);
        return 1;
    }

    std::cout << "成功创建 SQLite3 表。" << std::endl;

    // 插入数据
    const char *sql_insert = "INSERT INTO test_table (value) VALUES ('test_value');";
    rc = sqlite3_exec(db, sql_insert, 0, 0, 0);

    if (rc != SQLITE_OK) {
        std::cerr << "插入数据失败: " << sqlite3_errmsg(db) << std::endl;
        sqlite3_close(db);
        return 1;
    }

    std::cout << "成功插入数据到 SQLite3 表。" << std::endl;

    // 关闭数据库
    sqlite3_close(db);

    std::cout << "SQLite3 测试完成。" << std::endl;

    return 0;
}