cmake_minimum_required(VERSION 3.15)
project(PocketRAG_kernel VERSION 0.0.1)

# 设置输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)


# 导入FAISS
set(_IMPORT_PREFIX "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows")
include("${_IMPORT_PREFIX}/share/faiss/faiss-targets.cmake")

# 导入unofficial-sqlite3 
include("${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/share/unofficial-sqlite3/unofficial-sqlite3-targets.cmake")

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
)

# 拷贝dll到输出目录，解决依赖问题
set(DLL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/bin")
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${DLL_DIR}"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>)
