﻿# kernel

该项目的kernel依赖主要通过三种方式添加：vcpkg, source code, precompiled binary。如果需要补全依赖，请依次执行以下步骤。

## 1. vcpkg

vcpkg主要管理依赖如下：

- **curl**：用于提供http请求能力
- **nlohmann_json**：用于提供json解析能力
- **cmark**：用于提供markdown解析能力
- **xxhash**：用于提供hash计算  
- **openblas**：faiss的依赖
- **lapack**：faiss的依赖

通过如下命令获取vcpkg源码并构建可执行文件`vcpkg`:

```shell
cd PocketRAG
git submodule update --init --recursive
./vcpkg/bootstrap-vcpkg.bat # on windows
cd kernel
../vcpkg/vcpkg install
```

执行成功后则完成添加完成vcpkg管理的依赖。

## 2. source code

通过源码添加依赖如下：

- **sqlite3**：用于提供轻量化数据库支持

该部分已经通过git管理，无需单独添加。
  
## 3. submodule

通过git submodule管理依赖如下：

- **sentencepiece**：用于提供分词能力
- **cppjieba**：用于提供中文分词能力
- **faiss**：用于提供向量检索能力

该部分已经通过git submodule添加到项目中，在根目录执行以下命令即可完成添加：

```shell
cd PocketRAG
git submodule update --init --recursive
```

## 4. precompiled binary

需要手动下载以下依赖的预编译二进制文件，并放置在`/kernel/external`目录下：

### ONNX runtime

用途：提供本地模型推理能力，支持GPU加速  
版本：v1.21.0  
https://github.com/microsoft/onnxruntime/releases/tag/v1.21.0

建议：使用`onnxruntime-win-x64-gpu-1.21.0.zip`版本。

#### 安装步骤：

1. 下载`onnxruntime-win-x64-gpu-1.21.0.zip`文件
2. 解压缩到`/kernel/external`目录下
3. 改名为`onnxruntime`
4. 验证cmake是否能找到onnxruntime

### cuDNN

用途：提供GPU加速  
版本：9.8.0.87_cuda12  
https://developer.nvidia.com/cudnn-downloads

