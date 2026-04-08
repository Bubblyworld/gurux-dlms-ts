import { DlmsObject } from '../object.js';
import type { EmscriptenModule } from '../types.js';
import { ObjectType } from '../types.js';

export class Register {
  readonly inner: DlmsObject;

  constructor(
    module: EmscriptenModule,
    obis: string,
    objectType: ObjectType = ObjectType.REGISTER
  ) {
    this.inner = new DlmsObject(module, objectType, obis);
  }

  get value(): number {
    return this.inner.getDouble(2);
  }

  get scaler(): number {
    return this.inner.getInt(3) >> 8;
  }

  get unit(): number {
    return this.inner.getInt(3) & 0xff;
  }

  get scaledValue(): number {
    return this.value * Math.pow(10, this.scaler);
  }

  free(): void {
    this.inner.free();
  }
}
