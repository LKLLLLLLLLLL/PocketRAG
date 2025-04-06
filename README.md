## 从源码构建
```shell
git clone https://github.com/LKLLLLLLLLLL/PocketRAG
```
### 1. kernel
获取依赖
```shell
cd PocketRAG
git submodule update --init --recursive
./vcpkg/bootstrap-vcpkg.bat # 在windows上执行
cd kernel
../vcpkg/vcpkg install
```
编译kernel
```shell
mkdir build
cd build
cmake .. 
cmake --build . 
```