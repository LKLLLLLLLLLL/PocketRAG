#include "Chunker.h"

#include <string>
#include <vector>
#include <algorithm>

const double Chunker::min_chunk_length_ratio = 0.85;
const std::vector<std::vector<Chunker::Flag>> Chunker::split_table =
{
    {{"\n\n", false}}, // paragraph
    {{"```", false}}, //code block
    {{"---", true}, {"___", true}, {"****", true}}, // thematic break
    {{"\n+", true}, {"\n-", true}, {"\n*", true}}, //list
    {{"\n\"", true}, {"\"\n", false}, {"\n“", true}, {"    “", true}, {"”\n", false}}, // quote
    {{"\n", false}}, // line
    {{". ", false}, {"! ", false}, {"? ", false}, {"... ", false}, {"。", false}, {"！", false}, {"？", false}, {"……", false}}, // sentence
    {{";", false}, {"；", false}}, // semicolon
    {{",", false}, {"，", false}}, // comma
    {{"、", false}, {"：", false}, {": ", false}, {"“", true}, {"”", false}, {"《", true}, {"》", false}, {"——", true}, {"(", true}, {")", false}, {"（", true}, {"）", false}}, // in sentense separator
    {{" ", false}}, // space
    {{":", false}, {"-", true}, {"/", true}, {"\\", true}, {".", false}} // inword separator
};
const Chunker::Chunk Chunker::document = {};

Chunker::Chunker(docType type, int max_length, std::function<int(const std::string&)> getLength) : getLength(getLength), type(type), max_length(max_length)
{
    min_length = static_cast<int>(max_length * min_chunk_length_ratio);
}

Chunker::~Chunker()
{
    if (ast != nullptr)
    {
        cmark_node_free(ast);
    }
}

int Chunker::posToLine(int pos, int beginLine, const std::string &content) const
{
    pos = std::min(pos, static_cast<int>(content.length()));
    beginLine += std::count_if(content.begin(), content.begin() + pos, [](char c) {
        return c == '\n'; 
    });
    return beginLine;
}

auto Chunker::operator()(const std::string &in_text, std::unordered_map<std::string, std::string> extraMetadata) -> std::vector<Chunk>
{
    auto text = Utils::normalizeLineEndings(in_text); // normalize line endings
    if(ast)
    {
        cmark_node_free(ast);
        ast = nullptr;
    }

    if (type == docType::Markdown)
    {
        // build AST
        ast = cmark::cmark_parse_document(text.c_str(), text.length(), CMARK_OPT_DEFAULT | CMARK_OPT_HARDBREAKS);
        if (ast == nullptr)
        {
            throw Error{"Failed to parse markdown document", Error::Type::Input};
        }
    }

    // calculate begin bytes for each line
    byteToLine.clear();
    byteToLine.push_back(0);
    auto it = std::find(text.begin(), text.end(), '\n');
    while(it != text.end())
    {
        byteToLine.push_back(it - text.begin() + 1);
        it = std::find(it + 1, text.end(), '\n');
    }
    if (byteToLine.back() != text.length())
    {
        byteToLine.push_back(text.length());
    }

    // traverse AST to generate temp chunk vector
    std::vector<Chunk> headingChunks;
    parserHeadings(text, headingChunks);

    std::vector<Chunk> chunks;
    recursiveChunk(document, -1, headingChunks, chunks);

    // add extra metadata
    std::string extraMetadataStr = "";
    for (auto &[key, value] : extraMetadata)
    {
        extraMetadataStr += " <" + key + "> " + value + "\n";
    }
    for(auto& chunk : chunks)
    {
        auto path = chunk.metadata;
        chunk.metadata = extraMetadataStr + " <Path> " + path;
    }

    return chunks;
}

void Chunker::parserHeadings(const std::string &text, std::vector<Chunk> &chunks)
{
    if(ast == nullptr) // doc is plain text
    {
        Chunk chunk;
        chunk.content = text;
        chunk.metadata = "plainText";
        chunk.nestedLevel = 0;
        chunk.beginLine = 0;
        chunk.endLine = byteToLine.size();
        chunks.push_back(chunk);
        return;
    }

    std::vector<std::string> headingStack; // stack for heading
    auto node = cmark_node_first_child(ast);
    while(node != nullptr)
    {
        auto type = cmark::cmark_node_get_type(node);

        if (type == cmark::CMARK_NODE_HEADING) // if node is a heading node, push to stack
        {
            // get heading level
            int level = cmark_node_get_heading_level(node) - 1; // range from 0 to 5
            
            // get title
            std::string title;
            getNodeContent(node, title);

            // push to stack
            while(headingStack.size() > level)
            {
                headingStack.pop_back();
            }
            while(headingStack.size() < level)
            {
                headingStack.push_back("");
            }
            headingStack.push_back(title);

            // if no blocks under this heading, add title as a chunk
            auto next = cmark::cmark_node_next(node);
            if (next == nullptr || cmark::cmark_node_get_type(next) == cmark::CMARK_NODE_HEADING || cmark::cmark_node_get_type(next) == cmark::CMARK_NODE_THEMATIC_BREAK)
            {
                // generate metadata
                std::string metadata;
                for (auto i = 0; i < headingStack.size(); i++)
                {
                    auto heading = headingStack[i];
                    if (heading == "")
                        continue;
                    if (heading.back() == '\n')
                        heading.pop_back();
                    metadata += heading + ">";
                }
                if(!metadata.empty())
                    metadata.pop_back(); // remove last '>'

                // add chunk
                Chunk chunk;
                chunk.content = title;
                chunk.metadata = metadata;
                chunk.nestedLevel = headingStack.size();
                chunk.beginLine = cmark_node_get_start_line(node) - 1;
                chunk.endLine = cmark_node_get_end_line(node);
                chunks.push_back(chunk);
            }
        }
        else
        {
            // get content
            std::string content;
            getNodeContent(node, content);

            // generate metadata
            std::string metadata;
            for(auto i = 0; i < headingStack.size(); i++)
            {
                auto heading = headingStack[i];
                if(heading == "")
                    continue;
                if(heading.back() == '\n')
                    heading.pop_back();
                metadata += heading + ">";
            }
            if(!metadata.empty())
                metadata.pop_back(); // remove last '>'

            // add chunk
            Chunk chunk;
            chunk.content = content;
            chunk.metadata = metadata;
            chunk.nestedLevel = headingStack.size();
            chunk.beginLine = cmark_node_get_start_line(node) - 1;
            chunk.endLine = cmark_node_get_end_line(node);
            chunks.push_back(chunk);
        }

        node = cmark::cmark_node_next(node);
    }
}

void Chunker::getNodeContent(cmark::cmark_node *node, std::string &content)
{
    if(node == nullptr)
        return;
    content = cmark::cmark_render_commonmark(node, CMARK_OPT_DEFAULT, 0);
}

void Chunker::recursiveChunk(const Chunk &chunk, int split_table_index, const std::vector<Chunk>& headingChunks, std::vector<Chunk> &final_chunks)
{
    auto beginLine = chunk.beginLine;
    auto nestedLevel = chunk.nestedLevel;
    
    // check if split table has been used up
    if(split_table_index != -1 && split_table_index >= split_table.size())
    {
        // no more split table, just split directly
        auto length = getLength(chunk.content);
        auto splitNumber = static_cast<int>(length / max_length);
        auto chunkBytes = static_cast<int>(chunk.content.length() / splitNumber);
        auto lastBeginLine = chunk.beginLine;
        for(auto i = 0; i < splitNumber; i++)
        {
            auto start = chunkBytes * i;
            auto end = chunkBytes * (i + 1);
            // avoid split in the middle of a utf-8 character
            while (end < chunk.content.length() && (chunk.content[end] & 0xC0) == 0x80)
            {
                end++;
            }
            auto sub_chunk = chunk.content.substr(start, end - start);
            auto sub_chunk_line = posToLine(end, lastBeginLine, chunk.content);
            final_chunks.push_back({sub_chunk, chunk.metadata, nestedLevel + 1, lastBeginLine, sub_chunk_line});
            lastBeginLine = sub_chunk_line;
        }
        return;
    }

    // 1. generate sub_chunks
    std::vector<Chunk> sub_chunks;
    if(split_table_index == -1) // split document
    {
        sub_chunks = headingChunks;
    }
    else
    {
        // find split pos in content
        std::vector<size_t> split_pos;
        split_pos.push_back(0); // add first pos
        for(auto& flag : split_table[split_table_index])
        {
            size_t pos = 0;
            pos = chunk.content.find(flag.flag, pos);
            while(pos != std::string::npos)
            {
                auto actual_split_pos = pos;
                if(!flag.splitBefore)
                {
                    actual_split_pos += flag.flag.length();
                }
                split_pos.push_back(actual_split_pos); // add split pos
                pos += flag.flag.length();
                pos = chunk.content.find(flag.flag, pos);
            }
        }
        split_pos.push_back(chunk.content.length()); // add last pos
        std::sort(split_pos.begin(), split_pos.end());
        split_pos.erase(std::unique(split_pos.begin(), split_pos.end()), split_pos.end()); // remove duplicate pos
        std::vector<int> splitLine;
        splitLine.push_back(beginLine);
        for(auto i = split_pos.begin(); i != split_pos.end(); i++)
        {
            auto line = posToLine(*i, beginLine, chunk.content);
            splitLine.push_back(line);
        }
        splitLine.push_back(chunk.endLine); // add last line

        // split content by split pos
        for(auto i = 0; i < split_pos.size() - 1; i++)
        {
            auto start = split_pos[i];
            auto end = split_pos[i + 1];
            auto sub_chunk = chunk.content.substr(start, end - start);
            sub_chunks.push_back({sub_chunk, chunk.metadata, nestedLevel + 1, splitLine[i], splitLine[i + 1]});
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
        if (getLength(sub_chunk.content) < max_length && getLength(sub_chunk.content) >= min_length) 
        {
            final_chunks.push_back(sub_chunk);
            continue;
        }
        // too long, split again
        if(getLength(sub_chunk.content) > max_length) 
        {
            recursiveChunk(sub_chunk, split_table_index + 1, headingChunks, final_chunks);
            continue;
        }

        // too short, try to append next chunk
        auto next_pos = i + 1;
        while(next_pos != sub_chunks.end() && i->nestedLevel == next_pos->nestedLevel) // only append chunk with same metadata(under same heading)
        {
            if(getLength(sub_chunk.content) + getLength(next_pos->content) >= max_length)
                break;

            sub_chunk.content += next_pos->content;
            // generate publie metadata
            auto seperatorPos = 0;
            for (auto index = 0; index < i->metadata.size(); index++)
            {
                if (i->metadata[index] != next_pos->metadata[index])
                {
                    i->metadata = i->metadata.substr(0, seperatorPos);
                    break;
                }
                seperatorPos = index - 1;
            }
            next_pos++;
        }

        // if the chunk is too short, ignore it
        if(getLength(sub_chunk.content) < minimumLength)
        {
            continue;
        }
        final_chunks.push_back(sub_chunk);
        i = next_pos - 1; 
    }
}
