# pragma once
#include "Utils.h"
#include <functional>
#include <string>
#include <vector>

namespace cmark
{
    #include <cmark.h>
}
/*
A chunk generator for one document.
A naive implementation.
If there is no content under a heading, it will be treated as a chunk, and this chunk may be very short.
This is a single-threaded implementation, so it is not thread-safe.
*/
class Chunker 
{
public:
    enum class docType{Markdown, plainText}; // only support markdown for now
    struct Chunk
    {
        std::string content;
        std::string metadata;
        int nestedLevel = 0;
        int beginLine = 0;
        int endLine = 0;
    };

private:
    const docType type;

    int max_length; // max length of each chunk, return chunks might be shorter than this value, calculated by getLength
    int min_length;

    // function to get length of string, used for different encoding or tokenizer
    std::function<int(const std::string&)> getLength = Utils::utf8Length;

    static const int minimumLength = 4; // if the chunk length is less than this value, it will be ignored

    static const double min_chunk_length_ratio; // min chunk length ratio, but there is no guarantee that the chunk length will be greater than this value
    
    struct Flag
    {
        std::string flag;
        bool splitBefore;
    };
    static const std::vector<std::vector<Flag>> split_table; // char table for splitting, only support ch-zh and en now

    cmark::cmark_node* ast = nullptr; // AST root node

    std::vector<int> byteToLine; // byte to line map, used for calculating begin and end line of each chunk
    // calculate line number of pos from beginLine
    int posToLine(int pos, int beginLine, const std::string& content) const;

    // transverse AST to parse nested headings and generate metadata
    void parserHeadings(const std::string& text, std::vector<Chunk>& chunks);

    // recursive function to get content below the node
    static void getNodeContent(cmark::cmark_node *node, std::string &content);

    static const Chunk document; // abstruact chunk for recursive function

    // recursive function to split one chunk into chunks
    void recursiveChunk(const Chunk& chunk, int split_table_index, const std::vector<Chunk>& headingChunks, std::vector<Chunk>& final_chunks);

public:
    Chunker(docType type, int max_length, std::function<int(const std::string&)> getLength = Utils::utf8Length);
    ~Chunker();

    Chunker(const Chunker&) = delete; // disable copy constructor
    Chunker& operator=(const Chunker&) = delete; // disable copy assignment

    Chunker(Chunker&&) = delete; // disable move constructor
    Chunker& operator=(Chunker&&) = delete; // disable move assignment

    std::vector<Chunk> operator()(const std::string &text, std::unordered_map<std::string, std::string> extraMetadata = {});
};