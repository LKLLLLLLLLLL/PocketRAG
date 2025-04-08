#include "VectorTable.h"
#include <iostream>
#include <cassert>
#include <cstdio>

// Helper function to delete a file (cross-platform)
void deleteFile(const char* filename) {
    if (std::remove(filename) != 0) {
        perror("Error deleting file");
    }
}

int main() {
    // Test database path and table name
    const std::string dbPath = "./test";
    const std::string tableName = "test_table";
    const int dimension = 512;

    // // Delete the database file if it exists
    // deleteFile(dbPath.c_str());

    // 1. Create a VectorTable
    VectorTable& vt = VectorTable::getInstance();

    // 2. Create a new table
    vt.createTable(dbPath, tableName, dimension);
    std::cout << "Table created successfully." << std::endl;
    vt.close();

    // 3. Open the table
    vt.open(dbPath, tableName);
    std::cout << "Table opened successfully." << std::endl;

    // 4. Basic check:  Verify dimension is set (no direct access, so rely on addVector not crashing)
    std::vector<float> testVector(dimension, 0.0f);
    vt.addVector(testVector);
    std::cout << "Vector added successfully." << std::endl;

    // 5. Close the table
    vt.close();
    std::cout << "Table closed successfully." << std::endl;

    // 6. Re-open the table and verify it still works
    vt.open(dbPath, tableName);
    std::cout << "Table re-opened successfully." << std::endl;
    vt.close();

    // // Clean up: Delete the database file
    // deleteFile(dbPath.c_str());

    std::cout << "All tests completed." << std::endl;

    return 0;
}