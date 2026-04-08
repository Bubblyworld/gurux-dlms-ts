import { DlmsObject } from '../object.js';
import type { EmscriptenModule } from '../types.js';
import { ObjectType } from '../types.js';

export class ProfileGeneric {
  readonly inner: DlmsObject;

  constructor(module: EmscriptenModule, obis: string) {
    this.inner = new DlmsObject(module, ObjectType.PROFILE_GENERIC, obis);
  }

  get capturePeriod(): number {
    return this.inner.getInt(4);
  }

  free(): void {
    this.inner.free();
  }
}
