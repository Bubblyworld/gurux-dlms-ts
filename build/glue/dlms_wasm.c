#include "dlms_wasm.h"

static char last_error[512] = "";

const char* dlms_last_error(void) {
    return last_error;
}
