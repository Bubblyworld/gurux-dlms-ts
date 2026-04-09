# gurux-dlms-ts

[WASM](https://webassembly.org/) build of [GuruxDLMS.c](https://github.com/Gurux/GuruxDLMS.c) with TypeScript bindings. Provides a low-level DLMS/COSEM protocol codec for communicating with smart meters. Runs in both node and browser environments with zero runtime dependencies.

The library is a codec, not I/O — you feed it bytes and it produces DLMS frames. How those frames reach the meter (TCP socket, serial port, etc.) is up to you.

## Installation

```bash
npm install @bubblyworld/gurux-dlms-ts
```

## Quick Start

```typescript
import { DlmsClient, Register } from '@bubblyworld/gurux-dlms-ts';

const client = await DlmsClient.create({
  clientAddress: 1,
  serverAddress: 25348,
  password: '00000000',
});

// HDLC handshake — send frames to the meter and collect responses.
client.parseUaResponse(await sendAndReceive(client.snrmRequest()));
client.parseAareResponse(await sendAndReceive(client.aarqRequest()));

// Read active energy import (P1).
const register = new Register(client.getModule(), '1-0:1.8.0*255');
await readAttr(client, register.inner, 2); // value
await readAttr(client, register.inner, 3); // scaler + unit

console.log(register.scaledValue); // e.g. 11878.14 kWh
console.log(register.scaler);     // e.g. 1 (×10^1)
console.log(register.unit);       // e.g. 30 (Wh)

register.free();
await sendAndReceive(client.releaseRequest());
await sendAndReceive(client.disconnectRequest());
client.free();
```

The `sendAndReceive` and `readAttr` functions are your transport layer — see the examples below for TCP implementations.

## OBIS Codes

Both IEC 62056-61 display format (`1-0:1.8.0*255`) and dot-separated format (`1.0.1.8.0.255`) are accepted everywhere. Invalid OBIS codes throw immediately instead of silently producing `0.0.0.0.0.0`.

```typescript
import { normalizeObis } from '@bubblyworld/gurux-dlms-ts';

normalizeObis('1-0:1.8.0*255'); // '1.0.1.8.0.255'
normalizeObis('bad.obis');       // throws DlmsException
```

## Reading Registers

```typescript
import { DlmsClient, Register, Clock, DisconnectControl } from '@bubblyworld/gurux-dlms-ts';

// Energy register — read attrs 2 (value) and 3 (scaler/unit).
const register = new Register(client.getModule(), '1-0:1.8.0*255');
await readAttr(client, register.inner, 2);
await readAttr(client, register.inner, 3);
console.log(register.scaledValue); // value × 10^scaler

// Meter clock — read attr 2.
const clock = new Clock(client.getModule(), '0-0:1.0.0*255');
await readAttr(client, clock.inner, 2);
console.log(clock.time); // "04/09/2026 07:34:00"

// Disconnect control (relay) — read attrs 2, 3, 4.
const relay = new DisconnectControl(client.getModule(), '0-0:96.3.10*255');
await readAttr(client, relay.inner, 2);
await readAttr(client, relay.inner, 3);
await readAttr(client, relay.inner, 4);
console.log(relay.outputState);  // true = connected
console.log(relay.controlState); // 0=disconnected, 1=connected, 2=ready
console.log(relay.controlMode);  // 0-6, meter-specific
```

## Relay Switching

Use the `method` call on a DisconnectControl object. Method 1 = remote disconnect, method 2 = remote reconnect:

```typescript
import { DlmsClient, DlmsObject, ObjectType } from '@bubblyworld/gurux-dlms-ts';

const relay = new DlmsObject(client.getModule(), ObjectType.DISCONNECT_CONTROL, '0-0:96.3.10*255');

// Disconnect (switch off)
const disconnectFrames = client.method(relay, 1);
await sendAndReceive(disconnectFrames);

// Reconnect (switch on)
const reconnectFrames = client.method(relay, 2);
await sendAndReceive(reconnectFrames);

relay.free();
```

## Load Profiles (Profile Generic)

Profile generic objects contain historical meter data. Read the capture objects first (attr 3) to learn the column layout, then read the buffer by time range:

```typescript
import { DlmsClient, ProfileGeneric } from '@bubblyworld/gurux-dlms-ts';

const pg = new ProfileGeneric(client.getModule(), '0-1:24.3.0*255');

// Read column definitions.
await readAttr(client, pg.inner, 3);
const columns = pg.getCaptureColumns();
// e.g. [{ objectType: 8, obis: '0.0.1.0.0.255', attributeIndex: 2 },
//        { objectType: 3, obis: '1.0.1.8.0.255', attributeIndex: 2 }, ...]

// Read data by time range.
const end = new Date();
const start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
const frames = client.readByRange(pg.inner, start, end);
for (const frame of frames) {
  const resp = await sendAndReceive([frame]);
  let result = client.getData(resp);
  // Multi-block transfer — keep requesting until moreData is 0.
  while (result.moreData !== 0) {
    const more = client.receiverReady(result.moreData);
    result = client.getData(await sendAndReceive(more));
  }
}
client.updateValue(pg.inner, 2, new Uint8Array(0));

// Iterate rows.
for (let row = 0; row < pg.rowCount; row++) {
  const timestamp = pg.getCellString(row, 0);  // clock column
  const energy = pg.getCellDouble(row, 1);      // register column
  console.log(`${timestamp}: ${energy}`);
}

pg.free();
```

## Association View

List all objects exposed by the meter. Some meters restrict this to certain client addresses or authentication levels:

```typescript
const frames = client.getObjectsRequest();
for (const frame of frames) {
  const resp = await sendAndReceive([frame]);
  let result = client.getData(resp);
  while (result.moreData !== 0) {
    result = client.getData(await sendAndReceive(client.receiverReady(result.moreData)));
  }
}

const objects = client.parseObjects(new Uint8Array(0));
for (const obj of objects) {
  console.log(`type=${obj.type} obis=${obj.obis}`);
}
```

## Authentication Levels

DLMS supports multiple authentication levels. Set them before connecting:

```typescript
// No authentication (public client, typically clientAddress=16).
const client = await DlmsClient.create({
  clientAddress: 16,
  serverAddress: 25348,
});
client.setInt('authentication', 0); // NONE

// Low Level Security (LLS) — password sent in the clear.
const client = await DlmsClient.create({
  clientAddress: 1,
  serverAddress: 25348,
  password: '00000000',
});
// authentication defaults to LOW (1) when a password is provided.

// High Level Security (HLS) — AES challenge-response.
const client = await DlmsClient.create({
  clientAddress: 1,
  serverAddress: 25348,
  password: 'placeholder',
});
client.setInt('authentication', 2); // HIGH
client.setStr('passwordHex', '000102030405060708090A0B0C0D0E0F');

// After SNRM + AARQ, complete the HLS handshake:
const hlsFrames = client.applicationAssociationRequest();
const hlsResp = await sendAndReceive(hlsFrames);
client.parseApplicationAssociationResponse(hlsResp);

// HIGH_GMAC (level 5) — requires cipher keys and system title.
client.setInt('authentication', 5);
client.setInt('security', 0x30); // AUTH_ENCRYPTION
client.setStr('blockCipherKey', '000102030405060708090A0B0C0D0E0F');
client.setStr('authenticationKey', 'D0D1D2D3D4D5D6D7D8D9DADBDCDDDEDF');
client.setStr('systemTitle', '4845580000000001');
```

## Error Handling

All errors throw `DlmsException` with a typed `error` field:

```typescript
import { DlmsException, DlmsErrorCode } from '@bubblyworld/gurux-dlms-ts';

try {
  await readAttr(client, register, 2);
} catch (e) {
  if (e instanceof DlmsException) {
    switch (e.error.kind) {
      case 'cosem':
        // Data access error from the meter.
        console.log(e.error.errorCode); // e.g. DlmsErrorCode.UNDEFINED_OBJECT
        break;
      case 'acse':
        // Association/authentication error.
        console.log(e.error.diagnostic); // ACSE diagnostic code
        break;
      case 'wasm':
        // Internal codec error.
        break;
    }
    console.log(e.message); // Always has a human-readable message.
  }
}
```

Common COSEM errors: `UNDEFINED_OBJECT` (4), `READ_WRITE_DENIED` (3), `UNAVAILABLE_OBJECT` (11), `TEMPORARY_FAILURE` (2).

Common ACSE errors: `APPLICATION_CONTEXT_NAME_NOT_SUPPORTED` (276), `AUTHENTICATION_FAILURE` (279), `AUTHENTICATION_REQUIRED` (280).

## Client Settings

```typescript
client.setInt('maxInfoTX', 512);         // HDLC max info field size (TX)
client.setInt('maxInfoRX', 512);         // HDLC max info field size (RX)
client.setInt('windowSizeTX', 1);        // HDLC window size (TX)
client.setInt('windowSizeRX', 1);        // HDLC window size (RX)
client.setInt('authentication', 1);      // 0=NONE, 1=LOW, 2=HIGH, 5=HIGH_GMAC
client.setInt('security', 0x30);         // 0x10=AUTH, 0x20=ENCRYPT, 0x30=BOTH
client.setStr('password', '00000000');   // LLS password (ASCII)
client.setStr('passwordHex', 'AABB..'); // HLS secret (hex bytes)
client.setStr('blockCipherKey', '...');  // AES-128 encryption key (hex)
client.setStr('authenticationKey', '..'); // GMAC authentication key (hex)
client.setStr('systemTitle', '...');     // 8-byte system title (hex)
```

## Server (Meter Simulator)

A DLMS server for loopback testing — no network required:

```typescript
import { DlmsClient, DlmsServer, DlmsObject, ObjectType, loadGuruxModule } from '@bubblyworld/gurux-dlms-ts';

const module = await loadGuruxModule();
const server = await DlmsServer.create(module);

const register = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
register.setInt(2, 42);
server.addObject(register);
server.initialize();

const client = await DlmsClient.create({ clientAddress: 16, serverAddress: 1 }, module);
const ua = server.handleRequest(client.snrmRequest()[0]);
client.parseUaResponse(ua);
// ... read/write/method calls work the same as with a real meter.
```

## Transport Layer Example

The library doesn't handle I/O. Here's a minimal TCP transport for Node.js:

```typescript
import { createConnection, Socket } from 'net';

function sendAndReceive(socket: Socket, frames: Uint8Array[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 10000);
    const chunks: Buffer[] = [];
    let drain: ReturnType<typeof setTimeout>;

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      clearTimeout(drain);
      drain = setTimeout(() => {
        clearTimeout(timeout);
        socket.removeListener('data', onData);
        resolve(Buffer.concat(chunks));
      }, 200);
    };

    socket.on('data', onData);
    for (const frame of frames) socket.write(Buffer.from(frame));
  });
}

async function readAttr(client: DlmsClient, socket: Socket, obj: DlmsObject, attr: number) {
  let frames = client.read(obj, attr);
  let resp = await sendAndReceive(socket, frames);
  let result = client.getData(resp);
  while (result.moreData !== 0) {
    resp = await sendAndReceive(socket, client.receiverReady(result.moreData));
    result = client.getData(resp);
  }
  client.updateValue(obj, attr, new Uint8Array(0));
}
```

## Building From Source

Requires [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) for WASM compilation.

```bash
npm run build        # wasm + typescript
npm run build:wasm   # wasm only
npm run build:ts     # typescript only
npm test             # run tests
```

## Licensing

GPL-2.0. The WASM bundle includes [GuruxDLMS.c](https://github.com/Gurux/GuruxDLMS.c), also GPL-2.0.
