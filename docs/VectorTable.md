# VectorTable设计文档
VectorTable是一个封装了一个sql表格和Faiss向量索引的类，尽量保证两者的一致性。

## 相关文档
该类依赖于：
### SQLite3
[文档](https://sqlite.org/c3ref/)
### Faiss
[wiki](https://github.com/facebookresearch/faiss/wiki/) | [API](https://faiss.ai/index.html)    

## 实现原理
VectorTable中的SQL表结构如下
``` SQL
CREATE TABLE IF NOT EXISTS
Vector(
    id INTEGER PRIMARY KEY AUTOINCREMENT, --主键，自动递增 
    valid BOOLEAN NOT NULL DEFAULT 0, --布尔值，默认值为 false(0), 说明向量是否已写入内存中的Faiss数据库 
    writeback BOOLEAN NOT NULL DEFAULT 0, --布尔值，默认值为 false(0), 说明向量是否已写入磁盘中的Faiss数据库
    deleted BOOLEAN NOT NULL DEFAULT 0, --布尔值，默认值为 false(0), 说明向量是否已删除
);
```

faiss索引的结构大致如下
``` cpp
faiss::idx_t idx; // 向量的id
vector<float> vec; // 向量的值
```

VectorTable会保证，只要SQL中的Valid为true，Faiss索引中就一定会有对应的向量。
反之，如果Faiss索引中有向量，SQL中的Valid则不一定为true，甚至可能不存在SQL的记录中

在查询时会自动过滤掉deleted = true或者valid = false的向量

由于faiss的一些Index不支持删除，因此，在删除时，会使用将sql数据表中的deleted标记为true，实现软删除；当删除数量达到设定值时，重新构造索引以提高查找效率、释放内存。

## TODO
- [ ] 支持中文路径与表名   
- [ ] 完善文档  
- [ ] 添加单元测试
- [ ] 添加线程数限制功能（`faiss::omp_set_num_threads(4)`）
- [ ] 添加faiss与sql不一致检测功能