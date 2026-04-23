#ifndef DLMS_WASM_H
#define DLMS_WASM_H

#include <stdint.h>

const char* dlms_last_error(void);

int  dlms_client_create(int client_addr, int server_addr,
                        const char* password, int interface_type);
void dlms_client_destroy(int handle);
void dlms_client_set_int(int handle, const char* setting, int value);
void dlms_client_set_str(int handle, const char* setting, const char* value);
int  dlms_client_get_int(int handle, const char* setting);

int dlms_client_snrm_request(int handle, uint8_t* out, int* out_len);
int dlms_client_parse_ua(int handle, const uint8_t* data, int len);
int dlms_client_aarq_request(int handle, uint8_t* out, int* out_len);
int dlms_client_parse_aare(int handle, const uint8_t* data, int len);
int dlms_client_get_application_association_request(int handle,
                                                    uint8_t* out, int* out_len);
int dlms_client_parse_application_association_response(int handle,
                                                        const uint8_t* data, int len);
int dlms_client_release_request(int handle, uint8_t* out, int* out_len);
int dlms_client_disconnect_request(int handle, uint8_t* out, int* out_len);

/**
 * Parse a UA/AARE/AA-response from the client's existing reply state, without
 * re-running HDLC unwrap. Caller must have driven `dlms_client_get_data` to
 * completion first (`is_complete == 1`). Mirrors the Python gurux idiom of
 * `getData(rd, reply)` → `parseUAResponse(reply.data)`, and lets higher-level
 * TS code accumulate chunked responses without double-advancing HDLC state.
 */
int dlms_client_parse_ua_from_reply(int handle);
int dlms_client_parse_aare_from_reply(int handle);
int dlms_client_parse_application_association_response_from_reply(int handle);

int dlms_client_get_data(int handle, const uint8_t* data, int len,
                         int* is_complete, int* more_data);
int dlms_client_receiver_ready(int handle, int type,
                               uint8_t* out, int* out_len);

int  dlms_object_create(int object_type, const char* obis);
void dlms_object_destroy(int obj_handle);

int dlms_client_read(int handle, int obj_handle, int attribute,
                     uint8_t* out, int* out_len);
int dlms_client_write(int handle, int obj_handle, int attribute,
                      uint8_t* out, int* out_len);
int dlms_client_method(int handle, int obj_handle, int method_index,
                       const uint8_t* params, int params_len,
                       uint8_t* out, int* out_len);
int dlms_client_update_value(int handle, int obj_handle, int attribute,
                             const uint8_t* reply_data, int reply_len);

int         dlms_object_get_int(int obj_handle, int attribute);
double      dlms_object_get_double(int obj_handle, int attribute);
const char* dlms_object_get_str(int obj_handle, int attribute);
int         dlms_object_get_bytes(int obj_handle, int attribute,
                                  uint8_t* out, int* out_len);
void dlms_object_set_int(int obj_handle, int attribute, int value);
void dlms_object_set_double(int obj_handle, int attribute, double value);
void dlms_object_set_str(int obj_handle, int attribute, const char* value);
void dlms_object_set_bytes(int obj_handle, int attribute,
                           const uint8_t* data, int len);

int dlms_client_read_by_range(int handle, int obj_handle,
                              const char* start_iso, const char* end_iso,
                              uint8_t* out, int* out_len);
int dlms_client_read_by_entry(int handle, int obj_handle,
                              int index, int count,
                              uint8_t* out, int* out_len);

int dlms_client_get_objects_request(int handle, uint8_t* out, int* out_len);
int dlms_client_parse_objects(int handle, const uint8_t* data, int len);
int dlms_client_get_parsed_object_count(int handle);
int dlms_client_get_parsed_object(int handle, int index,
                                  int* object_type, char* obis, int obis_len);

int dlms_pg_row_count(int obj_handle);
int dlms_pg_column_count(int obj_handle);
int dlms_pg_capture_object(int obj_handle, int col,
                           int* object_type, char* obis, int obis_len,
                           int* attr_index);
int dlms_pg_sort_object(int obj_handle, int* object_type,
                        char* obis, int obis_len,
                        int* attr_index, int* data_index);
int dlms_pg_cell_type(int obj_handle, int row, int col);
double dlms_pg_cell_double(int obj_handle, int row, int col);
int dlms_pg_cell_string(int obj_handle, int row, int col,
                        char* buf, int buf_len);

int  dlms_server_create(void);
void dlms_server_destroy(int handle);
int  dlms_server_add_object(int handle, int obj_handle);
int  dlms_server_initialize(int handle);
int  dlms_server_handle_request(int handle, const uint8_t* data, int len,
                                uint8_t* out, int* out_len);

#endif
