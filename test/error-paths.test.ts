import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType, DlmsException } from '../src/types.js';

describe('error paths', () => {
  it('accepts malformed OBIS without throwing (Gurux does not validate)', async () => {
    const module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.REGISTER, 'not.an.obis');
    obj.free();
  });

  it('throws DlmsException for invalid object type', async () => {
    const module = await loadGuruxModule();
    expect(() => new DlmsObject(module, 9999, '1.0.1.8.0.255')).toThrow(DlmsException);
  });

  it('throws when reading from a freed client', async () => {
    const module = await loadGuruxModule();
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );
    const obj = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    client.free();
    expect(() => client.read(obj, 2)).toThrow('DlmsClient has been freed');
    obj.free();
  });

  it('throws when double-freeing a client is safe (no-op)', async () => {
    const module = await loadGuruxModule();
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );
    client.free();
    expect(() => client.free()).not.toThrow();
  });

  it('exhausts object slots and gets a clear error', async () => {
    const module = await loadGuruxModule();
    const objects: DlmsObject[] = [];
    let exhausted = false;

    try {
      for (let i = 0; i < 260; i++) {
        objects.push(new DlmsObject(module, ObjectType.DATA, `0.0.${i % 256}.0.0.255`));
      }
    } catch (e) {
      exhausted = true;
      expect(e).toBeInstanceOf(DlmsException);
      expect((e as DlmsException).message).toContain('slot');
    }

    expect(exhausted).toBe(true);

    for (const obj of objects) {
      obj.free();
    }
  });
});
