import { DlmsObject } from '../object.js';
import type { EmscriptenModule } from '../types.js';
import { ObjectType } from '../types.js';

export class Clock {
  readonly inner: DlmsObject;

  constructor(module: EmscriptenModule, obis: string) {
    this.inner = new DlmsObject(module, ObjectType.CLOCK, obis);
  }

  get time(): string {
    return this.inner.getString(2);
  }

  get status(): number {
    return this.inner.getInt(3);
  }

  get timezone(): number {
    return this.inner.getInt(4);
  }

  free(): void {
    this.inner.free();
  }
}
