# Builds Luau's Analysis library and the checker wrapper (checker.cpp) to WebAssembly with Emscripten.
# Configure through scripts/build-wasm.ts, which passes the pinned Luau source as LUAU_SOURCE_DIR.
cmake_minimum_required(VERSION 3.20)
project(luau_web_checker LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure with Emscripten (`bun run build:wasm`), not a native compiler")
endif()

set(LUAU_SOURCE_DIR "" CACHE PATH "The Luau source tree (mise's http:luau-source)")
if(NOT EXISTS "${LUAU_SOURCE_DIR}/Analysis")
  message(FATAL_ERROR "LUAU_SOURCE_DIR does not point at a Luau source tree: '${LUAU_SOURCE_DIR}'")
endif()

# Luau reports internal errors and time limits with C++ exceptions; every object must use the same model.
add_compile_options(-fwasm-exceptions)

set(LUAU_BUILD_CLI OFF CACHE BOOL "" FORCE)
set(LUAU_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LUAU_BUILD_WEB OFF CACHE BOOL "" FORCE)
add_subdirectory(${LUAU_SOURCE_DIR} luau EXCLUDE_FROM_ALL)

add_executable(luau-checker checker.cpp)
target_compile_features(luau-checker PRIVATE cxx_std_17)
target_link_libraries(luau-checker PRIVATE Luau.Analysis)
target_link_options(luau-checker PRIVATE
  -fwasm-exceptions
  -lembind
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createLuauChecker
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=64MB
  -sSTACK_SIZE=8MB
  -sFILESYSTEM=0
)
set_target_properties(luau-checker PROPERTIES SUFFIX ".mjs")
