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

  /** Association/authentication errors (ACSE layer, codes 273-280) */
  REJECTED_PERMANENT = 273,
  REJECTED_TRANSIENT = 274,
  NO_REASON_GIVEN = 275,
  APPLICATION_CONTEXT_NAME_NOT_SUPPORTED = 276,
  AUTHENTICATION_MECHANISM_NAME_NOT_RECOGNISED = 277,
  AUTHENTICATION_MECHANISM_NAME_REQUIRED = 278,
  AUTHENTICATION_FAILURE = 279,
  AUTHENTICATION_REQUIRED = 280,
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
};

export const ACSE_ERROR_RANGE = { min: 273, max: 280 };

export type DlmsError =
  | { kind: 'hdlc'; message: string }
  | { kind: 'acse'; diagnostic: number; message: string }
  | { kind: 'cosem'; errorCode: number; message: string }
  | { kind: 'wasm'; message: string };

export class DlmsException extends Error {
  constructor(public readonly error: DlmsError) {
    super(error.message);
    this.name = 'DlmsException';
  }
}
