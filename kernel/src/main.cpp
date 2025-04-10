// for temporary test
#include "VectorTable.h"
#include <iostream>
#include <chrono>
#include <vector>
#include <random>
#include <iomanip>
#include <set>
#include <algorithm>

// 生成随机向量
std::vector<std::vector<float>> generateRandomVectors(int count, int dimension)
{
    std::vector<std::vector<float>> vectors;
    vectors.reserve(count);

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dis(-10.0, 10.0);

    for (int i = 0; i < count; ++i)
    {
        std::vector<float> vec;
        vec.reserve(dimension);
        for (int j = 0; j < dimension; ++j)
        {
            vec.push_back(static_cast<float>(dis(gen)));
        }
        vectors.push_back(vec);
    }

    return vectors;
}

bool testVectorDeletionPerformance(const std::string &dbPath)
{
    std::cout << "\n========== VECTOR DELETION TEST ==========" << std::endl;

    const int dimension = 128;
    const int vectorCount = 100000;
    const int deleteCount = 10000;

    // 创建测试表格
    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "deletion_test";

    try
    {
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "Table created for vector deletion test." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error creating table: " << e.what() << std::endl;
        return false;
    }

    // 生成随机向量
    std::cout << "Generating " << vectorCount << " random vectors..." << std::endl;
    auto vectors = generateRandomVectors(vectorCount, dimension);

    // 添加向量
    std::cout << "Adding vectors to table..." << std::endl;
    std::vector<faiss::idx_t> ids = vt.addVector(vectors);
    std::cout << "Added " << ids.size() << " vectors successfully." << std::endl;

    // 随机选择要删除的IDs
    std::vector<faiss::idx_t> idsToDelete;
    idsToDelete.reserve(deleteCount);

    std::set<faiss::idx_t> selectedIds;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<int> dis(0, ids.size() - 1);

    while (selectedIds.size() < deleteCount)
    {
        selectedIds.insert(ids[dis(gen)]);
    }

    for (auto id : selectedIds)
    {
        idsToDelete.push_back(id);
    }

    // 记录最大ID值，用于后续生成不存在的ID
    faiss::idx_t maxId = *std::max_element(ids.begin(), ids.end());

    // 验证删除前的查询功能
    std::cout << "Verifying query functionality before deletion..." << std::endl;
    for (int i = 0; i < 5; i++)
    {
        int idx = dis(gen);
        auto results = vt.querySimlar(vectors[idx], 10);
        if (results.first.empty())
        {
            std::cerr << "Error: Query returned no results before deletion." << std::endl;
            return false;
        }
    }

    // 1. 测试单个删除性能
    std::cout << "\nTesting individual deletion performance..." << std::endl;
    std::vector<faiss::idx_t> individuallyDeletedIds;
    individuallyDeletedIds.reserve(deleteCount / 2);

    auto start1 = std::chrono::high_resolution_clock::now();
    int successfulDeletes = 0;

    for (int i = 0; i < deleteCount / 2; i++)
    {
        try
        {
            auto deletedId = vt.removeVector(idsToDelete[i]);
            individuallyDeletedIds.push_back(deletedId);
            successfulDeletes++;
        }
        catch (const std::exception &e)
        {
            std::cout << "[FAIL] Could not delete ID " << idsToDelete[i] << ": " << e.what() << std::endl;
        }
    }

    auto end1 = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed1 = end1 - start1;

    std::cout << "Deleted " << successfulDeletes << " vectors individually in "
              << std::fixed << std::setprecision(3) << elapsed1.count()
              << " seconds (" << (elapsed1.count() / successfulDeletes * 1000)
              << " ms per vector)." << std::endl;

    // 验证单个删除的正确性
    bool individualDeletionCorrect = true;
    for (auto id : individuallyDeletedIds)
    {
        try
        {
            auto vec = vt.getVectorFromId(id);
            std::cerr << "Error: Vector with ID " << id << " still accessible after deletion." << std::endl;
            individualDeletionCorrect = false;
        }
        catch (...)
        {
            // 预期的行为 - 向量应该无法访问
        }
    }

    if (individualDeletionCorrect)
    {
        std::cout << "[PASS] All individually deleted vectors are inaccessible." << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Some individually deleted vectors are still accessible." << std::endl;
        return false;
    }

    // 2. 测试批量删除性能 - 只使用有效ID
    std::cout << "\nTesting batch deletion performance with valid IDs..." << std::endl;
    std::vector<faiss::idx_t> validBatchIds;
    // 只选择剩余的有效ID
    for (size_t i = deleteCount / 2; i < deleteCount; i++)
    {
        validBatchIds.push_back(idsToDelete[i]);
    }

    auto start2 = std::chrono::high_resolution_clock::now();

    std::vector<faiss::idx_t> batchDeletedIds;
    try
    {
        batchDeletedIds = vt.removeVector(validBatchIds);
        std::cout << "Successfully deleted " << batchDeletedIds.size() << " vectors in batch." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error during batch deletion with valid IDs: " << e.what() << std::endl;
        return false;
    }

    auto end2 = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed2 = end2 - start2;

    std::cout << "Deleted " << batchDeletedIds.size() << " vectors in batch in "
              << std::fixed << std::setprecision(3) << elapsed2.count()
              << " seconds (" << (elapsed2.count() / batchDeletedIds.size() * 1000)
              << " ms per vector)." << std::endl;

    // 验证批量删除的正确性
    bool batchDeletionCorrect = true;
    for (auto id : batchDeletedIds)
    {
        try
        {
            auto vec = vt.getVectorFromId(id);
            std::cerr << "Error: Vector with ID " << id << " still accessible after batch deletion." << std::endl;
            batchDeletionCorrect = false;
        }
        catch (...)
        {
            // 预期的行为 - 向量应该无法访问
        }
    }

    if (batchDeletionCorrect)
    {
        std::cout << "[PASS] All batch deleted vectors are inaccessible." << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Some batch deleted vectors are still accessible." << std::endl;
        return false;
    }

    // 3. 测试批量删除对不存在ID的处理
    std::cout << "\nTesting batch deletion with non-existent IDs..." << std::endl;
    std::vector<faiss::idx_t> nonExistentIds;
    for (int i = 0; i < 5; i++)
    {
        nonExistentIds.push_back(maxId + 1000 + i);
    }

    bool errorThrown = false;
    try
    {
        vt.removeVector(nonExistentIds);
        std::cout << "[FAIL] Expected exception not thrown when deleting non-existent IDs." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cout << "[PASS] Exception correctly thrown when deleting non-existent IDs: " << e.what() << std::endl;
        errorThrown = true;
    }

    // 4. 测试混合有效和无效ID的情况
    std::cout << "\nTesting batch deletion with mixed valid and non-existent IDs..." << std::endl;
    std::vector<faiss::idx_t> mixedIds;
    // 添加一些未被删除的有效ID
    for (size_t i = 0; i < std::min(size_t(5), ids.size()); i++)
    {
        mixedIds.push_back(ids[i]);
    }
    // 添加一些不存在的ID
    mixedIds.push_back(maxId + 2000);

    bool mixedErrorThrown = false;
    try
    {
        vt.removeVector(mixedIds);
        std::cout << "[FAIL] Expected exception not thrown when deleting mixed IDs." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cout << "[PASS] Exception correctly thrown when deleting mixed IDs: " << e.what() << std::endl;
        mixedErrorThrown = true;
    }

    // 5. 验证删除的向量不会出现在查询结果中
    std::cout << "\nVerifying deleted vectors do not appear in query results..." << std::endl;
    bool queryResultsCorrect = true;

    // 合并所有被删除的ID
    std::set<faiss::idx_t> allDeletedIds;
    for (auto id : individuallyDeletedIds)
        allDeletedIds.insert(id);
    for (auto id : batchDeletedIds)
        allDeletedIds.insert(id);

    for (int i = 0; i < 10; i++)
    {
        int idx = dis(gen);
        auto results = vt.querySimlar(vectors[idx], vectorCount / 10); // 查询较多结果

        for (auto id : results.first)
        {
            if (allDeletedIds.find(id) != allDeletedIds.end())
            {
                std::cerr << "Error: Deleted ID " << id << " found in query results." << std::endl;
                queryResultsCorrect = false;
            }
        }
    }

    if (queryResultsCorrect)
    {
        std::cout << "[PASS] No deleted vectors found in query results." << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Deleted vectors still appear in query results." << std::endl;
    }

    // 计算性能提升
    double speedup = (elapsed1.count() / successfulDeletes) / (elapsed2.count() / batchDeletedIds.size());

    std::cout << "\nPerformance Comparison:" << std::endl;
    std::cout << "------------------------------------------" << std::endl;
    std::cout << "Individual deletion: " << std::fixed << std::setprecision(3)
              << (elapsed1.count() / successfulDeletes * 1000) << " ms per vector" << std::endl;
    std::cout << "Batch deletion:     " << std::fixed << std::setprecision(3)
              << (elapsed2.count() / batchDeletedIds.size() * 1000) << " ms per vector" << std::endl;
    std::cout << "Speedup factor:     " << std::fixed << std::setprecision(2)
              << speedup << "x" << std::endl;
    std::cout << "Improvement:        " << std::fixed << std::setprecision(1)
              << (speedup - 1.0) * 100.0 << "%" << std::endl;
    std::cout << "------------------------------------------" << std::endl;

    // 清理并关闭表格
    vt.close();

    return individualDeletionCorrect && batchDeletionCorrect && errorThrown && mixedErrorThrown && queryResultsCorrect;
}

int main()
{
    testVectorDeletionPerformance("./test");
    std::cin.get(); // Wait for user input before closing
    return 0;
}