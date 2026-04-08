import type { EmscriptenModule } from '../types.js';
import { ObjectType } from '../types.js';
import { Register } from './register.js';

export class ExtendedRegister extends Register {
  constructor(module: EmscriptenModule, obis: string) {
    super(module, obis, ObjectType.EXTENDED_REGISTER);
  }

  get status(): number {
    return this.inner.getInt(4);
  }

  get captureTime(): string {
    return this.inner.getString(5);
  }
}
