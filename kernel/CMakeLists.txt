cmake_minimum_required(VERSION 3.15)

project(PocketRAG_kernel VERSION 0.0.1)

# 设置输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin) # 可执行文件输出目录
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 动态库输出目录
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/lib) # 静态库输出目录

# 设置C++标准
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 平台检测和编译器设置
if(WIN32)
    # Windows 设置 
    if(MSVC)
        add_compile_options(/utf-8) # 设置MSVC编译器使用UTF-8编码
        add_compile_definitions(NOMINMAX) # 禁用windows.h中的min/max宏，避免与std::min/max冲突
    endif()
elseif(UNIX)
    # TODO
endif()

# 设置cuda选项
if(APPLE)
    set(USE_CUDA OFF)
else()
    option(USE_CUDA "Use CUDA GPU" OFF)
endif()
message(STATUS "USE_CUDA setting: ${USE_CUDA}")

# 默认使用静态库
set(BUILD_SHARED_LIBS OFF)

# 设置vcpkg工具链文件
include(${CMAKE_CURRENT_SOURCE_DIR}/../vcpkg/scripts/buildsystems/vcpkg.cmake)
include(CMakeFindDependencyMacro)

# --------------导入依赖项---------------
# 添加自定义 SQLite 构建
add_library(sqlite3 STATIC ${CMAKE_CURRENT_SOURCE_DIR}/external/sqlite3/sqlite3.c)
# 启用SQLite编译选项
target_compile_definitions(sqlite3 PRIVATE
    SQLITE_ENABLE_FTS4
    SQLITE_ENABLE_FTS5
    SQLITE_ENABLE_JSON1
    SQLITE_ENABLE_RTREE
    SQLITE_ENABLE_EXPLAIN_COMMENTS
    HAVE_READLINE
)
# 设置包含目录
target_include_directories(sqlite3 PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/external/sqlite3
)

# 导入faiss依赖：blas
# 导入openblas
find_package(OpenBLAS CONFIG REQUIRED)
set(BLA_VENDOR OpenBLAS)
set(BLAS_LIBRARIES ${OpenBLAS_LIBRARIES})
set(BLAS_INCLUDE_DIRS ${OpenBLAS_INCLUDE_DIRS})
# 导入LAPACK
if(APPLE)
    # 在macOS上使用Apple Accelerate Framework
    find_library(ACCELERATE_FRAMEWORK Accelerate REQUIRED)
    set(LAPACK_LIBRARIES ${ACCELERATE_FRAMEWORK})
    message(STATUS "Using Apple's Accelerate Framework for LAPACK")
else()
    # 在其他平台上使用LAPACK
    find_package(LAPACK CONFIG REQUIRED)
endif()

# 导入faiss
set(FAISS_ENABLE_GPU OFF)
set(FAISS_ENABLE_PYTHON OFF)
set(FAISS_ENABLE_C_API OFF)
set(BUILD_TESTING OFF)
if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64|ARM64")
    set(FAISS_OPT_LEVEL sve)
    message(STATUS "Using SVE optimization for ARM64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(FAISS_OPT_LEVEL avx2)
    message(STATUS "Using AVX2 optimization for x86_64")
else()
    set(FAISS_OPT_LEVEL generic)
    message(STATUS "Using generic optimization")
endif()
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/external/faiss)

# 导入curl
find_package(CURL CONFIG REQUIRED)

# 导入nlohmann-json
find_package(nlohmann_json CONFIG REQUIRED)

# 导入cmark
find_package(cmark CONFIG REQUIRED)

# 导入xxhash
find_package(xxHash CONFIG REQUIRED)

# 导入 cppjieba (纯头文件库)
set(CPPJIEBA_DIR ${CMAKE_CURRENT_SOURCE_DIR}/external/cppjieba)
include_directories(
    ${CPPJIEBA_DIR}/include
    ${CPPJIEBA_DIR}/deps/limonp/include
)
# 设置cppjieba字典文件路径
add_compile_definitions(
    DICT_PATH="${CPPJIEBA_DIR}/dict/jieba.dict.utf8"
    HMM_PATH="${CPPJIEBA_DIR}/dict/hmm_model.utf8"
    USER_DICT_PATH="${CPPJIEBA_DIR}/dict/user.dict.utf8"
    IDF_PATH="${CPPJIEBA_DIR}/dict/idf.utf8"
    STOP_WORD_PATH="${CPPJIEBA_DIR}/dict/stop_words.utf8"
)

# 导入sentencepiece
# 设置SentencePiece选项
set(SPM_ENABLE_SHARED OFF CACHE BOOL "Build shared libary")
set(SPM_ENABLE_TCMALLOC OFF CACHE BOOL "Enable TCMalloc if available")
set(SPM_ENABLE_NFKC_NORMALIZATION OFF CACHE BOOL "Enable NFKC normalization")
set(SPM_ENABLE_SAMPLING OFF CACHE BOOL "Enable subword sampling")
set(SPM_USE_BUILTIN_PROTOBUF ON CACHE BOOL "Use built-in protobuf")
set(SPM_USE_EXTERNAL_ABSL OFF CACHE BOOL "Use external abseil")
# 不需要测试和示例程序
set(SPM_BUILD_TEST OFF CACHE BOOL "Build test")
set(SPM_ENABLE_TENSORFLOW_SHARED OFF CACHE BOOL "Link against TensorFlow shared lib")
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/external/sentencepiece/src)
# 添加SentencePiece作为子目录
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/external/sentencepiece EXCLUDE_FROM_ALL)

# 导入ONNXruntime
set(ONNXRUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/external/onnxruntime")
# 添加ONNX Runtime头文件路径
include_directories("${ONNXRUNTIME_DIR}/include")

# 根据平台不同设置 ONNX Runtime 库
add_library(onnxruntime SHARED IMPORTED)
if(APPLE)
    # macOS 平台
    set(ONNXRUNTIME_LIB "${ONNXRUNTIME_DIR}/lib/libonnxruntime.dylib")
    set_target_properties(onnxruntime PROPERTIES
        IMPORTED_LOCATION "${ONNXRUNTIME_LIB}"
    )
else()
    # Windows 平台
    set(ONNXRUNTIME_LIB "${ONNXRUNTIME_DIR}/lib/onnxruntime.lib")
    set(ONNXRUNTIME_DLL "${ONNXRUNTIME_DIR}/lib/onnxruntime.dll")
    set_target_properties(onnxruntime PROPERTIES
        IMPORTED_LOCATION "${ONNXRUNTIME_DLL}"
        IMPORTED_IMPLIB "${ONNXRUNTIME_LIB}"
    )
endif()

# 导入cuDNN
if(USE_CUDA)
    set(CUDNN_DLL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/external/cudnn/bin")
endif()


# -------------设置编译选项--------------
# 添加头文件目录
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# 添加源文件
file(GLOB_RECURSE SOURCES "src/*.cpp")

# 创建可执行文件
add_executable(${PROJECT_NAME} ${SOURCES})

# 链接依赖库 
target_link_libraries(${PROJECT_NAME} PRIVATE
    faiss    
    sqlite3
    onnxruntime
    sentencepiece-static
    CURL::libcurl
    nlohmann_json::nlohmann_json
    cmark::cmark
    xxHash::xxhash
)    

# -------------拷贝动态链接库--------------
if(APPLE)
    # macOS 平台复制动态链接库
    file(GLOB ONNXRUNTIME_DYLIB_FILES "${ONNXRUNTIME_DIR}/lib/*.dylib") # 收集所有 ONNX Runtime dylib 文件
    
    # 为每个找到的dylib文件创建复制命令
    foreach(DYLIB_FILE ${ONNXRUNTIME_DYLIB_FILES})
        # 检查是否是符号链接，如果是则跳过
        if(IS_SYMLINK ${DYLIB_FILE})
            get_filename_component(DYLIB_NAME ${DYLIB_FILE} NAME)
            message(STATUS "Skip: ${DYLIB_NAME}")
            continue()
        endif()
        get_filename_component(DYLIB_NAME ${DYLIB_FILE} NAME)
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${DYLIB_FILE}
                $<TARGET_FILE_DIR:${PROJECT_NAME}>/${DYLIB_NAME}
            COMMENT "Copying ${DYLIB_NAME}"
        )
    endforeach()
else()
    # Windows平台复制动态链接库
    set(VCPKG_DLL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-windows/bin")

    if(USE_CUDA)
        file(GLOB ONNXRUNTIME_DLL_FILES "${ONNXRUNTIME_DIR}/lib/*.dll") # 收集所有 ONNX Runtime DLL 文件
        file(GLOB CUDNN_DLL_FILES "${CUDNN_DLL_DIR}/*.dll") # 收集所有 cuDNN DLL 文件
    else()
        file(GLOB ONNXRUNTIME_DLL_FILES "${ONNXRUNTIME_DIR}/lib/onnxruntime.dll") # 只收集 onnxruntime.dll 文件
    endif()
    
    # 为每个找到的DLL文件创建复制命令
    foreach(DLL_FILE ${ONNXRUNTIME_DLL_FILES} ${CUDNN_DLL_FILES})
        get_filename_component(DLL_NAME ${DLL_FILE} NAME)
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${DLL_FILE}
                $<TARGET_FILE_DIR:${PROJECT_NAME}>/${DLL_NAME}
            COMMENT "Copying ${DLL_NAME}"
        )
    endforeach()
    
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        # 如果是Debug版本，拷贝.pdb文件
        file(GLOB ONNXRUNTIME_PDB_FILES "${ONNXRUNTIME_DIR}/lib/*.pdb")
        foreach(PDB_FILE ${ONNXRUNTIME_PDB_FILES})
            get_filename_component(PDB_NAME ${PDB_FILE} NAME)
            add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy_if_different
                    ${PDB_FILE}
                    $<TARGET_FILE_DIR:${PROJECT_NAME}>/${PDB_NAME}
                COMMENT "Copying ${PDB_NAME}"
            )
        endforeach()
    endif()
endif()