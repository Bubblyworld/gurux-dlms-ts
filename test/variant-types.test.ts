import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsObject } from '../src/object.js';
import { DlmsException, ObjectType } from '../src/types.js';

const hex = (s: string) => new Uint8Array(Buffer.from(s.replace(/\s/g, ''), 'hex'));

/** Replies recorded from a Kamstrup Omnipower 1P at client 18, server 2064. */
const KAMSTRUP_OMNIPOWER = {
  ua: '7e a0 21 25 20 21 73 50 85 81 80 14 05 02 03 f2 06 02 03 f2 07 04 00 00 00 01 08 04 00 00 00 01 0a 75 7e',
  aare:
    '7e a0 43 25 20 21 30 f4 42 e6 e7 00 61 82 00 32 a1 09 06 07 60 85 74 05 08 01 01 a2 03 02 01 00 a3 05 a1 03 02 01 00 ' +
    '89 07 60 85 74 05 08 02 01 be 10 04 0e 08 00 06 5f 1f 04 00 00 b0 1d 03 ef 00 07 84 53 7e',

  /** GET.response for 0-0:96.1.0*255 attribute 2, a double-long-unsigned holding 36765667. */
  serialNumber: '7e a0 16 25 20 21 52 d6 51 e6 e7 00 c4 01 c1 00 06 02 30 ff e3 f0 8d 7e',
};

describe('variant types', () => {
  it('reads an integer value as its decimal string', async () => {
    const module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.96.1.0.255');
    obj.setInt(2, -36765667);
    expect(obj.getString(2)).toBe('-36765667');
    obj.free();
  });

  it('refuses to read an integer value as bytes', async () => {
    const module = await loadGuruxModule();
    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.96.1.0.255');
    obj.setInt(2, 36765667);
    expect(() => obj.getBytes(2)).toThrow(DlmsException);
    obj.free();
  });

  it('reads the unsigned serial number of a Kamstrup meter as its decimal string', async () => {
    const module = await loadGuruxModule();
    const client = await DlmsClient.create(
      { clientAddress: 18, serverAddress: 2064, password: '12345' },
      module,
    );

    client.snrmRequest();
    expect(client.getData(hex(KAMSTRUP_OMNIPOWER.ua)).complete).toBe(true);
    client.parseUaFromReply();
    client.aarqRequest();
    expect(client.getData(hex(KAMSTRUP_OMNIPOWER.aare)).complete).toBe(true);
    client.parseAareFromReply();

    const obj = new DlmsObject(module, ObjectType.DATA, '0.0.96.1.0.255');
    client.read(obj, 2);
    expect(client.getData(hex(KAMSTRUP_OMNIPOWER.serialNumber)).complete).toBe(true);
    client.updateValue(obj, 2, new Uint8Array(0));

    expect(obj.getString(2)).toBe('36765667');
    expect(() => obj.getBytes(2)).toThrow(DlmsException);

    obj.free();
    client.free();
  });
});
