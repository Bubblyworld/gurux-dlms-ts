#include "dlms_wasm.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <time.h>

#include "client.h"
#include "server.h"
#include "dlmssettings.h"
#include "cosem.h"
#include "gxobjects.h"
#include "bytebuffer.h"
#include "replydata.h"
#include "variant.h"
#include "message.h"
#include "objectarray.h"
#include "helpers.h"
#include "date.h"

/* Gurux declares time_elapsed as extern for platform-specific implementation. */
uint32_t time_elapsed(void) {
    return 0;
}

#define MAX_CLIENTS  32
#define MAX_SERVERS  32
#define MAX_OBJECTS  256

typedef struct {
    dlmsSettings settings;
    gxReplyData* reply;
    int parsedObjectsValid;
    int outBufSize;
} ClientSlot;

typedef struct {
    dlmsServerSettings settings;
    unsigned char frameBuffer[512];
    unsigned char pduBuffer[2048];
    gxAssociationLogicalName assocLN;
} ServerSlot;

static ClientSlot* clients[MAX_CLIENTS];
static ServerSlot* servers[MAX_SERVERS];
static gxObject*   objects[MAX_OBJECTS];

static char last_error[512];
static char str_buf[256];

static void set_error(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(last_error, sizeof(last_error), fmt, ap);
    va_end(ap);
}

static int write_messages_to_buf(message* msgs, uint8_t* out, int* out_len) {
    int capacity = *out_len;
    int offset = 0;
    for (int i = 0; i < msgs->size; i++) {
        gxByteBuffer* bb = msgs->data[i];
        uint32_t frame_len = bb->size - bb->position;
        if (offset + 4 + (int)frame_len > capacity) {
            set_error("output buffer too small: need %d, have %d",
                      offset + 4 + (int)frame_len, capacity);
            return -1;
        }
        out[offset]     = (uint8_t)(frame_len >> 24);
        out[offset + 1] = (uint8_t)(frame_len >> 16);
        out[offset + 2] = (uint8_t)(frame_len >> 8);
        out[offset + 3] = (uint8_t)(frame_len);
        memcpy(out + offset + 4, bb->data + bb->position, frame_len);
        offset += 4 + (int)frame_len;
    }
    *out_len = offset;
    return 0;
}

const char* dlms_last_error(void) {
    return last_error;
}

int dlms_client_create(int client_addr, int server_addr,
                       const char* password, int interface_type) {
    int handle = -1;
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (!clients[i]) { handle = i; break; }
    }
    if (handle < 0) {
        set_error("no free client slots");
        return -1;
    }

    ClientSlot* slot = (ClientSlot*)calloc(1, sizeof(ClientSlot));
    if (!slot) {
        set_error("malloc failed for client slot");
        return -1;
    }

    cl_init(&slot->settings,
            1,
            (uint16_t)client_addr,
            (uint32_t)server_addr,
            DLMS_AUTHENTICATION_LOW,
            password ? password : "",
            (DLMS_INTERFACE_TYPE)interface_type);

    slot->settings.proposedConformance = (DLMS_CONFORMANCE)(
        DLMS_CONFORMANCE_GENERAL_PROTECTION |
        DLMS_CONFORMANCE_GENERAL_BLOCK_TRANSFER |
        DLMS_CONFORMANCE_READ |
        DLMS_CONFORMANCE_WRITE |
        DLMS_CONFORMANCE_UN_CONFIRMED_WRITE |
        DLMS_CONFORMANCE_ATTRIBUTE_0_SUPPORTED_WITH_SET |
        DLMS_CONFORMANCE_PRIORITY_MGMT_SUPPORTED |
        DLMS_CONFORMANCE_ATTRIBUTE_0_SUPPORTED_WITH_GET |
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_GET_OR_READ |
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_SET_OR_WRITE |
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_ACTION |
        DLMS_CONFORMANCE_MULTIPLE_REFERENCES |
        DLMS_CONFORMANCE_INFORMATION_REPORT |
        DLMS_CONFORMANCE_DATA_NOTIFICATION |
        DLMS_CONFORMANCE_ACCESS |
        DLMS_CONFORMANCE_PARAMETERIZED_ACCESS |
        DLMS_CONFORMANCE_GET |
        DLMS_CONFORMANCE_SET |
        DLMS_CONFORMANCE_SELECTIVE_ACCESS |
        DLMS_CONFORMANCE_EVENT_NOTIFICATION |
        DLMS_CONFORMANCE_ACTION
    );

    slot->settings.maxInfoTX = 512;
    slot->settings.maxInfoRX = 512;
    slot->settings.windowSizeTX = 1;
    slot->settings.windowSizeRX = 1;

    slot->reply = NULL;
    slot->parsedObjectsValid = 0;
    slot->outBufSize = 8192;

    clients[handle] = slot;
    return handle;
}

void dlms_client_destroy(int handle) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) return;
    ClientSlot* slot = clients[handle];
    cl_clear(&slot->settings);
    if (slot->reply) {
        reply_clear(slot->reply);
        free(slot->reply);
    }
    free(slot);
    clients[handle] = NULL;
}

void dlms_client_set_int(int handle, const char* setting, int value) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle] || !setting) return;
    dlmsSettings* s = &clients[handle]->settings;
    if (strcmp(setting, "maxInfoTX") == 0)             s->maxInfoTX = (uint16_t)value;
    else if (strcmp(setting, "maxInfoRX") == 0)        s->maxInfoRX = (uint16_t)value;
    else if (strcmp(setting, "windowSizeTX") == 0)     s->windowSizeTX = (unsigned char)value;
    else if (strcmp(setting, "windowSizeRX") == 0)     s->windowSizeRX = (unsigned char)value;
    else if (strcmp(setting, "proposedConformance") == 0) s->proposedConformance = (DLMS_CONFORMANCE)value;
    else if (strcmp(setting, "clientAddress") == 0)    s->clientAddress = (uint16_t)value;
    else if (strcmp(setting, "serverAddress") == 0)    s->serverAddress = (uint32_t)value;
    else if (strcmp(setting, "authentication") == 0)   s->authentication = (DLMS_AUTHENTICATION)value;
    else if (strcmp(setting, "interfaceType") == 0)    s->interfaceType = (DLMS_INTERFACE_TYPE)value;
    else if (strcmp(setting, "outBufSize") == 0)      clients[handle]->outBufSize = value;
}

void dlms_client_set_str(int handle, const char* setting, const char* value) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle] || !setting) return;
    dlmsSettings* s = &clients[handle]->settings;
    if (strcmp(setting, "password") == 0 && value) {
        bb_clear(&s->password);
        bb_set(&s->password, (const unsigned char*)value, (uint32_t)strlen(value));
    }
}

int dlms_client_get_int(int handle, const char* setting) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle] || !setting) return 0;
    dlmsSettings* s = &clients[handle]->settings;
    if (strcmp(setting, "maxInfoTX") == 0)             return s->maxInfoTX;
    if (strcmp(setting, "maxInfoRX") == 0)             return s->maxInfoRX;
    if (strcmp(setting, "windowSizeTX") == 0)          return s->windowSizeTX;
    if (strcmp(setting, "windowSizeRX") == 0)          return s->windowSizeRX;
    if (strcmp(setting, "proposedConformance") == 0)   return (int)s->proposedConformance;
    if (strcmp(setting, "clientAddress") == 0)         return s->clientAddress;
    if (strcmp(setting, "serverAddress") == 0)         return (int)s->serverAddress;
    if (strcmp(setting, "authentication") == 0)        return (int)s->authentication;
    if (strcmp(setting, "interfaceType") == 0)         return (int)s->interfaceType;
    if (strcmp(setting, "outBufSize") == 0)           return clients[handle]->outBufSize;
    return 0;
}

int dlms_client_snrm_request(int handle, uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_snrmRequest(&clients[handle]->settings, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_snrmRequest failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_parse_ua(int handle, const uint8_t* data, int len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    ClientSlot* slot = clients[handle];

    if (!slot->reply) {
        slot->reply = (gxReplyData*)calloc(1, sizeof(gxReplyData));
        if (!slot->reply) {
            set_error("malloc failed for reply data");
            return -1;
        }
        reply_init(slot->reply);
    } else {
        reply_clear(slot->reply);
        reply_init(slot->reply);
    }

    gxByteBuffer bb;
    bb_init(&bb);
    bb_set(&bb, data, (uint32_t)len);
    int ret = cl_getData(&slot->settings, &bb, slot->reply);
    bb_clear(&bb);
    if (ret != 0) {
        set_error("DLMS:%d:cl_getData (for UA) failed", ret);
        return ret;
    }

    ret = cl_parseUAResponse(&slot->settings, &slot->reply->data);
    if (ret != 0) {
        set_error("DLMS:%d:cl_parseUAResponse failed", ret);
    }
    return ret;
}

int dlms_client_aarq_request(int handle, uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_aarqRequest(&clients[handle]->settings, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_aarqRequest failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_parse_aare(int handle, const uint8_t* data, int len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    ClientSlot* slot = clients[handle];

    if (!slot->reply) {
        slot->reply = (gxReplyData*)calloc(1, sizeof(gxReplyData));
        if (!slot->reply) {
            set_error("malloc failed for reply data");
            return -1;
        }
        reply_init(slot->reply);
    } else {
        reply_clear(slot->reply);
        reply_init(slot->reply);
    }

    gxByteBuffer bb;
    bb_init(&bb);
    bb_set(&bb, data, (uint32_t)len);
    int ret = cl_getData(&slot->settings, &bb, slot->reply);
    bb_clear(&bb);
    if (ret != 0) {
        set_error("DLMS:%d:cl_getData (for AARE) failed", ret);
        return ret;
    }

    ret = cl_parseAAREResponse(&slot->settings, &slot->reply->data);
    if (ret != 0) {
        set_error("DLMS:%d:cl_parseAAREResponse failed", ret);
    }
    return ret;
}

int dlms_client_release_request(int handle, uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_releaseRequest(&clients[handle]->settings, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_releaseRequest failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_disconnect_request(int handle, uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_disconnectRequest(&clients[handle]->settings, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_disconnectRequest failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_get_data(int handle, const uint8_t* data, int len,
                         int* is_complete, int* more_data) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    ClientSlot* slot = clients[handle];
    if (!slot->reply) {
        slot->reply = (gxReplyData*)calloc(1, sizeof(gxReplyData));
        if (!slot->reply) {
            set_error("malloc failed for reply data");
            return -1;
        }
        reply_init(slot->reply);
    } else if (slot->reply->complete && slot->reply->moreData == DLMS_DATA_REQUEST_TYPES_NONE) {
        reply_clear(slot->reply);
        reply_init(slot->reply);
    }

    gxByteBuffer bb;
    bb_init(&bb);
    bb_set(&bb, data, (uint32_t)len);
    int ret = cl_getData(&slot->settings, &bb, slot->reply);
    bb_clear(&bb);
    if (ret != 0) {
        set_error("DLMS:%d:cl_getData failed", ret);
        return ret;
    }
    *is_complete = slot->reply->complete;
    *more_data = (int)slot->reply->moreData;
    return 0;
}

int dlms_client_receiver_ready(int handle, int type,
                               uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    gxByteBuffer bb;
    bb_init(&bb);
    int ret = cl_receiverReady(&clients[handle]->settings,
                               (DLMS_DATA_REQUEST_TYPES)type, &bb);
    if (ret != 0) {
        set_error("DLMS:%d:cl_receiverReady failed", ret);
        bb_clear(&bb);
        return ret;
    }
    int avail = (int)(bb.size - bb.position);
    if (4 + avail > *out_len) {
        set_error("output buffer too small: need %d, have %d", 4 + avail, *out_len);
        bb_clear(&bb);
        return -1;
    }
    out[0] = (uint8_t)(avail >> 24);
    out[1] = (uint8_t)(avail >> 16);
    out[2] = (uint8_t)(avail >> 8);
    out[3] = (uint8_t)(avail);
    memcpy(out + 4, bb.data + bb.position, avail);
    *out_len = 4 + avail;
    bb_clear(&bb);
    return 0;
}

int dlms_object_create(int object_type, const char* obis) {
    int handle = -1;
    for (int i = 0; i < MAX_OBJECTS; i++) {
        if (!objects[i]) { handle = i; break; }
    }
    if (handle < 0) {
        set_error("no free object slots");
        return -1;
    }

    gxObject* obj = NULL;
    int ret = cosem_createObject2((DLMS_OBJECT_TYPE)object_type, obis, &obj);
    if (ret != 0 || !obj) {
        set_error("DLMS:%d:cosem_createObject2 failed", ret);
        return -1;
    }

    objects[handle] = obj;
    return handle;
}

void dlms_object_destroy(int obj_handle) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return;
    obj_clear(objects[obj_handle]);
    free(objects[obj_handle]);
    objects[obj_handle] = NULL;
}

int dlms_client_read(int handle, int obj_handle, int attribute,
                     uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_read(&clients[handle]->settings, objects[obj_handle],
                      (unsigned char)attribute, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_read failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_write(int handle, int obj_handle, int attribute,
                      uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_write(&clients[handle]->settings, objects[obj_handle],
                       (unsigned char)attribute, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_write failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_method(int handle, int obj_handle, int method_index,
                       const uint8_t* params, int params_len,
                       uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }

    message msgs;
    mes_init(&msgs);

    int ret;
    if (params && params_len > 0) {
        ret = cl_method2(&clients[handle]->settings, objects[obj_handle],
                         (unsigned char)method_index,
                         (unsigned char*)params, (uint32_t)params_len, &msgs);
    } else {
        dlmsVARIANT v;
        var_init(&v);
        var_setInt8(&v, 0);
        ret = cl_method(&clients[handle]->settings, objects[obj_handle],
                        (unsigned char)method_index, &v, &msgs);
        var_clear(&v);
    }

    if (ret != 0) {
        set_error("DLMS:%d:cl_method failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_update_value(int handle, int obj_handle, int attribute,
                             const uint8_t* reply_data, int reply_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    ClientSlot* slot = clients[handle];

    /*
     * If the caller supplies raw bytes we wrap them as an octet-string variant.
     * Otherwise we forward the accumulated dataValue from cl_getData.
     */
    dlmsVARIANT val;
    var_init(&val);

    if (reply_data && reply_len > 0) {
        var_addBytes(&val, reply_data, (uint16_t)reply_len);
    } else if (slot->reply) {
        var_copy(&val, &slot->reply->dataValue);
    }

    int ret = cl_updateValue(&slot->settings, objects[obj_handle],
                             (unsigned char)attribute, &val);
    var_clear(&val);
    if (ret != 0) {
        set_error("DLMS:%d:cl_updateValue failed", ret);
        return ret;
    }

    if (slot->reply) {
        reply_clear(slot->reply);
        reply_init(slot->reply);
    }
    return 0;
}

int dlms_object_get_int(int obj_handle, int attribute) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return 0;
    gxObject* obj = objects[obj_handle];

    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2)
            return var_toInteger(&((gxData*)obj)->value);
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2)
            return var_toInteger(&((gxRegister*)obj)->value);
        if (attribute == 3) {
            gxRegister* r = (gxRegister*)obj;
            return ((int)r->scaler << 8) | r->unit;
        }
        break;
    case DLMS_OBJECT_TYPE_EXTENDED_REGISTER:
        if (attribute == 2)
            return var_toInteger(&((gxExtendedRegister*)obj)->value);
        if (attribute == 3) {
            gxExtendedRegister* r = (gxExtendedRegister*)obj;
            return ((int)r->scaler << 8) | r->unit;
        }
        break;
    case DLMS_OBJECT_TYPE_CLOCK:
        if (attribute == 3)
            return (int)((gxClock*)obj)->status;
        if (attribute == 4)
            return ((gxClock*)obj)->timeZone;
        break;
    case DLMS_OBJECT_TYPE_DISCONNECT_CONTROL:
        if (attribute == 2)
            return ((gxDisconnectControl*)obj)->outputState;
        if (attribute == 3)
            return (int)((gxDisconnectControl*)obj)->controlState;
        if (attribute == 4)
            return (int)((gxDisconnectControl*)obj)->controlMode;
        break;
    default:
        break;
    }
    return 0;
}

double dlms_object_get_double(int obj_handle, int attribute) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return 0.0;
    gxObject* obj = objects[obj_handle];

    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2)
            return var_toDouble(&((gxData*)obj)->value);
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2)
            return var_toDouble(&((gxRegister*)obj)->value);
        break;
    case DLMS_OBJECT_TYPE_EXTENDED_REGISTER:
        if (attribute == 2)
            return var_toDouble(&((gxExtendedRegister*)obj)->value);
        break;
    default:
        break;
    }
    return 0.0;
}

const char* dlms_object_get_str(int obj_handle, int attribute) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return "";
    gxObject* obj = objects[obj_handle];

    if (attribute == 1) {
        hlp_getLogicalNameToString(obj->logicalName, str_buf);
        return str_buf;
    }

    if (obj->objectType == DLMS_OBJECT_TYPE_CLOCK) {
        gxClock* clk = (gxClock*)obj;
        if (attribute == 2) {
            time_toString2(&clk->time, str_buf, sizeof(str_buf));
            return str_buf;
        }
    }

    dlmsVARIANT* val = NULL;
    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2) val = &((gxData*)obj)->value;
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2) val = &((gxRegister*)obj)->value;
        break;
    case DLMS_OBJECT_TYPE_EXTENDED_REGISTER:
        if (attribute == 2) val = &((gxExtendedRegister*)obj)->value;
        break;
    default:
        break;
    }

    if (val && val->strVal) {
        int sz = val->strVal->size;
        if (sz > (int)sizeof(str_buf) - 1) sz = (int)sizeof(str_buf) - 1;
        memcpy(str_buf, val->strVal->data, sz);
        str_buf[sz] = '\0';
        return str_buf;
    }

    return "";
}

int dlms_object_get_bytes(int obj_handle, int attribute,
                          uint8_t* out, int* out_len) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }

    gxObject* obj = objects[obj_handle];
    dlmsVARIANT* val = NULL;
    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2) val = &((gxData*)obj)->value;
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2) val = &((gxRegister*)obj)->value;
        break;
    default:
        break;
    }

    if (!val || !val->byteArr) {
        *out_len = 0;
        return 0;
    }

    int sz = val->byteArr->size;
    if (sz > *out_len) {
        set_error("output buffer too small: need %d, have %d", sz, *out_len);
        return -1;
    }
    memcpy(out, val->byteArr->data, sz);
    *out_len = sz;
    return 0;
}

void dlms_object_set_int(int obj_handle, int attribute, int value) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return;
    gxObject* obj = objects[obj_handle];

    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2)
            var_setInt32(&((gxData*)obj)->value, value);
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2)
            var_setInt32(&((gxRegister*)obj)->value, value);
        if (attribute == 3) {
            ((gxRegister*)obj)->scaler = (signed char)(value >> 8);
            ((gxRegister*)obj)->unit = (unsigned char)(value & 0xFF);
        }
        break;
    case DLMS_OBJECT_TYPE_DISCONNECT_CONTROL:
        if (attribute == 2)
            ((gxDisconnectControl*)obj)->outputState = (unsigned char)value;
        if (attribute == 3)
            ((gxDisconnectControl*)obj)->controlState = (DLMS_CONTROL_STATE)value;
        if (attribute == 4)
            ((gxDisconnectControl*)obj)->controlMode = (DLMS_CONTROL_MODE)value;
        break;
    default:
        break;
    }
}

void dlms_object_set_double(int obj_handle, int attribute, double value) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return;
    gxObject* obj = objects[obj_handle];

    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2)
            var_setDouble(&((gxData*)obj)->value, value);
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2)
            var_setDouble(&((gxRegister*)obj)->value, value);
        break;
    default:
        break;
    }
}

void dlms_object_set_str(int obj_handle, int attribute, const char* value) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle] || !value) return;
    gxObject* obj = objects[obj_handle];

    if (attribute == 1) {
        hlp_setLogicalName(obj->logicalName, value);
        return;
    }

    dlmsVARIANT* val = NULL;
    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2) val = &((gxData*)obj)->value;
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2) val = &((gxRegister*)obj)->value;
        break;
    default:
        break;
    }

    if (val) {
        var_setString(val, value, (uint16_t)strlen(value));
    }
}

void dlms_object_set_bytes(int obj_handle, int attribute,
                           const uint8_t* data, int len) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return;
    gxObject* obj = objects[obj_handle];

    dlmsVARIANT* val = NULL;
    switch (obj->objectType) {
    case DLMS_OBJECT_TYPE_DATA:
        if (attribute == 2) val = &((gxData*)obj)->value;
        break;
    case DLMS_OBJECT_TYPE_REGISTER:
        if (attribute == 2) val = &((gxRegister*)obj)->value;
        break;
    default:
        break;
    }

    if (val) {
        var_clear(val);
        var_addBytes(val, data, (uint16_t)len);
    }
}

int dlms_client_read_by_range(int handle, int obj_handle,
                              const char* start_iso, const char* end_iso,
                              uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) {
        set_error("object is not a profile generic");
        return -1;
    }

    gxProfileGeneric* pg = (gxProfileGeneric*)objects[obj_handle];

    struct tm start_tm, end_tm;
    memset(&start_tm, 0, sizeof(start_tm));
    memset(&end_tm, 0, sizeof(end_tm));

    int y, M, d, h, m, s;
    y = M = d = h = m = s = 0;
    if (sscanf(start_iso, "%d-%d-%dT%d:%d:%d", &y, &M, &d, &h, &m, &s) >= 3) {
        start_tm.tm_year = y - 1900;
        start_tm.tm_mon = M - 1;
        start_tm.tm_mday = d;
        start_tm.tm_hour = h;
        start_tm.tm_min = m;
        start_tm.tm_sec = s;
    }
    y = M = d = h = m = s = 0;
    if (sscanf(end_iso, "%d-%d-%dT%d:%d:%d", &y, &M, &d, &h, &m, &s) >= 3) {
        end_tm.tm_year = y - 1900;
        end_tm.tm_mon = M - 1;
        end_tm.tm_mday = d;
        end_tm.tm_hour = h;
        end_tm.tm_min = m;
        end_tm.tm_sec = s;
    }

    message msgs;
    mes_init(&msgs);
    int ret = cl_readRowsByRange(&clients[handle]->settings, pg,
                                 &start_tm, &end_tm, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_readRowsByRange failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

/* ===== Profile Generic buffer access ===== */

int dlms_pg_row_count(int obj_handle) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return 0;
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) return 0;
    return (int)((gxProfileGeneric*)objects[obj_handle])->buffer.size;
}

int dlms_pg_column_count(int obj_handle) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return 0;
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) return 0;
    return (int)((gxProfileGeneric*)objects[obj_handle])->captureObjects.size;
}

int dlms_pg_capture_object(int obj_handle, int col,
                           int* object_type, char* obis, int obis_len,
                           int* attr_index) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) {
        set_error("object is not a profile generic");
        return -1;
    }
    gxProfileGeneric* pg = (gxProfileGeneric*)objects[obj_handle];
    if (col < 0 || col >= (int)pg->captureObjects.size) {
        set_error("column %d out of range (0..%d)", col, (int)pg->captureObjects.size - 1);
        return -1;
    }

    gxKey* key = NULL;
    int ret = arr_getByIndex(&pg->captureObjects, (uint16_t)col, (void**)&key);
    if (ret != 0 || !key || !key->key) {
        set_error("DLMS:%d:arr_getByIndex failed for capture object", ret);
        return -1;
    }

    gxObject* obj = (gxObject*)key->key;
    gxTarget* target = (gxTarget*)key->value;
    *object_type = obj->objectType;
    *attr_index = target ? target->attributeIndex : 0;
    if (obis_len >= 20) {
        hlp_getLogicalNameToString(obj->logicalName, obis);
    }
    return 0;
}

int dlms_pg_cell_type(int obj_handle, int row, int col) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return -1;
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) return -1;
    gxProfileGeneric* pg = (gxProfileGeneric*)objects[obj_handle];
    if (row < 0 || row >= (int)pg->buffer.size) return -1;

    variantArray* va = NULL;
    arr_getByIndex(&pg->buffer, (uint16_t)row, (void**)&va);
    if (!va || col < 0 || col >= (int)va->size) return -1;

    dlmsVARIANT* cell = NULL;
    va_getByIndex(va, col, &cell);
    if (!cell) return -1;
    return (int)cell->vt;
}

double dlms_pg_cell_double(int obj_handle, int row, int col) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) return 0.0;
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) return 0.0;
    gxProfileGeneric* pg = (gxProfileGeneric*)objects[obj_handle];
    if (row < 0 || row >= (int)pg->buffer.size) return 0.0;

    variantArray* va = NULL;
    arr_getByIndex(&pg->buffer, (uint16_t)row, (void**)&va);
    if (!va || col < 0 || col >= (int)va->size) return 0.0;

    dlmsVARIANT* cell = NULL;
    va_getByIndex(va, col, &cell);
    if (!cell) return 0.0;
    return var_toDouble(cell);
}

int dlms_pg_cell_string(int obj_handle, int row, int col,
                        char* buf, int buf_len) {
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }
    if (objects[obj_handle]->objectType != DLMS_OBJECT_TYPE_PROFILE_GENERIC) {
        set_error("object is not a profile generic");
        return -1;
    }
    gxProfileGeneric* pg = (gxProfileGeneric*)objects[obj_handle];
    if (row < 0 || row >= (int)pg->buffer.size) {
        set_error("row %d out of range (0..%d)", row, (int)pg->buffer.size - 1);
        return -1;
    }

    variantArray* va = NULL;
    arr_getByIndex(&pg->buffer, (uint16_t)row, (void**)&va);
    if (!va || col < 0 || col >= (int)va->size) {
        set_error("column %d out of range", col);
        return -1;
    }

    dlmsVARIANT* cell = NULL;
    va_getByIndex(va, col, &cell);
    if (!cell) {
        buf[0] = '\0';
        return 0;
    }

    if (cell->vt == DLMS_DATA_TYPE_DATETIME ||
        cell->vt == DLMS_DATA_TYPE_DATE ||
        cell->vt == DLMS_DATA_TYPE_TIME) {
        if (cell->dateTime) {
            time_toString2(cell->dateTime, buf, buf_len);
        } else {
            buf[0] = '\0';
        }
    } else if (cell->vt == DLMS_DATA_TYPE_OCTET_STRING && cell->byteArr) {
        int sz = cell->byteArr->size;
        if (sz > buf_len - 1) sz = buf_len - 1;
        memcpy(buf, cell->byteArr->data, sz);
        buf[sz] = '\0';
    } else {
        snprintf(buf, buf_len, "%f", var_toDouble(cell));
    }
    return 0;
}

int dlms_client_get_objects_request(int handle, uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    message msgs;
    mes_init(&msgs);
    int ret = cl_getObjectsRequest(&clients[handle]->settings, &msgs);
    if (ret != 0) {
        set_error("DLMS:%d:cl_getObjectsRequest failed", ret);
        mes_clear(&msgs);
        return ret;
    }
    int rc = write_messages_to_buf(&msgs, out, out_len);
    mes_clear(&msgs);
    return rc;
}

int dlms_client_parse_objects(int handle, const uint8_t* data, int len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    ClientSlot* slot = clients[handle];

    int ret;
    if (data && len > 0) {
        gxByteBuffer bb;
        bb_init(&bb);
        bb_set(&bb, data, (uint32_t)len);
        ret = cl_parseObjects(&slot->settings, &bb);
        bb_clear(&bb);
    } else if (slot->reply) {
        slot->reply->data.position = 0;
        ret = cl_parseObjects(&slot->settings, &slot->reply->data);
    } else {
        set_error("no data provided and no reply data available");
        return -1;
    }

    if (ret != 0) {
        set_error("DLMS:%d:cl_parseObjects failed", ret);
        return ret;
    }
    slot->parsedObjectsValid = 1;
    return 0;
}

int dlms_client_get_parsed_object_count(int handle) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) return 0;
    return clients[handle]->settings.objects.size;
}

int dlms_client_get_parsed_object(int handle, int index,
                                  int* object_type, char* obis, int obis_len) {
    if (handle < 0 || handle >= MAX_CLIENTS || !clients[handle]) {
        set_error("invalid client handle %d", handle);
        return -1;
    }
    objectArray* oa = &clients[handle]->settings.objects;
    if (index < 0 || index >= oa->size) {
        set_error("index %d out of range (0..%d)", index, oa->size - 1);
        return -1;
    }

    gxObject* obj = NULL;
    int ret = oa_getByIndex(oa, (uint16_t)index, &obj);
    if (ret != 0 || !obj) {
        set_error("DLMS:%d:oa_getByIndex failed", ret);
        return -1;
    }

    *object_type = obj->objectType;
    if (obis_len >= 20) {
        hlp_getLogicalNameToString(obj->logicalName, obis);
    }
    return 0;
}

/* ===== Server callbacks ===== */

/*
 * Gurux declares these as extern in serverevents.h, so the linker requires
 * definitions. These permissive defaults accept all connections and allow
 * full read/write/method access.
 */

unsigned char svr_isTarget(dlmsSettings* settings, uint32_t serverAddress,
                           uint32_t clientAddress) {
    (void)settings; (void)serverAddress; (void)clientAddress;
    return 1;
}

DLMS_ACCESS_MODE svr_getAttributeAccess(dlmsSettings* settings,
                                        gxObject* obj, unsigned char index) {
    (void)settings; (void)obj; (void)index;
    return DLMS_ACCESS_MODE_READ_WRITE;
}

DLMS_METHOD_ACCESS_MODE svr_getMethodAccess(dlmsSettings* settings,
                                            gxObject* obj, unsigned char index) {
    (void)settings; (void)obj; (void)index;
    return DLMS_METHOD_ACCESS_MODE_ACCESS;
}

int svr_connected(dlmsServerSettings* settings) {
    (void)settings;
    return 0;
}

int svr_invalidConnection(dlmsServerSettings* settings) {
    (void)settings;
    return 0;
}

int svr_disconnected(dlmsServerSettings* settings) {
    (void)settings;
    return 0;
}

void svr_preGet(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_postGet(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_preRead(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_preWrite(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_preAction(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_postRead(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_postWrite(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

void svr_postAction(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

DLMS_SOURCE_DIAGNOSTIC svr_validateAuthentication(
    dlmsServerSettings* settings, DLMS_AUTHENTICATION authentication,
    gxByteBuffer* password) {
    (void)settings; (void)authentication; (void)password;
    return DLMS_SOURCE_DIAGNOSTIC_NONE;
}

int svr_findObject(dlmsSettings* settings, DLMS_OBJECT_TYPE objectType,
                   int sn, unsigned char* ln, gxValueEventArg* e) {
    (void)sn;
    gxObject* obj = NULL;
    if (oa_findByLN(&settings->objects, objectType, ln, &obj) == 0 && obj) {
        e->target = obj;
    }
    return 0;
}

void svr_getDataType(dlmsSettings* settings, gxValueEventCollection* args) {
    (void)settings; (void)args;
}

/* ===== Server lifecycle ===== */

int dlms_server_create(void) {
    int handle = -1;
    for (int i = 0; i < MAX_SERVERS; i++) {
        if (!servers[i]) { handle = i; break; }
    }
    if (handle < 0) {
        set_error("no free server slots");
        return -1;
    }

    ServerSlot* slot = (ServerSlot*)calloc(1, sizeof(ServerSlot));
    if (!slot) {
        set_error("malloc failed for server slot");
        return -1;
    }

    svr_init(&slot->settings, 1, DLMS_INTERFACE_TYPE_HDLC,
             512, 2048,
             slot->frameBuffer, sizeof(slot->frameBuffer),
             slot->pduBuffer, sizeof(slot->pduBuffer));

    slot->settings.base.serverAddress = 1;
    slot->settings.base.clientAddress = 16;
    slot->settings.base.authentication = DLMS_AUTHENTICATION_LOW;

    memset(&slot->assocLN, 0, sizeof(gxAssociationLogicalName));
    const unsigned char assocLn[6] = { 0, 0, 40, 0, 0, 255 };
    cosem_init2((gxObject*)&slot->assocLN,
                DLMS_OBJECT_TYPE_ASSOCIATION_LOGICAL_NAME, assocLn);
    slot->assocLN.authenticationMechanismName.mechanismId = DLMS_AUTHENTICATION_LOW;
    slot->assocLN.clientSAP = 16;
    slot->assocLN.xDLMSContextInfo.maxSendPduSize = 2048;
    slot->assocLN.xDLMSContextInfo.maxReceivePduSize = 2048;
    slot->assocLN.xDLMSContextInfo.conformance = (DLMS_CONFORMANCE)(
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_ACTION |
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_SET_OR_WRITE |
        DLMS_CONFORMANCE_BLOCK_TRANSFER_WITH_GET_OR_READ |
        DLMS_CONFORMANCE_SET |
        DLMS_CONFORMANCE_SELECTIVE_ACCESS |
        DLMS_CONFORMANCE_ACTION |
        DLMS_CONFORMANCE_MULTIPLE_REFERENCES |
        DLMS_CONFORMANCE_GET);
    oa_push(&slot->settings.base.objects, (gxObject*)&slot->assocLN);

    servers[handle] = slot;
    return handle;
}

void dlms_server_destroy(int handle) {
    if (handle < 0 || handle >= MAX_SERVERS || !servers[handle]) return;
    svr_clear(&servers[handle]->settings);
    free(servers[handle]);
    servers[handle] = NULL;
}

int dlms_server_add_object(int handle, int obj_handle) {
    if (handle < 0 || handle >= MAX_SERVERS || !servers[handle]) {
        set_error("invalid server handle %d", handle);
        return -1;
    }
    if (obj_handle < 0 || obj_handle >= MAX_OBJECTS || !objects[obj_handle]) {
        set_error("invalid object handle %d", obj_handle);
        return -1;
    }

    int ret = oa_push(&servers[handle]->settings.base.objects, objects[obj_handle]);
    if (ret != 0) {
        set_error("DLMS:%d:oa_push failed", ret);
        return ret;
    }
    return 0;
}

int dlms_server_initialize(int handle) {
    if (handle < 0 || handle >= MAX_SERVERS || !servers[handle]) {
        set_error("invalid server handle %d", handle);
        return -1;
    }
    int ret = svr_initialize(&servers[handle]->settings);
    if (ret != 0) {
        set_error("DLMS:%d:svr_initialize failed", ret);
        return ret;
    }
    return 0;
}

int dlms_server_handle_request(int handle, const uint8_t* data, int len,
                               uint8_t* out, int* out_len) {
    if (handle < 0 || handle >= MAX_SERVERS || !servers[handle]) {
        set_error("invalid server handle %d", handle);
        return -1;
    }

    ServerSlot* slot = servers[handle];

    gxByteBuffer request, reply;
    bb_init(&request);
    bb_init(&reply);
    bb_set(&request, data, (uint32_t)len);

    int ret = svr_handleRequest(&slot->settings, &request, &reply);
    bb_clear(&request);

    if (ret != 0) {
        set_error("DLMS:%d:svr_handleRequest failed", ret);
        bb_clear(&reply);
        return ret;
    }

    int avail = (int)(reply.size - reply.position);
    if (avail > *out_len) {
        set_error("output buffer too small: need %d, have %d", avail, *out_len);
        bb_clear(&reply);
        return -1;
    }
    memcpy(out, reply.data + reply.position, avail);
    *out_len = avail;
    bb_clear(&reply);
    return 0;
}
