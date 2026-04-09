import { normalizeObis } from './obis.js';
import type { EmscriptenModule } from './types.js';
import { DlmsException } from './types.js';

export class DlmsObject {
  private module: EmscriptenModule;
  private _handle: number;
  private freed = false;

  constructor(module: EmscriptenModule, objectType: number, obis: string) {
    this.module = module;
    const normalized = normalizeObis(obis);
    this._handle = module.ccall(
      'dlms_object_create', 'number',
      ['number', 'string'], [objectType, normalized]
    ) as number;
    if (this._handle < 0) {
      const err = module.ccall('dlms_last_error', 'string', [], []) as string;
      throw new DlmsException({ kind: 'wasm', message: err || 'dlms_object_create failed' });
    }
  }

  get handle(): number {
    this.ensureNotFreed();
    return this._handle;
  }

  getInt(attribute: number): number {
    this.ensureNotFreed();
    return this.module.ccall(
      'dlms_object_get_int', 'number',
      ['number', 'number'], [this._handle, attribute]
    ) as number;
  }

  getDouble(attribute: number): number {
    this.ensureNotFreed();
    return this.module.ccall(
      'dlms_object_get_double', 'number',
      ['number', 'number'], [this._handle, attribute]
    ) as number;
  }

  getString(attribute: number): string {
    this.ensureNotFreed();
    return this.module.ccall(
      'dlms_object_get_str', 'string',
      ['number', 'number'], [this._handle, attribute]
    ) as string;
  }

  getBytes(attribute: number): Uint8Array {
    this.ensureNotFreed();
    const bufSize = 65536;
    const outPtr = this.module._malloc(bufSize);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, bufSize, 'i32');
    try {
      const ret = this.module.ccall(
        'dlms_object_get_bytes', 'number',
        ['number', 'number', 'number', 'number'],
        [this._handle, attribute, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) {
        const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
        throw new DlmsException({ kind: 'wasm', message: err });
      }
      const len = this.module.getValue(lenPtr, 'i32');
      return new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
    } finally {
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  setInt(attribute: number, value: number): void {
    this.ensureNotFreed();
    this.module.ccall(
      'dlms_object_set_int', null,
      ['number', 'number', 'number'], [this._handle, attribute, value]
    );
  }

  setDouble(attribute: number, value: number): void {
    this.ensureNotFreed();
    this.module.ccall(
      'dlms_object_set_double', null,
      ['number', 'number', 'number'], [this._handle, attribute, value]
    );
  }

  setString(attribute: number, value: string): void {
    this.ensureNotFreed();
    if (value.length > 65535) {
      throw new DlmsException({ kind: 'wasm', message: `string length ${value.length} exceeds maximum of 65535` });
    }
    this.module.ccall(
      'dlms_object_set_str', null,
      ['number', 'number', 'string'], [this._handle, attribute, value]
    );
  }

  setBytes(attribute: number, data: Uint8Array): void {
    this.ensureNotFreed();
    if (data.length > 65535) {
      throw new DlmsException({ kind: 'wasm', message: `data length ${data.length} exceeds maximum of 65535` });
    }
    const ptr = this.module._malloc(data.length);
    try {
      this.module.HEAPU8.set(data, ptr);
      this.module.ccall(
        'dlms_object_set_bytes', null,
        ['number', 'number', 'number', 'number'],
        [this._handle, attribute, ptr, data.length]
      );
    } finally {
      this.module._free(ptr);
    }
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    this.module.ccall(
      'dlms_object_destroy', null,
      ['number'], [this._handle]
    );
  }

  private ensureNotFreed(): void {
    if (this.freed) throw new Error('DlmsObject has been freed');
  }
}
