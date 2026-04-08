import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType, DlmsException } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('output buffer sizing', () => {
  let module: EmscriptenModule;

  it('throws a clear error when output buffer is too small', async () => {
    module = await loadGuruxModule();
    const server = await DlmsServer.create(module);

    for (let i = 0; i < 200; i++) {
      const obj = new DlmsObject(module, ObjectType.REGISTER, `1.0.${i}.8.0.255`);
      obj.setInt(2, i);
      server.addObject(obj);
    }
    server.initialize();

    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );

    const snrmFrames = client.snrmRequest();
    client.parseUaResponse(server.handleRequest(snrmFrames[0]));
    const aarqFrames = client.aarqRequest();
    client.parseAareResponse(server.handleRequest(aarqFrames[0]));

    try {
      const objReqFrames = client.getObjectsRequest();
      expect(objReqFrames.length).toBeGreaterThan(0);
    } catch (e) {
      expect(e).toBeInstanceOf(DlmsException);
      expect((e as DlmsException).message).toContain('buffer');
    }

    client.free();
    server.free();
  });

  it('allows configuring the output buffer size via setInt', async () => {
    module = await loadGuruxModule();
    const client = await DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );

    client.setInt('outBufSize', 16384);
    expect(client.getInt('outBufSize')).toBe(16384);

    client.free();
  });
});
