# Pinokio - After Effects plugin build.
#
#   cmake -S . -B build -G "Visual Studio 17 2022" -A x64 ^
#         -DAE_SDK_PATH="C:/AE_SDK/After Effects 2026 SDK"
#   cmake --build build --config Release
#
# The result is build/Release/Pinokio.aex. See README.md.

cmake_minimum_required(VERSION 3.20)
project(Pinokio CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(AE_SDK_PATH "" CACHE PATH "Root of the After Effects SDK (the folder holding Headers/)")
if(NOT AE_SDK_PATH OR NOT EXISTS "${AE_SDK_PATH}/Headers/AE_Effect.h")
    message(FATAL_ERROR
        "AE_SDK_PATH must point at the After Effects SDK folder that contains "
        "Headers/AE_Effect.h. Pass it with -DAE_SDK_PATH=...")
endif()

set(AE_HEADERS
    "${AE_SDK_PATH}/Headers"
    "${AE_SDK_PATH}/Headers/SP"
    "${AE_SDK_PATH}/Util"
    "${AE_SDK_PATH}/Resources")

set(PINOKIO_SOURCES
    src/Pinokio.cpp
    src/Pinokio.h
    src/PinokioWarp.h
    src/PinokioSample.h
    src/PinokioAnalyze.h
    "${AE_SDK_PATH}/Util/AEGP_SuiteHandler.cpp")

add_library(Pinokio MODULE ${PINOKIO_SOURCES})
target_include_directories(Pinokio PRIVATE ${AE_HEADERS} src)

if(WIN32)
    # ---- PiPL -------------------------------------------------------------
    # The resource is written as a .r file, run through the preprocessor, then
    # through the SDK's PiPLtool, and only then compiled as a Windows resource.
    find_program(PIPL_TOOL PiPLtool
        HINTS "${AE_SDK_PATH}/Examples/Resources" "${AE_SDK_PATH}/Resources"
        DOC "PiPLtool.exe from the After Effects SDK")
    if(NOT PIPL_TOOL)
        message(FATAL_ERROR "PiPLtool.exe not found. Set -DPIPL_TOOL=<path to PiPLtool.exe>.")
    endif()

    set(PIPL_SRC  "${CMAKE_CURRENT_SOURCE_DIR}/src/PinokioPiPL.r")
    set(PIPL_RR   "${CMAKE_CURRENT_BINARY_DIR}/PinokioPiPL.rr")
    set(PIPL_RRC  "${CMAKE_CURRENT_BINARY_DIR}/PinokioPiPL.rrc")
    set(PIPL_RC   "${CMAKE_CURRENT_BINARY_DIR}/PinokioPiPL.rc")


    add_custom_command(
        OUTPUT  "${PIPL_RC}"
        COMMAND cl /nologo /D "MSWindows" /D "AE_OS_WIN" /EP
                /I "${AE_SDK_PATH}/Headers"
                /I "${AE_SDK_PATH}/Resources"
                "${PIPL_SRC}" > "${PIPL_RR}"
        COMMAND "${PIPL_TOOL}" "${PIPL_RR}" "${PIPL_RRC}"
        COMMAND ${CMAKE_COMMAND} -E copy "${PIPL_RRC}" "${PIPL_RC}"
        DEPENDS "${PIPL_SRC}"
        COMMENT "Building the PiPL resource"
        VERBATIM)

    target_sources(Pinokio PRIVATE "${PIPL_RC}")
    set_source_files_properties("${PIPL_RC}" PROPERTIES LANGUAGE RC)

    set_target_properties(Pinokio PROPERTIES
        SUFFIX ".aex"
        PREFIX "")
    target_link_options(Pinokio PRIVATE "/DEF:${CMAKE_CURRENT_SOURCE_DIR}/win/Pinokio.def")
    target_compile_definitions(Pinokio PRIVATE MSWindows _WINDOWS WIN32 NOMINMAX)

elseif(APPLE)
    set_target_properties(Pinokio PROPERTIES
        BUNDLE TRUE
        BUNDLE_EXTENSION "plugin"
        MACOSX_BUNDLE_BUNDLE_NAME "Pinokio")
    target_compile_definitions(Pinokio PRIVATE MAC_ENV)
endif()
