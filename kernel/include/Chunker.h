#include <string>
#include <vector>
#include <iostream>
#include <exception>

#include <cmark.h>

/*
A chunk generator for one document.
A naive implementation.
If there is no content under a heading, it will be treated as a chunk, and this chunk may be very short.
*/
class Chunker 
{
public:
    enum class docType{Markdown, plainText}; // only support markdown for now
    struct Chunk
    {
        std::string content;
        std::string metadata;
    };

    struct Exception : public std::exception
    {
        enum class Type{parserError, unknownError};
        Type type;
        std::string msg;

        Exception(Type type, const std::string& msg): type(type), msg(msg) {}
        const char* what() const noexcept override { return msg.c_str(); }
    };

private:
    const std::string& in_text;
    const docType in_type;

    int max_length; // max bytes length of each chunk, return chunks might be shorter than this value, UTF-8 char may be longer than 1 bytes

    static const double min_chunk_length_ratio; // min chunk length ratio, but there is no guarantee that the chunk length will be greater than this value
    static const std::vector<std::vector<std::string>> split_table; // char table for splitting, only support ch-zh and en now

    cmark_node* ast = nullptr; // AST root node

    std::vector<Chunk> basic_chunks; //Vector containing chunks after basic chunking 
    std::vector<Chunk> final_chunks; //Vector containing chunks after final chunking
    std::vector<std::string> headingStack; // stack for generating chunk metadata

    // transverse AST to generate basic chunk vector
    void genBasicChunks(); 

    // recursive function to get content below the node
    static void getContent(cmark_node *node, std::string& content);

    // helper function to get content from node
    static std::string getNodeContent(cmark_node *node);

    static const Chunk document; // abstruact chunk for recursive function

    // recursive function to split one chunk into chunks
    void splitChunk(const Chunk& chunk, int split_table_index);

public:
    Chunker(const std::string &text, docType type, int max_length);
    ~Chunker();

    Chunker(const Chunker&) = delete; // disable copy constructor
    Chunker& operator=(const Chunker&) = delete; // disable copy assignment

    // get chunks
    std::vector<Chunk> getChunks();

    // for debugging
    void printNodeInfos() const
    {
        for (const auto& chunk : basic_chunks)
        {
            std::cout << "Content: " << chunk.content << std::endl;
            std::cout << "Metadata: " << chunk.metadata << std::endl;
            std::cout << "----------------------------------------" << std::endl;
        }
    }
};