cmake_minimum_required(VERSION 3.15)

# set(CMAKE_TOOLCHAIN_FILE "${CMAKE_CURRENT_SOURCE_DIR}/../vcpkg/scripts/buildsystems/vcpkg.cmake" 
#     CACHE STRING "Vcpkg toolchain file")

project(PocketRAG_kernel VERSION 0.0.1)

# 设置输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin) # 可执行文件输出目录
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 动态库输出目录
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 静态库输出目录

# 设置C++标准
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 设置MSVC编译器使用UTF-8编码
if(MSVC)
  add_compile_options(/utf-8)
endif()

# 设置vcpkg工具链文件
include(${CMAKE_CURRENT_SOURCE_DIR}/../vcpkg/scripts/buildsystems/vcpkg.cmake)

# --------------导入依赖项---------------
# 导入sqlite3
find_package(unofficial-sqlite3 CONFIG REQUIRED)

# 导入faiss
include(CMakeFindDependencyMacro)
find_package(faiss CONFIG REQUIRED)

# 导入sentencepiece
# 设置SentencePiece选项
set(SPM_ENABLE_SHARED OFF CACHE BOOL "Build shared libary")
set(SPM_ENABLE_TCMALLOC OFF CACHE BOOL "Enable TCMalloc if available")
set(SPM_ENABLE_NFKC_NORMALIZATION OFF CACHE BOOL "Enable NFKC normalization")
set(SPM_ENABLE_SAMPLING OFF CACHE BOOL "Enable subword sampling")
set(SPM_USE_BUILTIN_PROTOBUF ON CACHE BOOL "Use built-in protobuf")
set(SPM_USE_EXTERNAL_ABSL OFF CACHE BOOL "Use external abseil")
# 如果不需要测试和示例程序
set(SPM_BUILD_TEST OFF CACHE BOOL "Build test")
set(SPM_ENABLE_TENSORFLOW_SHARED OFF CACHE BOOL "Link against TensorFlow shared lib")
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/external/sentencepiece/src)
# 添加SentencePiece作为子目录
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/external/sentencepiece)

# 导入ONNXruntime
set(ONNXRUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/external/onnxruntime-win-x64-gpu-1.21.0")
# 添加ONNX Runtime头文件路径
include_directories("${ONNXRUNTIME_DIR}/include")
# 创建ONNX Runtime导入库目标
add_library(onnxruntime SHARED IMPORTED)
set(ONNXRUNTIME_LIB "${ONNXRUNTIME_DIR}/lib/onnxruntime.lib")
set(ONNXRUNTIME_DLL "${ONNXRUNTIME_DIR}/lib/onnxruntime.dll")
set_target_properties(onnxruntime PROPERTIES
    IMPORTED_LOCATION "${ONNXRUNTIME_DLL}"
    IMPORTED_IMPLIB "${ONNXRUNTIME_LIB}"
)

# 导入cuDNN
set(CUDNN_DLL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/external/cudnn-windows-x86_64-9.8.0.87_cuda12-archive/bin")


# -------------设置编译选项--------------
# 添加头文件目录
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# 添加源文件
file(GLOB_RECURSE SOURCES "src/*.cpp")

# # 创建库
# add_library(${PROJECT_NAME} ${SOURCES})
# 创建可执行文件
add_executable(${PROJECT_NAME} ${SOURCES})

# 链接依赖库 
target_link_libraries(${PROJECT_NAME} PRIVATE
    faiss
    unofficial::sqlite3::sqlite3
    onnxruntime
    sentencepiece
)

# -------------拷贝动态链接库--------------
# 拷贝dll到输出目录，解决依赖问题
set(VCPKG_DLL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/bin")
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    # 复制vcpkg提供的DLL
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${VCPKG_DLL_DIR}"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>
    # 复制ONNX Runtime DLL
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${ONNXRUNTIME_DIR}/lib/"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>  
    # 复制cuDNN DLL
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CUDNN_DLL_DIR}"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>
)
