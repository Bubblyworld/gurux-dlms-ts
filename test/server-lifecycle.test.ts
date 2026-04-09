import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { ObjectType } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('server lifecycle', () => {
  it('can create, use, destroy, and re-create servers without corruption', async () => {
    const module = await loadGuruxModule();

    for (let round = 0; round < 5; round++) {
      const server = await DlmsServer.create(module);
      const client = await DlmsClient.create(
        { clientAddress: 16, serverAddress: 1, password: '00000000' },
        module,
      );

      const reg = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
      reg.setInt(2, round * 100);
      server.addObject(reg);
      server.initialize();

      const snrmFrames = client.snrmRequest();
      client.parseUaResponse(server.handleRequest(snrmFrames[0]));

      const aarqFrames = client.aarqRequest();
      client.parseAareResponse(server.handleRequest(aarqFrames[0]));

      const clientReg = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
      const readFrames = client.read(clientReg, 2);
      const readReply = server.handleRequest(readFrames[0]);
      const result = client.getData(readReply);
      expect(result.complete).toBe(true);
      client.updateValue(clientReg, 2, new Uint8Array(0));
      expect(clientReg.getInt(2)).toBe(round * 100);

      clientReg.free();
      reg.free();
      client.free();
      server.free();
    }
  });

  it('throws when accessing a freed server', async () => {
    const module = await loadGuruxModule();
    const server = await DlmsServer.create(module);
    server.free();
    expect(() => server.initialize()).toThrow('DlmsServer has been freed');
  });
});
