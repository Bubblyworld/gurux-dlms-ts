import { loadGuruxModule } from './module.js';
import { DlmsObject } from './object.js';
import type { EmscriptenModule } from './types.js';
import { DlmsException } from './types.js';

const OUT_BUF_SIZE = 8192;

export class DlmsServer {
  private module: EmscriptenModule;
  private handle: number;
  private freed = false;

  private constructor(module: EmscriptenModule, handle: number) {
    this.module = module;
    this.handle = handle;
  }

  getModule(): EmscriptenModule {
    return this.module;
  }

  static async create(existingModule?: EmscriptenModule): Promise<DlmsServer> {
    const module = existingModule ?? await loadGuruxModule();
    const handle = module.ccall(
      'dlms_server_create', 'number', [], []
    ) as number;
    if (handle < 0) {
      const err = module.ccall('dlms_last_error', 'string', [], []) as string;
      throw new DlmsException({ kind: 'wasm', message: err });
    }
    return new DlmsServer(module, handle);
  }

  addObject(obj: DlmsObject): void {
    this.ensureNotFreed();
    const ret = this.module.ccall(
      'dlms_server_add_object', 'number',
      ['number', 'number'], [this.handle, obj.handle]
    ) as number;
    if (ret !== 0) {
      const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
      throw new DlmsException({ kind: 'wasm', message: err });
    }
  }

  initialize(): void {
    this.ensureNotFreed();
    const ret = this.module.ccall(
      'dlms_server_initialize', 'number',
      ['number'], [this.handle]
    ) as number;
    if (ret !== 0) {
      const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
      throw new DlmsException({ kind: 'wasm', message: err });
    }
  }

  handleRequest(data: Uint8Array): Uint8Array {
    this.ensureNotFreed();
    const inPtr = this.module._malloc(data.length);
    const outPtr = this.module._malloc(OUT_BUF_SIZE);
    const lenPtr = this.module._malloc(4);
    this.module.setValue(lenPtr, OUT_BUF_SIZE, 'i32');
    try {
      this.module.HEAPU8.set(data, inPtr);
      const ret = this.module.ccall(
        'dlms_server_handle_request', 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this.handle, inPtr, data.length, outPtr, lenPtr]
      ) as number;
      if (ret !== 0) {
        const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
        throw new DlmsException({ kind: 'wasm', message: err });
      }
      const len = this.module.getValue(lenPtr, 'i32');
      return new Uint8Array(this.module.HEAPU8.buffer, outPtr, len).slice();
    } finally {
      this.module._free(inPtr);
      this.module._free(outPtr);
      this.module._free(lenPtr);
    }
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    this.module.ccall(
      'dlms_server_destroy', null,
      ['number'], [this.handle]
    );
  }

  private ensureNotFreed(): void {
    if (this.freed) throw new Error('DlmsServer has been freed');
  }
}
