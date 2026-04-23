import { DlmsObject } from '../object.js';
import type { EmscriptenModule } from '../types.js';
import { DlmsException, ObjectType } from '../types.js';

export interface CaptureColumn {
  objectType: number;
  obis: string;
  attributeIndex: number;
}

export interface SortObject {
  objectType: number;
  obis: string;
  attributeIndex: number;
  dataIndex: number;
}

export const SORT_METHOD = {
  FIFO: 1,
  LIFO: 2,
  LARGEST: 3,
  SMALLEST: 4,
  NEAREST_TO_ZERO: 5,
  FURTHEST_FROM_ZERO: 6,
} as const;

export class ProfileGeneric {
  readonly inner: DlmsObject;
  private module: EmscriptenModule;

  constructor(module: EmscriptenModule, obis: string) {
    this.module = module;
    this.inner = new DlmsObject(module, ObjectType.PROFILE_GENERIC, obis);
  }

  get capturePeriod(): number {
    return this.inner.getInt(4);
  }

  get sortMethod(): number {
    return this.inner.getInt(5);
  }

  get entriesInUse(): number {
    return this.inner.getInt(7);
  }

  get profileEntries(): number {
    return this.inner.getInt(8);
  }

  getSortObject(): SortObject | null {
    const typePtr = this.module._malloc(4);
    const obisPtr = this.module._malloc(32);
    const attrPtr = this.module._malloc(4);
    const dataPtr = this.module._malloc(4);
    try {
      const ret = this.module.ccall(
        'dlms_pg_sort_object', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [this.inner.handle, typePtr, obisPtr, 32, attrPtr, dataPtr]
      ) as number;
      if (ret === 1) return null;
      if (ret !== 0) {
        const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
        throw new DlmsException({ kind: 'wasm', message: err });
      }
      return {
        objectType: this.module.getValue(typePtr, 'i32'),
        obis: this.module.UTF8ToString(obisPtr),
        attributeIndex: this.module.getValue(attrPtr, 'i32'),
        dataIndex: this.module.getValue(dataPtr, 'i32'),
      };
    } finally {
      this.module._free(typePtr);
      this.module._free(obisPtr);
      this.module._free(attrPtr);
      this.module._free(dataPtr);
    }
  }

  get rowCount(): number {
    return this.module.ccall(
      'dlms_pg_row_count', 'number',
      ['number'], [this.inner.handle]
    ) as number;
  }

  get columnCount(): number {
    return this.module.ccall(
      'dlms_pg_column_count', 'number',
      ['number'], [this.inner.handle]
    ) as number;
  }

  getCaptureColumn(col: number): CaptureColumn {
    const typePtr = this.module._malloc(4);
    const obisPtr = this.module._malloc(32);
    const attrPtr = this.module._malloc(4);
    try {
      const ret = this.module.ccall(
        'dlms_pg_capture_object', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [this.inner.handle, col, typePtr, obisPtr, 32, attrPtr]
      ) as number;
      if (ret !== 0) {
        const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
        throw new DlmsException({ kind: 'wasm', message: err });
      }
      return {
        objectType: this.module.getValue(typePtr, 'i32'),
        obis: this.module.UTF8ToString(obisPtr),
        attributeIndex: this.module.getValue(attrPtr, 'i32'),
      };
    } finally {
      this.module._free(typePtr);
      this.module._free(obisPtr);
      this.module._free(attrPtr);
    }
  }

  getCaptureColumns(): CaptureColumn[] {
    const cols: CaptureColumn[] = [];
    for (let i = 0; i < this.columnCount; i++) {
      cols.push(this.getCaptureColumn(i));
    }
    return cols;
  }

  getCellType(row: number, col: number): number {
    return this.module.ccall(
      'dlms_pg_cell_type', 'number',
      ['number', 'number', 'number'], [this.inner.handle, row, col]
    ) as number;
  }

  getCellDouble(row: number, col: number): number {
    return this.module.ccall(
      'dlms_pg_cell_double', 'number',
      ['number', 'number', 'number'], [this.inner.handle, row, col]
    ) as number;
  }

  getCellString(row: number, col: number): string {
    const bufPtr = this.module._malloc(256);
    try {
      const ret = this.module.ccall(
        'dlms_pg_cell_string', 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this.inner.handle, row, col, bufPtr, 256]
      ) as number;
      if (ret !== 0) {
        const err = this.module.ccall('dlms_last_error', 'string', [], []) as string;
        throw new DlmsException({ kind: 'wasm', message: err });
      }
      return this.module.UTF8ToString(bufPtr);
    } finally {
      this.module._free(bufPtr);
    }
  }

  free(): void {
    this.inner.free();
  }
}
