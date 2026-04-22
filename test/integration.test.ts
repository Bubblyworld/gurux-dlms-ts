import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType } from '../src/types.js';

describe('client-server integration', () => {
  it('performs a full SNRM → AARQ → read register → release → disconnect cycle', async () => {
    const module = await loadGuruxModule();
    const server = await DlmsServer.create(module);
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );

    const serverRegister = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    serverRegister.setInt(2, 1234);

    const clientRegister = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');

    server.addObject(serverRegister);
    server.initialize();

    // SNRM handshake
    const snrmFrames = client.snrmRequest();
    expect(snrmFrames.length).toBeGreaterThan(0);
    const snrmReply = server.handleRequest(snrmFrames[0]);
    expect(snrmReply.length).toBeGreaterThan(0);
    client.parseUaResponse(snrmReply);

    // AARQ handshake
    const aarqFrames = client.aarqRequest();
    expect(aarqFrames.length).toBeGreaterThan(0);
    const aarqReply = server.handleRequest(aarqFrames[0]);
    expect(aarqReply.length).toBeGreaterThan(0);
    client.parseAareResponse(aarqReply);

    // Read register attribute 2 (value)
    const readFrames = client.read(clientRegister, 2);
    expect(readFrames.length).toBeGreaterThan(0);
    const readReply = server.handleRequest(readFrames[0]);
    expect(readReply.length).toBeGreaterThan(0);

    const result = client.getData(readReply);
    expect(result.complete).toBe(true);

    client.updateValue(clientRegister, 2, new Uint8Array(0));
    expect(clientRegister.getInt(2)).toBe(1234);

    // Release
    const releaseFrames = client.releaseRequest();
    for (const frame of releaseFrames) {
      server.handleRequest(frame);
    }

    // Disconnect
    const disconnectFrames = client.disconnectRequest();
    for (const frame of disconnectFrames) {
      server.handleRequest(frame);
    }

    clientRegister.free();
    serverRegister.free();
    client.free();
    server.free();
  });

  it('drives getData() then parseUaFromReply / parseAareFromReply without double-advancing HDLC state', async () => {
    const module = await loadGuruxModule();
    const server = await DlmsServer.create(module);
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );

    const serverRegister = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    serverRegister.setInt(2, 1234);
    const clientRegister = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    server.addObject(serverRegister);
    server.initialize();

    // SNRM handshake via getData() + parseUaFromReply (simulates chunked delivery
    // by feeding the cumulative buffer one byte at a time to getData).
    const snrmFrames = client.snrmRequest();
    const snrmReply = server.handleRequest(snrmFrames[0]);
    const snrmAccum: number[] = [];
    let snrmComplete = false;
    for (const byte of snrmReply) {
      snrmAccum.push(byte);
      const result = client.getData(new Uint8Array(snrmAccum));
      if (result.complete) { snrmComplete = true; break; }
    }
    expect(snrmComplete).toBe(true);
    client.parseUaFromReply();

    // AARQ handshake via getData() + parseAareFromReply. This is the path that
    // failed when calling parseAareResponse on already-consumed state because
    // the I-frame sequence counter would get double-advanced.
    const aarqFrames = client.aarqRequest();
    const aarqReply = server.handleRequest(aarqFrames[0]);
    const aarqAccum: number[] = [];
    let aarqComplete = false;
    for (const byte of aarqReply) {
      aarqAccum.push(byte);
      const result = client.getData(new Uint8Array(aarqAccum));
      if (result.complete) { aarqComplete = true; break; }
    }
    expect(aarqComplete).toBe(true);
    client.parseAareFromReply();

    // Verify HDLC state is healthy: a subsequent register read has to succeed.
    const readFrames = client.read(clientRegister, 2);
    const readReply = server.handleRequest(readFrames[0]);
    const readResult = client.getData(readReply);
    expect(readResult.complete).toBe(true);
    client.updateValue(clientRegister, 2, new Uint8Array(0));
    expect(clientRegister.getInt(2)).toBe(1234);

    for (const frame of client.releaseRequest()) server.handleRequest(frame);
    for (const frame of client.disconnectRequest()) server.handleRequest(frame);

    clientRegister.free();
    serverRegister.free();
    client.free();
    server.free();
  });

  it('rejects parseUaFromReply / parseAareFromReply before getData() is complete', async () => {
    const module = await loadGuruxModule();
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );

    expect(() => client.parseUaFromReply()).toThrow(/no reply populated|not complete/);
    expect(() => client.parseAareFromReply()).toThrow(/no reply populated|not complete/);

    client.free();
  });
});
