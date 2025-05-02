#include "Chunker.h"

#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

const double Chunker::min_chunk_length_ratio = 0.85;
const std::vector<std::vector<std::string>> Chunker::split_table =
{
    {"\n\n"}, // paragraph
    {"```"}, //code block
    {"---", "___", "****"}, // thematic break
    {"\n+", "\n-", "\n*"}, //list
    {"\n", "\r\n", "\r"}, // line
    {". ", "! ", "? ", "... ", "。", "！", "？", "……"}, // sentence
    {";", "；"}, // semicolon
    {",", "，"}, // comma
    {" "} // space
};
const Chunker::Chunk Chunker::document = {};

Chunker::Chunker(const std::string &text, docType type, int max_length) : in_text(text), in_type(type), max_length(max_length)
{
    if(type == docType::Markdown)
    {
        // build AST
        ast = cmark_parse_document(in_text.c_str(), in_text.length(), CMARK_OPT_DEFAULT);
        if (ast == nullptr)
        {
            throw Exception(Exception::Type::parserError, "failed to parse markdown document");
        }
    }

    // traverse AST to generate temp chunk vector
    genBasicChunks();
}

Chunker::~Chunker()
{
    if(ast != nullptr)
    {
        cmark_node_free(ast);
    }
}

void Chunker::genBasicChunks()
{
    if(ast == nullptr) // doc is plain text
    {
        Chunk chunk;
        chunk.content = in_text;
        chunk.metadata = "plainText";
        basic_chunks.push_back(chunk);
        return;
    }

    auto node = cmark_node_first_child(ast);
    while(node != nullptr)
    {
        auto type = cmark_node_get_type(node);

        if (type == CMARK_NODE_HEADING) // if node is a heading node, push to stack
        {
            // get heading level
            int level = cmark_node_get_heading_level(node) - 1; // range from 0 to 5
            
            // get title
            std::string title;
            getContent(node, title);

            // push to stack
            while(headingStack.size() > level)
            {
                headingStack.pop_back();
            }
            headingStack.push_back(title);

            // if no blocks under this heading, add title as a chunk
            auto next = cmark_node_next(node);
            if(next == nullptr || cmark_node_get_type(next) == CMARK_NODE_HEADING || cmark_node_get_type(next) == CMARK_NODE_THEMATIC_BREAK)
            {
                // generate metadata
                std::string metadata;
                for(auto it = headingStack.begin(); it != headingStack.end(); ++it)
                {
                    metadata += *it + ">";
                }
                if(!metadata.empty())
                    metadata.pop_back(); // remove last '>'

                // add chunk
                basic_chunks.push_back({title, metadata});
            }
        }
        else
        {
            // get content
            std::string content;
            getContent(node, content);

            // generate metadata
            std::string metadata;
            for(auto it = headingStack.begin(); it != headingStack.end(); ++it)
            {
                metadata += *it + ">";
            }
            if(!metadata.empty())
                metadata.pop_back(); // remove last '>'
            
            basic_chunks.push_back({content, metadata});
        }

        node = cmark_node_next(node);
    }
    
}

void Chunker::getContent(cmark_node *node, std::string& content)
{
    if(node == nullptr)
        return;
    
    content = cmark_render_commonmark(node, CMARK_OPT_DEFAULT, 0);
}

std::string Chunker::getNodeContent(cmark_node *node)
{
    if (node == nullptr)
        return "";

    char *markdown = cmark_render_commonmark(node, CMARK_OPT_DEFAULT, 0);
    if (markdown == nullptr)
        return "";
    std::string result(markdown);

    return result;
}

void Chunker::splitChunk(const Chunk& chunk, int split_table_index)
{
    auto min_length = static_cast<int>(max_length * min_chunk_length_ratio);

    // check if split table has been used up
    if(split_table_index != -1 && split_table_index >= split_table.size())
    {
        // no more split table, just split directly
        auto length = chunk.content.length();
        auto sub_chunk1 = chunk.content.substr(0, length / 2);
        auto sub_chunk2 = chunk.content.substr(length / 2);
        final_chunks.push_back({sub_chunk1, chunk.metadata});
        final_chunks.push_back({sub_chunk2, chunk.metadata});
        return;
    }

    // 1. generate sub_chunks
    std::vector<Chunk> sub_chunks;
    if(split_table_index == -1) // split document
    {
        sub_chunks = basic_chunks;
    }
    else
    {
        // find split pos in content
        std::vector<size_t> split_pos;
        split_pos.push_back(0); // add first pos
        for(auto& flag : split_table[split_table_index])
        {
            size_t pos = 0;
            pos = chunk.content.find(flag, pos);
            while(pos != std::string::npos)
            {
                split_pos.push_back(pos);
                pos += flag.length();
                pos = chunk.content.find(flag, pos);
            }
        }
        split_pos.push_back(chunk.content.length()); // add last pos
        std::sort(split_pos.begin(), split_pos.end());
        split_pos.erase(std::unique(split_pos.begin(), split_pos.end()), split_pos.end()); // remove duplicate pos

        // split content by split pos
        for(auto i = split_pos.begin(); i != split_pos.end() - 1; i++)
        {
            auto sub_chunk = chunk.content.substr(*i, *(i + 1) - *i);
            sub_chunks.push_back({sub_chunk, chunk.metadata});
        }

        // if no split pos found, just add the chunk to sub_chunks
        if (sub_chunks.empty())
        {
            sub_chunks.push_back(chunk);
        }
    }

    // 2. try to split chunk or append chunk in result
    for(auto i = sub_chunks.begin(); i != sub_chunks.end(); i++)
    {
        auto sub_chunk = *i;
        // suitable length, add to result
        if (sub_chunk.content.length() < max_length && sub_chunk.content.length() >= min_length) 
        {
            final_chunks.push_back(sub_chunk);
            continue;
        }
        // too long, split again
        if(sub_chunk.content.length() > max_length) 
        {
            splitChunk(sub_chunk, split_table_index + 1);
            continue;
        }

        // too short, try to append next chunk
        auto next_pos = i + 1;
        while(next_pos != sub_chunks.end() && i->metadata == next_pos->metadata) // only append chunk with same metadata(under same heading)
        {
            if(sub_chunk.content.length() + next_pos->content.length() < max_length)
            {
                sub_chunk.content += next_pos->content;
                next_pos++;
            }
            else
            {
                break;
            }
        }
        final_chunks.push_back(sub_chunk);
        i = next_pos - 1; 
    }
}

std::vector<Chunker::Chunk> Chunker::getChunks()
{
    // generate chunks
    splitChunk(document, -1);

    // return final chunks
    return final_chunks;
}