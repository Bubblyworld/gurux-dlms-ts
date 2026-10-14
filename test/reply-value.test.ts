import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsObject } from '../src/object.js';
import { ExtendedRegister } from '../src/helpers/index.js';
import { ObjectType } from '../src/types.js';
import { valueDateTime, valueNumber, valueObis } from '../src/value.js';
import type { DlmsValue } from '../src/value.js';

const hex = (s: string) => new Uint8Array(Buffer.from(s.replace(/\s/g, ''), 'hex'));

/** UA and AARE recorded from a Kamstrup Omnipower 1P at client 18, server 2064. */
const UA =
  '7e a0 21 25 20 21 73 50 85 81 80 14 05 02 03 f2 06 02 03 f2 07 04 00 00 00 01 08 04 00 00 00 01 0a 75 7e';
const AARE =
  '7e a0 43 25 20 21 30 f4 42 e6 e7 00 61 82 00 32 a1 09 06 07 60 85 74 05 08 01 01 a2 03 02 01 00 a3 05 a1 03 02 01 00 ' +
  '89 07 60 85 74 05 08 02 01 be 10 04 0e 08 00 06 5f 1f 04 00 00 b0 1d 03 ef 00 07 84 53 7e';

/** CRC-16/X.25, as HDLC frames carry it. */
function crc(bytes: Uint8Array): number {
  let fcs = 0xffff;
  for (const b of bytes) {
    fcs ^= b;
    for (let i = 0; i < 8; i++) fcs = fcs & 1 ? (fcs >> 1) ^ 0x8408 : fcs >> 1;
  }
  return ~fcs & 0xffff;
}

/** An I-frame from the meter to the client carrying `apdu` behind the LLC header. */
function frame(apdu: string): Uint8Array {
  const info = hex(`e6e700${apdu}`);
  const length = 2 + 4 + 2 + info.length + 2;
  const header = new Uint8Array([0xa0 | (length >> 8), length & 0xff, 0x25, 0x20, 0x21, 0x52]);
  const hcs = crc(header);
  const body = new Uint8Array([...header, hcs & 0xff, hcs >> 8, ...info]);
  const fcs = crc(body);
  return new Uint8Array([0x7e, ...body, fcs & 0xff, fcs >> 8, 0x7e]);
}

async function associated() {
  const module = await loadGuruxModule();
  const client = await DlmsClient.create(
    { clientAddress: 18, serverAddress: 2064, password: '12345' },
    module,
  );
  client.snrmRequest();
  client.getData(hex(UA));
  client.parseUaFromReply();
  client.aarqRequest();
  client.getData(hex(AARE));
  client.parseAareFromReply();
  return { module, client };
}

describe('reply values', () => {
  it('reads a length-prefixed BCD maximum demand as a number', async () => {
    const { module, client } = await associated();
    const reg = new ExtendedRegister(module, '1.0.1.6.0.255');

    client.read(reg.inner, 2);
    expect(client.getData(frame('c401c1000d0401407240')).complete).toBe(true);
    expect(valueNumber(client.getReplyValue())).toBe(1407240);
    client.updateValue(reg.inner, 2, new Uint8Array(0));
    expect(reg.value).toBe(1407240);

    reg.free();
    client.free();
  });

  it('decodes profile rows sent over several data blocks whatever their columns', async () => {
    const { module, client } = await associated();
    const pg = new DlmsObject(module, ObjectType.PROFILE_GENERIC, '0.0.99.98.0.255');

    // Two rows of (clock as a 12-byte octet string, event code), split into two blocks.
    const row = (minute: string, code: string) =>
      `0202 090c 07ea0a0eff0f${minute}00ff800000 11${code}`;
    const data = `0102${row('1e', '29')}${row('2d', 'd4')}`.replace(/\s/g, '');
    const half = data.length / 2;
    const block = (n: number, last: boolean, part: string) =>
      `c402c1${last ? 'ff' : '00'}${n.toString(16).padStart(8, '0')}00${(part.length / 2).toString(16).padStart(2, '0')}${part}`;

    client.read(pg, 2);
    const first = client.getData(frame(block(1, false, data.slice(0, half))));
    expect(first.complete).toBe(true);
    expect(first.moreData).not.toBe(0);
    client.receiverReady(first.moreData);
    expect(client.getData(frame(block(2, true, data.slice(half)))).complete).toBe(true);

    const rows = client.getReplyValue();
    if (rows.type !== 'array') throw new Error(`expected an array, got ${rows.type}`);
    expect(rows.items).toHaveLength(2);
    const cells = (r: DlmsValue) => (r.type === 'structure' ? r.items : []);
    expect(valueDateTime(cells(rows.items[1])[0])).toMatchObject({
      year: 2026,
      month: 10,
      day: 14,
      hour: 15,
      minute: 45,
    });
    expect(rows.items.map((r) => valueNumber(cells(r)[1]))).toEqual([0x29, 0xd4]);

    pg.free();
    client.free();
  });

  it('reads a logical name from a capture object definition', async () => {
    const { module, client } = await associated();
    const pg = new DlmsObject(module, ObjectType.PROFILE_GENERIC, '0.0.98.1.0.255');

    client.read(pg, 3);
    client.getData(frame('c401c1000101020412000809060000010000ff0f02120000'));
    const columns = client.getReplyValue();
    if (columns.type !== 'array' || columns.items[0].type !== 'structure') {
      throw new Error('expected an array of structures');
    }
    expect(valueObis(columns.items[0].items[1])).toBe('0.0.1.0.0.255');

    pg.free();
    client.free();
  });
});
