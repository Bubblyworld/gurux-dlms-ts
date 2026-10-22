import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { DlmsErrorCode, DlmsException, ObjectType } from '../src/types.js';

/** CRC-16/X.25, as HDLC frames carry it. */
function crc(bytes: Uint8Array): number {
  let fcs = 0xffff;
  for (const b of bytes) {
    fcs ^= b;
    for (let i = 0; i < 8; i++) fcs = fcs & 1 ? (fcs >> 1) ^ 0x8408 : fcs >> 1;
  }
  return ~fcs & 0xffff;
}

/** A copy of the get-response frame `reply` with its invoke-id-and-priority byte passed through `edit`. */
function withInvokeByte(reply: Uint8Array, edit: (byte: number) => number): Uint8Array {
  const out = new Uint8Array(reply);
  const at = Buffer.from(out).indexOf(Buffer.from([0xe6, 0xe7, 0x00, 0xc4, 0x01])) + 5;
  out[at] = edit(out[at]);
  const fcs = crc(out.subarray(1, out.length - 3));
  out[out.length - 3] = fcs & 0xff;
  out[out.length - 2] = fcs >> 8;
  return out;
}

async function associated() {
  const module = await loadGuruxModule();
  const server = await DlmsServer.create(module);
  const client = await DlmsClient.create(
    { clientAddress: 16, serverAddress: 1, password: '00000000' },
    module,
  );
  client.setInt('autoIncreaseInvokeID', 1);

  const serverRegister = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
  serverRegister.setInt(2, 1234);
  server.addObject(serverRegister);
  server.initialize();

  client.parseUaResponse(server.handleRequest(client.snrmRequest()[0]));
  client.parseAareResponse(server.handleRequest(client.aarqRequest()[0]));

  const register = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
  const read = () => client.read(register, 2)[0];
  const free = () => {
    register.free();
    serverRegister.free();
    client.free();
    server.free();
  };
  return { client, server, read, register, free };
}

describe('invoke-id tracking', () => {
  it('advances the invoke id on every request and accepts the matching reply', async () => {
    const { client, server, read, register, free } = await associated();
    const first = client.getInt('invokeID');
    const reply1 = server.handleRequest(await read());
    expect(client.getInt('invokeID')).toBe((first + 1) & 0xf);
    expect(client.getData(reply1).complete).toBe(true);
    client.updateValue(register, 2, new Uint8Array(0));
    expect(register.getInt(2)).toBe(1234);

    const reply2 = server.handleRequest(await read());
    expect(client.getInt('invokeID')).toBe((first + 2) & 0xf);
    expect(client.getData(reply2).complete).toBe(true);
    free();
  });

  it('rejects a reply to an earlier request and still accepts the current one', async () => {
    const { client, server, read, register, free } = await associated();
    const stale = server.handleRequest(await read());
    expect(client.getData(stale).complete).toBe(true);

    const current = server.handleRequest(await read());
    let caught: unknown;
    try {
      client.getData(stale);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DlmsException);
    expect((caught as DlmsException).error).toMatchObject({
      kind: 'transport',
      errorCode: DlmsErrorCode.INVALID_INVOKE_ID,
    });

    expect(client.getData(current).complete).toBe(true);
    client.updateValue(register, 2, new Uint8Array(0));
    expect(register.getInt(2)).toBe(1234);
    free();
  });

  it('accepts a reply whose priority and service class bits differ from the request', async () => {
    const { client, server, read, register, free } = await associated();
    const reply = withInvokeByte(server.handleRequest(await read()), (b) => b & 0x0f);
    expect(client.getData(reply).complete).toBe(true);
    client.updateValue(register, 2, new Uint8Array(0));
    expect(register.getInt(2)).toBe(1234);
    free();
  });
});
