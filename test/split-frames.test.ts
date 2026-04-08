import { describe, it, expect } from 'vitest';
import { loadGuruxModule } from '../src/module.js';
import { DlmsClient } from '../src/client.js';

describe('splitFrames', () => {
  let client: DlmsClient;

  async function createClient(): Promise<DlmsClient> {
    const module = await loadGuruxModule();
    return DlmsClient.create(
      { clientAddress: 16, serverAddress: 1, password: '00000000' },
      module,
    );
  }

  it('parses a single well-formed frame', async () => {
    client = await createClient();
    const data = new Uint8Array([0, 0, 0, 3, 0xAA, 0xBB, 0xCC]);
    const frames = client.splitFrames(data);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC]));
    client.free();
  });

  it('parses multiple well-formed frames', async () => {
    client = await createClient();
    const data = new Uint8Array([
      0, 0, 0, 2, 0xAA, 0xBB,
      0, 0, 0, 1, 0xCC,
    ]);
    const frames = client.splitFrames(data);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual(new Uint8Array([0xAA, 0xBB]));
    expect(frames[1]).toEqual(new Uint8Array([0xCC]));
    client.free();
  });

  it('returns empty array for empty input', async () => {
    client = await createClient();
    const frames = client.splitFrames(new Uint8Array(0));
    expect(frames).toHaveLength(0);
    client.free();
  });

  it('throws on truncated length prefix (less than 4 bytes remaining)', async () => {
    client = await createClient();
    const data = new Uint8Array([0, 0, 3]);
    expect(() => client.splitFrames(data)).toThrow();
    client.free();
  });

  it('throws when length prefix points past end of buffer', async () => {
    client = await createClient();
    const data = new Uint8Array([0, 0, 0, 10, 0xAA, 0xBB]);
    expect(() => client.splitFrames(data)).toThrow();
    client.free();
  });

  it('throws when second frame has truncated data', async () => {
    client = await createClient();
    const data = new Uint8Array([
      0, 0, 0, 1, 0xAA,
      0, 0, 0, 5, 0xBB,
    ]);
    expect(() => client.splitFrames(data)).toThrow();
    client.free();
  });
});
