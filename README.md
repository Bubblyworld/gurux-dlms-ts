# gurux-dlms-ts

[WASM](https://webassembly.org/) build of [GuruxDLMS.c](https://github.com/Gurux/GuruxDLMS.c) with TypeScript bindings. Provides a low-level DLMS/COSEM protocol codec for communicating with smart meters. Runs in both node and browser environments with zero runtime dependencies.

## Usage

The library provides a codec, not I/O — you feed it bytes and it produces DLMS frames. How those frames reach the meter (TCP socket, serial port, etc.) is up to you.

```typescript
import { DlmsClient, DlmsObject, ObjectType } from '@bubblyworld/gurux-dlms-ts';

const client = await DlmsClient.create({
  clientAddress: 16,
  serverAddress: 1,
  password: '00000000',
});

// Each request method returns Uint8Array[] — one frame per entry.
// Send them to the meter and collect the response bytes.
const snrmFrames = client.snrmRequest();
const uaResponse = await sendAndReceive(snrmFrames);
client.parseUaResponse(uaResponse);

const aarqFrames = client.aarqRequest();
const aareResponse = await sendAndReceive(aarqFrames);
client.parseAareResponse(aareResponse);

// Read a register
const register = new DlmsObject(client.getModule(), ObjectType.REGISTER, '1.0.1.8.0.255');
const readFrames = client.read(register, 2);
const readResponse = await sendAndReceive(readFrames);

const result = client.getData(readResponse);
if (result.complete) {
  client.updateValue(register, 2, new Uint8Array(0));
  console.log(register.getDouble(2)); // the register's value
}

// Disconnect
for (const frame of client.releaseRequest()) await send(frame);
for (const frame of client.disconnectRequest()) await send(frame);

register.free();
client.free();
```

## Typed Helpers

Convenience wrappers that know the attribute layout for common DLMS object types:

```typescript
import { DlmsClient, Register, Clock, DisconnectControl } from '@bubblyworld/gurux-dlms-ts';

const client = await DlmsClient.create({ clientAddress: 16, serverAddress: 1 });
const module = client.getModule();

const register = new Register(module, '1.0.1.8.0.255');
// After reading attributes 2 and 3:
console.log(register.value);       // raw value
console.log(register.scaler);      // power-of-ten scaler
console.log(register.unit);        // DLMS unit enum
console.log(register.scaledValue); // value * 10^scaler

const clock = new Clock(module, '0.0.1.0.0.255');
// After reading attribute 2:
console.log(clock.time);     // ISO datetime string
console.log(clock.timezone); // minutes deviation

const relay = new DisconnectControl(module, '0.0.96.3.10.255');
console.log(relay.outputState);  // boolean
console.log(relay.controlState); // enum
console.log(relay.controlMode);  // enum
```

Available helpers: `Register`, `ExtendedRegister`, `Clock`, `DisconnectControl`, `ProfileGeneric`.

## Server (Meter Simulator)

A DLMS server for testing — no network required:

```typescript
import { DlmsClient, DlmsServer, DlmsObject, ObjectType } from '@bubblyworld/gurux-dlms-ts';
import { loadGuruxModule } from '@bubblyworld/gurux-dlms-ts';

const module = await loadGuruxModule();
const server = await DlmsServer.create(module);

const register = new DlmsObject(module, ObjectType.REGISTER, '1.0.1.8.0.255');
register.setInt(2, 42);
server.addObject(register);
server.initialize();

// Pass frames directly between client and server
const client = await DlmsClient.create({ clientAddress: 16, serverAddress: 1 }, module);
const ua = server.handleRequest(client.snrmRequest()[0]);
client.parseUaResponse(ua);
// ... and so on
```

## Client Settings

Configure HDLC parameters after creating the client:

```typescript
const client = await DlmsClient.create({ clientAddress: 16, serverAddress: 1 });
client.setInt('maxInfoTX', 128);
client.setInt('maxInfoRX', 128);
client.setInt('windowSizeTX', 1);
client.setInt('windowSizeRX', 1);
```

## Building

Requires [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) for WASM compilation.

```bash
npm run build        # wasm + typescript
npm run build:wasm   # wasm only
npm run build:ts     # typescript only
npm test             # run tests
```

## Licensing

This package is licensed under GPL-2.0. The WASM bundle includes [GuruxDLMS.c](https://github.com/Gurux/GuruxDLMS.c), also licensed under GPL-2.0.

## Acknowledgements

Credit goes to the [Gurux](https://www.gurux.fi/) team for the DLMS/COSEM protocol implementation.
