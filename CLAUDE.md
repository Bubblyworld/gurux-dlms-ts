# CLAUDE.md

WASM build of GuruxDLMS.c with TypeScript wrapper. Zero runtime dependencies.

## Build

- `npm run build:wasm` — compiles C to WASM via Emscripten (requires `emcc`)
- `npm run build:ts` — compiles TypeScript and bundles with Rollup
- `npm run build` — both
- `npm test` — runs vitest

## Architecture

Three layers:
1. **GuruxDLMS.c** — DLMS/COSEM protocol engine (cloned at build time from GitHub)
2. **build/glue/dlms_wasm.c** — handle-based C facade (~700 LOC), buffer-in/buffer-out API
3. **src/** — TypeScript wrapper: DlmsClient, DlmsServer, DlmsObject, typed helpers (Register, Clock, etc.)

Frame-producing methods return `Uint8Array[]` (one frame per entry). Multi-frame output from C uses 4-byte big-endian length prefixes, split by the TypeScript layer.

## Testing

Integration tests use client-server loopback (no network). Client and server share the same WASM module instance.
