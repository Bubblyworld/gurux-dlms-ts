import { describe, it, expect } from 'vitest';
import { DlmsErrorCode, parseDlmsError } from '../src/types.js';

describe('parseDlmsError', () => {
  it('classifies a library error as transport with its description', () => {
    const err = parseDlmsError('DLMS:258:cl_parseUAResponse failed');
    expect(err.kind).toBe('transport');
    expect(err).toMatchObject({ errorCode: DlmsErrorCode.INVALID_PARAMETER });
    expect(err.message).toBe('Reply is not the kind of frame expected (cl_parseUAResponse failed)');
  });

  it('classifies a stale reply as transport', () => {
    const err = parseDlmsError('DLMS:283:cl_getData failed');
    expect(err).toMatchObject({ kind: 'transport', errorCode: DlmsErrorCode.INVALID_INVOKE_ID });
  });

  it('keeps meter-reported access errors as cosem', () => {
    expect(parseDlmsError('DLMS:3:cl_getData failed')).toMatchObject({
      kind: 'cosem',
      errorCode: DlmsErrorCode.READ_WRITE_DENIED,
    });
  });

  it('keeps association rejections as acse with their diagnostic', () => {
    expect(parseDlmsError('DLMS:275:cl_parseAAREResponse failed')).toMatchObject({
      kind: 'acse',
      diagnostic: 2,
    });
  });

  it('passes unknown codes and non-DLMS strings through as wasm errors', () => {
    expect(parseDlmsError('DLMS:999:something failed')).toEqual({
      kind: 'wasm',
      message: 'something failed (error code: 999)',
    });
    expect(parseDlmsError('no free client slots')).toEqual({
      kind: 'wasm',
      message: 'no free client slots',
    });
    expect(parseDlmsError('')).toEqual({ kind: 'wasm', message: 'unknown WASM error' });
  });
});
