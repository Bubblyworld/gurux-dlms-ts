import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType, DlmsException } from '../src/types.js';
import { normalizeObis } from '../src/obis.js';

describe('OBIS normalization', () => {
  it('accepts dot-separated format', () => {
    expect(normalizeObis('1.0.1.8.0.255')).toBe('1.0.1.8.0.255');
  });

  it('accepts IEC 62056-61 display format', () => {
    expect(normalizeObis('1-0:1.8.0*255')).toBe('1.0.1.8.0.255');
  });

  it('normalizes IEC format to dot-separated', () => {
    expect(normalizeObis('0-0:96.1.0*255')).toBe('0.0.96.1.0.255');
  });

  it('throws on malformed OBIS string', () => {
    expect(() => normalizeObis('not.an.obis')).toThrow(DlmsException);
    expect(() => normalizeObis('not.an.obis')).toThrow(/invalid OBIS code/);
  });

  it('throws on empty string', () => {
    expect(() => normalizeObis('')).toThrow(DlmsException);
  });

  it('throws on out-of-range OBIS group', () => {
    expect(() => normalizeObis('1.0.256.8.0.255')).toThrow(/out of range/);
  });

  it('throws on out-of-range IEC format', () => {
    expect(() => normalizeObis('1-0:256.8.0*255')).toThrow(/out of range/);
  });

  it('throws on negative values', () => {
    expect(() => normalizeObis('-1.0.1.8.0.255')).toThrow(DlmsException);
  });
});

describe('OBIS in DlmsObject', () => {
  it('creates object with dot-separated OBIS', async () => {
    const module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    expect(obj.getString(1)).toBe('1.0.1.8.0.255');
    obj.free();
  });

  it('creates object with IEC display format OBIS', async () => {
    const module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.REGISTER, '1-0:1.8.0*255');
    expect(obj.getString(1)).toBe('1.0.1.8.0.255');
    obj.free();
  });

  it('throws on malformed OBIS before reaching C layer', async () => {
    const module = await loadGuruxModule();
    expect(() => new DlmsObject(module, ObjectType.REGISTER, 'not.an.obis')).toThrow(DlmsException);
  });
});

describe('error paths', () => {
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
