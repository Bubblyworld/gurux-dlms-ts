import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('object lifecycle', () => {
  let module: EmscriptenModule;

  it('can create and destroy objects repeatedly without exhausting slots', async () => {
    module = await loadGuruxModule();
    for (let i = 0; i < 300; i++) {
      const obj = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
      obj.setInt(2, i);
      expect(obj.getInt(2)).toBe(i);
      obj.free();
    }
  });

  it('throws when accessing a freed object', async () => {
    module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    obj.free();
    expect(() => obj.getInt(2)).toThrow('DlmsObject has been freed');
  });

  it('handles string values through create/destroy cycles', async () => {
    module = await loadGuruxModule();
    for (let i = 0; i < 50; i++) {
      const obj = new DlmsObject(module, ObjectType.DATA, '0.0.42.0.0.255');
      obj.setString(2, `test-value-${i}`);
      expect(obj.getString(2)).toBe(`test-value-${i}`);
      obj.free();
    }
  });
});
