# 依赖指南

## kernel依赖

kernel全部由C++编写，主要有三种依赖：vcpkg, 源码, 预编译二进制。

### 1. vcpkg依赖

vcpkg主要管理依赖如下：

- **cmark**: 用于在分块时解析Markdown文本
- **curl**: 用于调用OpenAI API
- **lapack**: faiss的依赖
- **nlohmann_json**: 用于JSON解析
- **openblas**: faiss的依赖
- **xxhash**: 用于计算哈希值

上述依赖需要通过vcpkg进行管理:

1. 安装vcpkg
    ```shell
    cd PocketRAG
    git submodule update --init --recursive
    ./vcpkg/bootstrap-vcpkg.bat # on windows
    ./vcpkg/bootstrap-vcpkg.sh # on macos
    ```
    该命令只会在项目根目录安装vcpkg，不会全局安装。
2. 安装依赖
    ```shell
    cd kernel
    ../vcpkg/vcpkg install
    ```
    vcpkg会自动会根据`vcpkg.json`文件中的依赖列表下载并安装所有必要的库，并将其放置在`/kernel/vcpkg_installed`目录下。

### 2. 源代码依赖

通过源码添加依赖如下：

- **sqlite3**：用于提供轻量化数据库支持
- **sentencepiece**：用于提供分词能力
- **cppjieba**：用于提供中文分词能力
- **faiss**：用于提供向量检索能力


其中**sqlite**已经集成到git仓库，并在编译kernel时自动编译并连接,无需单独处理。

**其他依赖**通过git submodule管理在根目录执行以下命令即可添加，编译时会由cmake自动处理：

```shell
cd PocketRAG
git submodule update --init --recursive
```

### 3. 预编译二进制

在运行编译脚本时，该部分会自动下载；如果脚本执行失败，或者需要手动安装，可以参考以下步骤。

1. 在`kernel/`目录下创建`external`目录（如果不存在）。
2. 下载并解压对应版本的预编译二进制文件到`/kernel/external`目录下。
3. 根据要求重命名解压后的目录或文件。

#### ONNX runtime

用于提供本地模型推理能力。
推荐版本：v1.21.0  
https://github.com/microsoft/onnxruntime/releases/tag/v1.21.0

请根据操作系统和是否使用GPU选择合适的版本，将其解压到`/kernel/external/onnxruntime`目录。

#### cuDNN

用途：提供GPU加速  
版本：9.8.0.87_cuda12  
https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/

请将其解压到`/kernel/external/cudnn`目录下。

## node.js依赖

node.js部分依赖通过`package.json`管理，执行以下命令安装：

```shell
npm install
```