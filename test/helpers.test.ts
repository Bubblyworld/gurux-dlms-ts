import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';
import { DlmsServer } from '../src/server.js';
import { DlmsObject } from '../src/object.js';
import { Register, Clock, DisconnectControl } from '../src/helpers/index.js';
import { ObjectType } from '../src/types.js';
import type { EmscriptenModule } from '../src/types.js';

describe('helper classes', () => {
  let module: EmscriptenModule;

  async function setupConnectedPair() {
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

  describe('Register', () => {
    it('exposes value, scaler, and unit', async () => {
      module = await loadGuruxModule();
      const reg = new Register(module, '1.0.1.8.0.255');
      reg.inner.setDouble(2, 123.456);
      reg.inner.setInt(3, (0xFE << 8) | 30);

      expect(reg.value).toBeCloseTo(123.456);
      expect(reg.scaler).toBe(-2);
      expect(reg.unit).toBe(30);
      expect(reg.scaledValue).toBeCloseTo(123.456 * 0.01);
      reg.free();
    });
  });

  describe('Clock', () => {
    it('returns a non-empty time string after reading from server', async () => {
      module = await loadGuruxModule();
      const { server, client } = await setupConnectedPair();

      const serverClock = new DlmsObject(module, ObjectType.CLOCK, '0.0.1.0.0.255');
      server.addObject(serverClock);
      server.initialize();
      handshake(client, server);

      const clock = new Clock(module, '0.0.1.0.0.255');

      const readFrames = client.read(clock.inner, 2);
      const readReply = server.handleRequest(readFrames[0]);
      const result = client.getData(readReply);
      expect(result.complete).toBe(true);
      client.updateValue(clock.inner, 2, new Uint8Array(0));

      const time = clock.time;
      expect(typeof time).toBe('string');
      expect(time.length).toBeGreaterThan(0);

      clock.free();
      serverClock.free();
      client.free();
      server.free();
    });
  });

  describe('DisconnectControl', () => {
    it('exposes outputState, controlState, and controlMode', async () => {
      module = await loadGuruxModule();
      const dc = new DisconnectControl(module, '0.0.96.3.10.255');
      dc.inner.setInt(2, 1);
      dc.inner.setInt(3, 2);
      dc.controlMode = 3;

      expect(dc.outputState).toBe(true);
      expect(dc.controlState).toBe(2);
      expect(dc.controlMode).toBe(3);
      dc.free();
    });
  });
});
