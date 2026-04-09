import { loadGuruxModule } from './module.js';
import { DlmsObject } from './object.js';
import type { EmscriptenModule, ClientOptions, GetDataResult, AssociationEntry } from './types.js';
import { DlmsException, InterfaceType, DLMS_ERROR_MESSAGES } from './types.js';

const DEFAULT_OUT_BUF_SIZE = 8192;

export class DlmsClient {
  private module: EmscriptenModule;
  private _handle: number;
  private freed = false;

  private constructor(module: EmscriptenModule, handle: number) {
    this.module = module;
    this._handle = handle;
  }

  getModule(): EmscriptenModule {
    return this.module;
  }

  static async create(opts: ClientOptions, existingModule?: EmscriptenModule): Promise<DlmsClient> {
    const module = existingModule ?? await loadGuruxModule();
    const handle = module.ccall(
      'dlms_client_create', 'number',
      ['number', 'number', 'string', 'number'],
      [
        opts.clientAddress,
        opts.serverAddress,
        opts.password ?? '00000000',
        opts.interfaceType ?? InterfaceType.HDLC,
      ]
    ) as number;
    if (handle < 0) {
      const err = module.ccall('dlms_last_error', 'string', [], []) as string;
      throw new DlmsException({ kind: 'wasm', message: err });
    }
    return new DlmsClient(module, handle);
  }

  setInt(setting: string, value: number): void {
    this.ensureNotFreed();
    this.module.ccall(
      'dlms_client_set_int', null,
      ['number', 'string', 'number'], [this._handle, setting, value]
    );
  }

  setStr(setting: string, value: string): void {
    this.ensureNotFreed();
    this.module.ccall(
      'dlms_client_set_str', null,
      ['number', 'string', 'string'], [this._handle, setting, value]
    );
  }

  getInt(setting: string): number {
    this.ensureNotFreed();
    return this.module.ccall(
      'dlms_client_get_int', 'number',
      ['number', 'string'], [this._handle, setting]
    ) as number;
  }

  snrmRequest(): Uint8Array[] {
    return this.callFrameMethod('dlms_client_snrm_request');
  }

  parseUaResponse(data: Uint8Array): void {
    this.callParseMethod('dlms_client_parse_ua', data);
  }

  aarqRequest(): Uint8Array[] {
    return this.callFrameMethod('dlms_client_aarq_request');
  }

  parseAareResponse(data: Uint8Array): void {
    this.callParseMethod('dlms_client_parse_aare', data);
  }

  releaseRequest(): Uint8Array[] {
    return this.callFrameMethod('dlms_client_release_request');
  }

  disconnectRequest(): Uint8Array[] {
    return this.callFrameMethod('dlms_client_disconnect_request');
  }

  getData(data: Uint8Array): GetDataResult {
    this.ensureNotFreed();
    const dataPtr = this.module._malloc(data.length);
    const completePtr = this.module._malloc(4);
    const moreDataPtr = this.module._malloc(4);
    try {
      this.module.HEAPU8.set(data, dataPtr);
      const ret = this.module.ccall(
        'dlms_client_get_data', 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this._handle, dataPtr, data.length, completePtr, moreDataPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      return {
        complete: this.module.getValue(completePtr, 'i32') !== 0,
        moreData: this.module.getValue(moreDataPtr, 'i32'),
      };
    } finally {
      this.module._free(dataPtr);
      this.module._free(completePtr);
      this.module._free(moreDataPtr);
    }
  }

  receiverReady(type: number): Uint8Array[] {
    this.ensureNotFreed();
    const outPtr = this.module._malloc(this.outBufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, this.outBufSize, 'i32');
    try {
      const ret = this.module.ccall(
        'dlms_client_receiver_ready', 'number',
        ['number', 'number', 'number', 'number'],
        [this._handle, type, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      const len = this.module.getValue(lenPtr, 'i32');
      const raw = new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
      return this.splitFrames(raw);
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  read(obj: DlmsObject, attribute: number): Uint8Array[] {
    return this.callObjectFrameMethod('dlms_client_read', obj, attribute);
  }

  write(obj: DlmsObject, attribute: number): Uint8Array[] {
    return this.callObjectFrameMethod('dlms_client_write', obj, attribute);
  }

  method(obj: DlmsObject, methodIndex: number, params?: Uint8Array): Uint8Array[] {
    this.ensureNotFreed();
    const outPtr = this.module._malloc(this.outBufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, this.outBufSize, 'i32');
    let paramsPtr = 0;
    try {
      if (params && params.length > 0) {
        paramsPtr = this.module._malloc(params.length);
        this.module.HEAPU8.set(params, paramsPtr);
      }
      const ret = this.module.ccall(
        'dlms_client_method', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [this._handle, obj.handle, methodIndex, paramsPtr, params?.length ?? 0, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      const len = this.module.getValue(lenPtr, 'i32');
      const raw = new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
      return this.splitFrames(raw);
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
      if (paramsPtr) this.module._free(paramsPtr);
    }
  }

  updateValue(obj: DlmsObject, attribute: number, replyData: Uint8Array): void {
    this.ensureNotFreed();
    const ptr = this.module._malloc(replyData.length);
    try {
      this.module.HEAPU8.set(replyData, ptr);
      const ret = this.module.ccall(
        'dlms_client_update_value', 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this._handle, obj.handle, attribute, ptr, replyData.length]
      ) as number;
      if (ret !== 0) this.throwError();
    } finally {
      this.module._free(ptr);
    }
  }

  readByRange(obj: DlmsObject, start: Date, end: Date): Uint8Array[] {
    this.ensureNotFreed();
    const outPtr = this.module._malloc(this.outBufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, this.outBufSize, 'i32');
    try {
      const ret = this.module.ccall(
        'dlms_client_read_by_range', 'number',
        ['number', 'number', 'string', 'string', 'number', 'number'],
        [this._handle, obj.handle, start.toISOString(), end.toISOString(), outPtr, lenPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      const len = this.module.getValue(lenPtr, 'i32');
      const raw = new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
      return this.splitFrames(raw);
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  getObjectsRequest(): Uint8Array[] {
    return this.callFrameMethod('dlms_client_get_objects_request');
  }

  parseObjects(data: Uint8Array): AssociationEntry[] {
    this.ensureNotFreed();
    const ptr = this.module._malloc(data.length);
    try {
      this.module.HEAPU8.set(data, ptr);
      const ret = this.module.ccall(
        'dlms_client_parse_objects', 'number',
        ['number', 'number', 'number'], [this._handle, ptr, data.length]
      ) as number;
      if (ret !== 0) this.throwError();
    } finally {
      this.module._free(ptr);
    }

    const count = this.module.ccall(
      'dlms_client_get_parsed_object_count', 'number',
      ['number'], [this._handle]
    ) as number;

    const entries: AssociationEntry[] = [];
    const typePtr = this.module._malloc(4);
    const obisPtr = this.module._malloc(32);
    try {
      for (let i = 0; i < count; i++) {
        const objRet = this.module.ccall(
          'dlms_client_get_parsed_object', 'number',
          ['number', 'number', 'number', 'number', 'number'],
          [this._handle, i, typePtr, obisPtr, 32]
        ) as number;
        if (objRet !== 0) this.throwError();
        entries.push({
          type: this.module.getValue(typePtr, 'i32'),
          obis: this.module.UTF8ToString(obisPtr),
        });
      }
    } finally {
      this.module._free(typePtr);
      this.module._free(obisPtr);
    }
    return entries;
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    this.module.ccall(
      'dlms_client_destroy', null,
      ['number'], [this._handle]
    );
  }

  splitFrames(data: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = 0;
    while (offset < data.length) {
      if (offset + 4 > data.length) {
        throw new DlmsException({ kind: 'wasm', message: `truncated frame header at offset ${offset}: need 4 bytes, have ${data.length - offset}` });
      }
      const len = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
      offset += 4;
      if (offset + len > data.length) {
        throw new DlmsException({ kind: 'wasm', message: `truncated frame data at offset ${offset}: need ${len} bytes, have ${data.length - offset}` });
      }
      frames.push(data.slice(offset, offset + len));
      offset += len;
    }
    return frames;
  }

  private callFrameMethod(name: string): Uint8Array[] {
    this.ensureNotFreed();
    const outPtr = this.module._malloc(this.outBufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, this.outBufSize, 'i32');
    try {
      const ret = this.module.ccall(
        name, 'number',
        ['number', 'number', 'number'], [this._handle, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      const len = this.module.getValue(lenPtr, 'i32');
      const raw = new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
      return this.splitFrames(raw);
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  private callParseMethod(name: string, data: Uint8Array): void {
    this.ensureNotFreed();
    const ptr = this.module._malloc(data.length);
    try {
      this.module.HEAPU8.set(data, ptr);
      const ret = this.module.ccall(
        name, 'number',
        ['number', 'number', 'number'], [this._handle, ptr, data.length]
      ) as number;
      if (ret !== 0) this.throwError();
    } finally {
      this.module._free(ptr);
    }
  }

  private callObjectFrameMethod(name: string, obj: DlmsObject, attribute: number): Uint8Array[] {
    this.ensureNotFreed();
    const outPtr = this.module._malloc(this.outBufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, this.outBufSize, 'i32');
    try {
      const ret = this.module.ccall(
        name, 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this._handle, obj.handle, attribute, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) this.throwError();
      const len = this.module.getValue(lenPtr, 'i32');
      const raw = new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
      return this.splitFrames(raw);
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  private get outBufSize(): number {
    return this.getInt('outBufSize') || DEFAULT_OUT_BUF_SIZE;
  }

  private throwError(): never {
    const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
    if (!err) {
      throw new DlmsException({ kind: 'wasm', message: 'unknown WASM error' });
    }

    const dlmsMatch = err.match(/^DLMS:(-?\d+):(.+)$/);
    if (dlmsMatch) {
      const errorCode = parseInt(dlmsMatch[1], 10);
      const detail = dlmsMatch[2];
      const humanMessage = DLMS_ERROR_MESSAGES[errorCode];
      if (humanMessage) {
        throw new DlmsException({
          kind: 'cosem',
          errorCode,
          message: `${humanMessage} (${detail})`,
        });
      }
      throw new DlmsException({ kind: 'wasm', message: `${detail} (error code: ${errorCode})` });
    }

    throw new DlmsException({ kind: 'wasm', message: err });
  }

  private ensureNotFreed(): void {
    if (this.freed) throw new Error('DlmsClient has been freed');
  }
}
