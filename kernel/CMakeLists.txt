cmake_minimum_required(VERSION 3.15)
project(PocketRAG_kernel VERSION 0.0.1)

# 设置输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin) # 可执行文件输出目录
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 动态库输出目录
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 静态库输出目录

# 设置C++标准
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --------------导入依赖项---------------
# 导入FAISS
set(_IMPORT_PREFIX "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows")
include("${_IMPORT_PREFIX}/share/faiss/faiss-targets.cmake")

# 导入unofficial-sqlite3 
include("${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/share/unofficial-sqlite3/unofficial-sqlite3-targets.cmake")

# 导入sentencepiece
include_directories("${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/include")
add_library(sentencepiece SHARED IMPORTED)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(SENTENCEPIECE_LIB "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/debug/lib/sentencepiece.lib")
else()
    set(SENTENCEPIECE_LIB "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/lib/sentencepiece.lib")
endif()
set_target_properties(sentencepiece PROPERTIES
    IMPORTED_IMPLIB "${SENTENCEPIECE_LIB}"
)

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
