# 从源码构建
```shell
git clone https://github.com/LKLLLLLLLLLL/PocketRAG
```
## kernel
### 获取依赖
详见[Dependencies.md](./docs/Dependencies.md)
### 编译kernel
在 Windows 上构建时，请确保使用**Developer Command Prompt for VS 2022**运行如下命令。
```shell
cd kernel
cmake -B build --preset ninja-release
cmake --build build
```