#!/usr/bin/env bash
set -euo pipefail

check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed or not in PATH"
        echo "$2"
        exit 1
    fi
}

check_dependency "emcc" "Install Emscripten: https://emscripten.org/docs/getting_started/downloads.html"
check_dependency "git" "Install git: https://git-scm.com/downloads"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR=$(mktemp -d)

cleanup() {
    echo "Cleaning up temporary directory..."
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Working in temporary directory: $TEMP_DIR"

GURUX_COMMIT="a6947373b6f1ad333cb4c000179439de2ee2d4e8"
echo "Cloning GuruxDLMS.c at ${GURUX_COMMIT}..."
git clone https://github.com/Gurux/GuruxDLMS.c.git "$TEMP_DIR/gurux"
cd "$TEMP_DIR/gurux"
git checkout "$GURUX_COMMIT"

if [ -d "$SCRIPT_DIR/patches" ] && [ "$(ls -A "$SCRIPT_DIR/patches"/*.patch 2>/dev/null)" ]; then
    echo "Applying patches..."
    for patch in "$SCRIPT_DIR/patches"/*.patch; do
        git apply "$patch"
    done
fi

GURUX_SRC="$TEMP_DIR/gurux/development/src"
GURUX_INC="$TEMP_DIR/gurux/development/include"
GLUE_DIR="$SCRIPT_DIR/glue"

SOURCES=$(find "$GURUX_SRC" -name '*.c' ! -name 'gxsetignoremalloc.c' | sort)

echo "Compiling $(echo "$SOURCES" | wc -l | tr -d ' ') gurux source files + glue..."

OBJ_DIR="$TEMP_DIR/obj"
mkdir -p "$OBJ_DIR"
for src in $SOURCES; do
    name=$(basename "$src" .c)
    emcc -c -O2 -std=c99 \
        -I"$GURUX_INC" \
        -DDLMS_IGNORE_NOTIFY \
        "$src" -o "$OBJ_DIR/$name.o" &
done

emcc -c -O2 -std=c99 \
    -I"$GURUX_INC" \
    "$GLUE_DIR/dlms_wasm.c" -o "$OBJ_DIR/dlms_wasm.o" &

wait

echo "Linking WASM module..."

EXPORTED_FUNCTIONS="_dlms_last_error,_malloc,_free,\
_dlms_client_create,_dlms_client_destroy,\
_dlms_client_set_int,_dlms_client_set_str,_dlms_client_get_int,\
_dlms_client_snrm_request,_dlms_client_parse_ua,\
_dlms_client_aarq_request,_dlms_client_parse_aare,\
_dlms_client_get_application_association_request,\
_dlms_client_parse_application_association_response,\
_dlms_client_parse_ua_from_reply,\
_dlms_client_parse_aare_from_reply,\
_dlms_client_parse_application_association_response_from_reply,\
_dlms_client_release_request,_dlms_client_disconnect_request,\
_dlms_client_get_data,_dlms_client_receiver_ready,\
_dlms_object_create,_dlms_object_destroy,\
_dlms_client_read,_dlms_client_write,_dlms_client_method,\
_dlms_client_update_value,\
_dlms_object_get_int,_dlms_object_get_double,_dlms_object_get_str,_dlms_object_get_bytes,\
_dlms_object_set_int,_dlms_object_set_double,_dlms_object_set_str,_dlms_object_set_bytes,\
_dlms_client_read_by_range,\
_dlms_pg_row_count,_dlms_pg_column_count,_dlms_pg_capture_object,\
_dlms_pg_cell_type,_dlms_pg_cell_double,_dlms_pg_cell_string,\
_dlms_client_get_objects_request,_dlms_client_parse_objects,\
_dlms_client_get_parsed_object_count,_dlms_client_get_parsed_object,\
_dlms_server_create,_dlms_server_destroy,\
_dlms_server_add_object,_dlms_server_initialize,_dlms_server_handle_request"

EXPORTED_RUNTIME_METHODS="ccall,cwrap,getValue,setValue,UTF8ToString,stringToUTF8,HEAP8,HEAPU8,HEAP32"

emcc $OBJ_DIR/*.o \
    -O2 \
    -sEXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
    -sEXPORTED_RUNTIME_METHODS="${EXPORTED_RUNTIME_METHODS}" \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createGuruxModule \
    -sEXPORT_ES6=1 \
    -sENVIRONMENT=web,node \
    -sALLOW_MEMORY_GROWTH=1 \
    -sSTACK_SIZE=8388608 \
    -sINVOKE_RUN=0 \
    -sDISABLE_EXCEPTION_CATCHING=1 \
    -o "$TEMP_DIR/gurux.js"

echo "Copying output..."
cp "$TEMP_DIR/gurux.js" "$SCRIPT_DIR/"
cp "$TEMP_DIR/gurux.wasm" "$SCRIPT_DIR/"

echo ""
echo "Build complete!"
echo "  $SCRIPT_DIR/gurux.js"
echo "  $SCRIPT_DIR/gurux.wasm"
