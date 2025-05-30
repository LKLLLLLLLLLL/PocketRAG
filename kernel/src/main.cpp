#include "Utils.h"
#include "KernelServer.h"
#include <cstdlib>
#include <iostream>

std::filesystem::path dataPath = std::filesystem::path (".") / "userData";
// std::filesystem::path dataPath = std::filesystem::path(std::getenv("POCKETRAG_USERDATA_PATH"));
Logger logger(dataPath / "logs", false, Logger::Level::DEBUG, 20);

void crash_handler();
void server_terminate_handler();

int main(int argc, char *argv[])
{
    std::set_terminate(server_terminate_handler);
    Utils::setThreadName("MainThread");
    Utils::setup_utf8_console();
    {
        auto server = KernelServer(dataPath);
        try
        {
            server.run();
        }
        catch(...)
        {
            crash_handler();
            return EXIT_FAILURE;
        }
    }
    logger.info("KernelServer stopped.");
    return 0;
}

void crash_handler()
{
    try
    {
        auto error_ptr = std::current_exception();
        std::string error_message = "Unknown error";
        if (error_ptr)
        {
            try
            {
                std::rethrow_exception(error_ptr);
            }
            catch (const std::exception &e)
            {
                error_message = e.what();
                logger.fatal("KernelServer crashed with exception: " + error_message);
            }
            catch (...)
            {
                logger.fatal("KernelServer crashed with unknown type exception.");
            }
        }
        else
        {
            logger.fatal("KernelServer crashed with unknown exception.");
        }

        // send crash message to frontend
        nlohmann::json errorJson;
        errorJson["sessionId"] = -1;
        errorJson["toMain"] = true;
        errorJson["callbackId"] = 0;
        errorJson["isReply"] = false;
        errorJson["message"]["type"] = "kernelServerCrashed";
        errorJson["message"]["error"] = error_message;
        std::cout << errorJson.dump() << std::endl << std::flush;
    }
    catch (...)
    {
        std::cerr << "KernelServer crashed, Failed to log exception. " << std::endl;
    }
}

void server_terminate_handler()
{
    crash_handler();
    std::exit(EXIT_FAILURE);
}
