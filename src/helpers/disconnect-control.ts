import { DlmsObject } from '../object.js';
import type { EmscriptenModule } from '../types.js';
import { ObjectType } from '../types.js';

export class DisconnectControl {
  readonly inner: DlmsObject;

  constructor(module: EmscriptenModule, obis: string) {
    this.inner = new DlmsObject(module, ObjectType.DISCONNECT_CONTROL, obis);
  }

  get outputState(): boolean {
    return this.inner.getInt(2) !== 0;
  }

  get controlState(): number {
    return this.inner.getInt(3);
  }

  get controlMode(): number {
    return this.inner.getInt(4);
  }

  set controlMode(value: number) {
    this.inner.setInt(4, value);
  }

  free(): void {
    this.inner.free();
  }
}
