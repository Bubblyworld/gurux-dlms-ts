import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('large data handling', () => {
  let module: EmscriptenModule;

  it('rejects byte data exceeding 65535 bytes in setBytes', async () => {
    module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.42.0.0.255');
    const largeData = new Uint8Array(70000);
    expect(() => obj.setBytes(2, largeData)).toThrow();
    obj.free();
  });

  it('rejects string data exceeding 65535 bytes in setString', async () => {
    module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.42.0.0.255');
    const largeStr = 'x'.repeat(70000);
    expect(() => obj.setString(2, largeStr)).toThrow();
    obj.free();
  });

  it('accepts byte data at the 65535 boundary', async () => {
    module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.42.0.0.255');
    const data = new Uint8Array(65535);
    data.fill(0xAB);
    expect(() => obj.setBytes(2, data)).not.toThrow();
    obj.free();
  });
});
