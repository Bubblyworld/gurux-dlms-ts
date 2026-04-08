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
