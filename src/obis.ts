import { DlmsException } from './types.js';

const IEC_FORMAT = /^(\d+)-(\d+):(\d+)\.(\d+)\.(\d+)\*(\d+)$/;
const DOT_FORMAT = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

/**
 * Normalizes an OBIS code to the dot-separated format expected by GuruxDLMS.c.
 * Accepts both IEC 62056-61 display format (A-B:C.D.E*F) and dot-separated (A.B.C.D.E.F).
 */
export function normalizeObis(obis: string): string {
  const match = obis.match(IEC_FORMAT) ?? obis.match(DOT_FORMAT);
  if (!match) {
    throw new DlmsException({
      kind: 'wasm',
      message: `invalid OBIS code "${obis}": expected "A-B:C.D.E*F" or "A.B.C.D.E.F"`,
    });
  }

  const groups = match.slice(1).map(Number);
  for (const v of groups) {
    if (v < 0 || v > 255) {
      throw new DlmsException({
        kind: 'wasm',
        message: `OBIS group value ${v} out of range (0-255) in "${obis}"`,
      });
    }
  }

  return groups.join('.');
}
