import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('write operations', () => {
  async function setupSession(module: EmscriptenModule) {
    const server = await DlmsServer.create(module);
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );
    return { server, client };
  }

  function handshake(client: DlmsClient, server: DlmsServer) {
    const snrmFrames = client.snrmRequest();
    client.parseUaResponse(server.handleRequest(snrmFrames[0]));
    const aarqFrames = client.aarqRequest();
    client.parseAareResponse(server.handleRequest(aarqFrames[0]));
  }

  it('writes a register value and reads it back', async () => {
    const module = await loadGuruxModule();
    const { server, client } = await setupSession(module);

    const serverReg = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    serverReg.setInt(2, 0);
    server.addObject(serverReg);
    server.initialize();
    handshake(client, server);

    const clientReg = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
    clientReg.setInt(2, 9999);

    const writeFrames = client.write(clientReg, 2);
    expect(writeFrames.length).toBeGreaterThan(0);
    for (const frame of writeFrames) {
      const reply = server.handleRequest(frame);
      client.getData(reply);
    }

    const readFrames = client.read(clientReg, 2);
    const readReply = server.handleRequest(readFrames[0]);
    const result = client.getData(readReply);
    expect(result.complete).toBe(true);
    client.updateValue(clientReg, 2, new Uint8Array(0));
    expect(clientReg.getInt(2)).toBe(9999);

    clientReg.free();
    serverReg.free();
    client.free();
    server.free();
  });

  it('invokes a method on a disconnect control object', async () => {
    const module = await loadGuruxModule();
    const { server, client } = await setupSession(module);

    const serverDc = new DlmsObject(module, ObjectType.DISCONNECT_CONTROL, '0.0.96.3.10.255');
    server.addObject(serverDc);
    server.initialize();
    handshake(client, server);

    const clientDc = new DlmsObject(module, ObjectType.DISCONNECT_CONTROL, '0.0.96.3.10.255');

    const methodFrames = client.method(clientDc, 1);
    expect(methodFrames.length).toBeGreaterThan(0);

    for (const frame of methodFrames) {
      server.handleRequest(frame);
    }

    clientDc.free();
    serverDc.free();
    client.free();
    server.free();
  });
});
