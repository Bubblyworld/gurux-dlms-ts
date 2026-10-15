export interface EmscriptenModule {
  ccall: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown;
  cwrap: (
    name: string,
    returnType: string | null,
    argTypes: string[]
  ) => (...args: unknown[]) => unknown;
  getValue: (ptr: number, type: string) => number;
  setValue: (ptr: number, value: number, type: string) => void;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, ptr: number, maxBytes: number) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

export type GuruxModuleFactory = (
  options?: Record<string, unknown>
) => Promise<EmscriptenModule>;

// Values from GuruxDLMS.c development/include/enums.h DLMS_OBJECT_TYPE
export enum ObjectType {
  DATA = 1,
  REGISTER = 3,
  EXTENDED_REGISTER = 4,
  PROFILE_GENERIC = 7,
  CLOCK = 8,
  ASSOCIATION_LOGICAL_NAME = 15,
  DISCONNECT_CONTROL = 70,
}

// Values from GuruxDLMS.c development/include/enums.h DLMS_INTERFACE_TYPE
export enum InterfaceType {
  HDLC = 0,
  HDLC_WITH_MODE_E = 4,
}

// Values from GuruxDLMS.c development/include/enums.h DLMS_UNIT
export enum Unit {
  ACTIVE_POWER = 27,
  APPARENT_POWER = 28,
  REACTIVE_POWER = 29,
  ACTIVE_ENERGY = 30,
  APPARENT_ENERGY = 31,
  REACTIVE_ENERGY = 32,
  CURRENT = 33,
  VOLTAGE = 35,
  FREQUENCY = 44,
}

export interface GetDataResult {
  complete: boolean;
  moreData: number;
}

export interface AssociationEntry {
  obis: string;
  type: ObjectType;
}

export interface ClientOptions {
  clientAddress: number;
  serverAddress: number;
  password?: string;
  interfaceType?: InterfaceType;
}

export enum DlmsErrorCode {
  /** Data access errors (COSEM layer, codes 1-250) */
  HARDWARE_FAULT = 1,
  TEMPORARY_FAILURE = 2,
  READ_WRITE_DENIED = 3,
  UNDEFINED_OBJECT = 4,
  INCONSISTENT_CLASS_OR_OBJECT = 9,
  UNAVAILABLE_OBJECT = 11,
  UNMATCH_TYPE = 12,
  ACCESS_VIOLATED = 13,
  DATA_BLOCK_UNAVAILABLE = 14,
  LONG_GET_OR_READ_ABORTED = 15,
  NO_LONG_GET_OR_READ_IN_PROGRESS = 16,
  LONG_SET_OR_WRITE_ABORTED = 17,
  NO_LONG_SET_OR_WRITE_IN_PROGRESS = 18,
  DATA_BLOCK_NUMBER_INVALID = 19,
  OTHER_REASON = 250,

  /** Library and transport errors (codes 251-272): the reply could not be sent, received or decoded. */
  UNKNOWN = 251,
  SEND_FAILED = 252,
  RECEIVE_FAILED = 253,
  NOT_IMPLEMENTED = 254,
  SECURITY_NOT_IMPLEMENTED = 255,
  INVALID_COMMAND = 256,
  INVALID_BLOCK_NUMBER = 257,
  INVALID_PARAMETER = 258,
  NOT_INITIALIZED = 259,
  OUT_OF_MEMORY = 260,
  NOT_REPLY = 261,
  INVALID_LOGICAL_NAME = 262,
  INVALID_CLIENT_ADDRESS = 263,
  INVALID_SERVER_ADDRESS = 264,
  INVALID_DATA_FORMAT = 265,
  INVALID_VERSION_NUMBER = 266,
  CLIENT_ADDRESS_MISMATCH = 267,
  SERVER_ADDRESS_MISMATCH = 268,
  WRONG_CRC = 269,
  INVALID_RESPONSE = 270,
  INVALID_TAG = 271,
  ENCODING_FAILED = 272,

  /** Association/authentication errors (ACSE layer, codes 273-280) */
  REJECTED_PERMANENT = 273,
  REJECTED_TRANSIENT = 274,
  NO_REASON_GIVEN = 275,
  APPLICATION_CONTEXT_NAME_NOT_SUPPORTED = 276,
  AUTHENTICATION_MECHANISM_NAME_NOT_RECOGNISED = 277,
  AUTHENTICATION_MECHANISM_NAME_REQUIRED = 278,
  AUTHENTICATION_FAILURE = 279,
  AUTHENTICATION_REQUIRED = 280,

  /** Library and transport errors (codes 281-291). */
  INVALID_FRAME_NUMBER = 281,
  INVALID_DATE_TIME = 282,
  INVALID_INVOKE_ID = 283,
  INVOCATION_COUNTER_TOO_SMALL = 284,
  INVALID_DECIPHERING = 285,
  INVALID_SECURITY_SUITE = 286,
  SERIALIZATION_LOAD_FAILURE = 287,
  SERIALIZATION_SAVE_FAILURE = 288,
  SERIALIZATION_COUNT_FAILURE = 289,
  VERIFY_FAILED = 290,
  INVALID_CERTIFICATE = 291,
}

export const DLMS_ERROR_MESSAGES: Record<number, string> = {
  [DlmsErrorCode.HARDWARE_FAULT]: 'Hardware fault',
  [DlmsErrorCode.TEMPORARY_FAILURE]: 'Temporary failure',
  [DlmsErrorCode.READ_WRITE_DENIED]: 'Read/write denied',
  [DlmsErrorCode.UNDEFINED_OBJECT]: 'Undefined object',
  [DlmsErrorCode.INCONSISTENT_CLASS_OR_OBJECT]: 'Inconsistent class or object',
  [DlmsErrorCode.UNAVAILABLE_OBJECT]: 'Unavailable object',
  [DlmsErrorCode.UNMATCH_TYPE]: 'Unmatched type',
  [DlmsErrorCode.ACCESS_VIOLATED]: 'Access violated',
  [DlmsErrorCode.DATA_BLOCK_UNAVAILABLE]: 'Data block unavailable',
  [DlmsErrorCode.LONG_GET_OR_READ_ABORTED]: 'Long get or read aborted',
  [DlmsErrorCode.NO_LONG_GET_OR_READ_IN_PROGRESS]: 'No long get or read in progress',
  [DlmsErrorCode.LONG_SET_OR_WRITE_ABORTED]: 'Long set or write aborted',
  [DlmsErrorCode.NO_LONG_SET_OR_WRITE_IN_PROGRESS]: 'No long set or write in progress',
  [DlmsErrorCode.DATA_BLOCK_NUMBER_INVALID]: 'Data block number invalid',
  [DlmsErrorCode.OTHER_REASON]: 'Other reason',
  [DlmsErrorCode.REJECTED_PERMANENT]: 'Association permanently rejected',
  [DlmsErrorCode.REJECTED_TRANSIENT]: 'Association transiently rejected',
  [DlmsErrorCode.NO_REASON_GIVEN]: 'Association rejected (no reason given)',
  [DlmsErrorCode.APPLICATION_CONTEXT_NAME_NOT_SUPPORTED]: 'Application context name not supported',
  [DlmsErrorCode.AUTHENTICATION_MECHANISM_NAME_NOT_RECOGNISED]: 'Authentication mechanism not recognised',
  [DlmsErrorCode.AUTHENTICATION_MECHANISM_NAME_REQUIRED]: 'Authentication mechanism required',
  [DlmsErrorCode.AUTHENTICATION_FAILURE]: 'Authentication failure',
  [DlmsErrorCode.AUTHENTICATION_REQUIRED]: 'Authentication required',
  [DlmsErrorCode.UNKNOWN]: 'Unknown error',
  [DlmsErrorCode.SEND_FAILED]: 'Send failed',
  [DlmsErrorCode.RECEIVE_FAILED]: 'Receive failed',
  [DlmsErrorCode.NOT_IMPLEMENTED]: 'Not implemented',
  [DlmsErrorCode.SECURITY_NOT_IMPLEMENTED]: 'Secure connections are not implemented',
  [DlmsErrorCode.INVALID_COMMAND]: 'Reply carried an unknown DLMS command',
  [DlmsErrorCode.INVALID_BLOCK_NUMBER]: 'Reply block number is out of sequence',
  [DlmsErrorCode.INVALID_PARAMETER]: 'Reply is not the kind of frame expected',
  [DlmsErrorCode.NOT_INITIALIZED]: 'Client is not initialised',
  [DlmsErrorCode.OUT_OF_MEMORY]: 'Reply could not be buffered',
  [DlmsErrorCode.NOT_REPLY]: 'Frame is not a reply to the request sent',
  [DlmsErrorCode.INVALID_LOGICAL_NAME]: 'Invalid logical name',
  [DlmsErrorCode.INVALID_CLIENT_ADDRESS]: 'Client HDLC address is not set',
  [DlmsErrorCode.INVALID_SERVER_ADDRESS]: 'Server HDLC address is not set',
  [DlmsErrorCode.INVALID_DATA_FORMAT]: 'Reply is not a HDLC frame',
  [DlmsErrorCode.INVALID_VERSION_NUMBER]: 'Invalid DLMS version number',
  [DlmsErrorCode.CLIENT_ADDRESS_MISMATCH]: 'Reply is addressed to another client',
  [DlmsErrorCode.SERVER_ADDRESS_MISMATCH]: 'Reply came from another server address',
  [DlmsErrorCode.WRONG_CRC]: 'Reply failed its checksum',
  [DlmsErrorCode.INVALID_RESPONSE]: 'Reply is not a valid response',
  [DlmsErrorCode.INVALID_TAG]: 'Reply is not the kind of message expected',
  [DlmsErrorCode.ENCODING_FAILED]: 'Reply ended before its declared length',
  [DlmsErrorCode.INVALID_FRAME_NUMBER]: 'Reply HDLC frame number is out of sequence',
  [DlmsErrorCode.INVALID_DATE_TIME]: 'Invalid date-time',
  [DlmsErrorCode.INVALID_INVOKE_ID]: 'Reply answers an earlier request',
  [DlmsErrorCode.INVOCATION_COUNTER_TOO_SMALL]: 'Invocation counter too small',
  [DlmsErrorCode.INVALID_DECIPHERING]: 'Reply could not be deciphered',
  [DlmsErrorCode.INVALID_SECURITY_SUITE]: 'Invalid security suite',
  [DlmsErrorCode.SERIALIZATION_LOAD_FAILURE]: 'Serialisation load failure',
  [DlmsErrorCode.SERIALIZATION_SAVE_FAILURE]: 'Serialisation save failure',
  [DlmsErrorCode.SERIALIZATION_COUNT_FAILURE]: 'Serialisation count failure',
  [DlmsErrorCode.VERIFY_FAILED]: 'Signature verification failed',
  [DlmsErrorCode.INVALID_CERTIFICATE]: 'Invalid certificate',
};

export const ACSE_ERROR_RANGE = { min: 273, max: 280 };

/** Codes the library raises itself while sending, receiving or decoding, as opposed to codes a meter reports. */
export const TRANSPORT_ERROR_RANGES = [
  { min: 251, max: 272 },
  { min: 281, max: 291 },
];

export type DlmsError =
  | { kind: 'hdlc'; message: string }
  | { kind: 'acse'; diagnostic: number; message: string }
  | { kind: 'cosem'; errorCode: number; message: string }
  | { kind: 'transport'; errorCode: number; message: string }
  | { kind: 'wasm'; message: string };

/**
 * Decodes an error string from the C layer. A `DLMS:<code>:<detail>` string
 * becomes a cosem, acse or transport error with the code's description;
 * anything else is reported as it came.
 */
export function parseDlmsError(raw: string): DlmsError {
  const match = raw.match(/^DLMS:(-?\d+):(.+)$/);
  if (!match) return { kind: 'wasm', message: raw || 'unknown WASM error' };

  const errorCode = parseInt(match[1], 10);
  const detail = match[2];
  const description = DLMS_ERROR_MESSAGES[errorCode];
  if (!description) {
    return { kind: 'wasm', message: `${detail} (error code: ${errorCode})` };
  }

  const message = `${description} (${detail})`;
  if (errorCode >= ACSE_ERROR_RANGE.min && errorCode <= ACSE_ERROR_RANGE.max) {
    return { kind: 'acse', diagnostic: errorCode - ACSE_ERROR_RANGE.min, message };
  }
  if (TRANSPORT_ERROR_RANGES.some((r) => errorCode >= r.min && errorCode <= r.max)) {
    return { kind: 'transport', errorCode, message };
  }
  return { kind: 'cosem', errorCode, message };
}

export class DlmsException extends Error {
  constructor(public readonly error: DlmsError) {
    super(error.message);
    this.name = 'DlmsException';
  }
}
