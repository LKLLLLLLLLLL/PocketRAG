#pragma once
#include <iostream>
#include <filesystem>
#include <fstream>
#include <string>
#include <codecvt>
#include <regex>

#include <xxhash.h>

/*
This file contains utility functions for the project.
*/
namespace Utils
{
    // calculate the hash using XXHash algorithm
    std::string calculatedocHash(const std::filesystem::path &path);
    // calculate the hash of a string using XXHash algorithm
    std::string calculateHash(const std::string &content);

    // Convert wstring to string
    std::string wstring_to_string(const std::wstring &wstr);
    // Convert string to wstring
    std::wstring string_to_wstring(const std::string &str);

    // helper function to normalize line endings
    std::string normalizeLineEndings(const std::string &input);

    // set console to UTF-8 to avoid garbled characters
    void setup_utf8_console();
}