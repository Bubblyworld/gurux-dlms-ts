/**
 * A COSEM value as decoded by Gurux, tagged with its type. A date-time sent
 * as a 12-byte octet string stays an `octet-string` (see `valueDateTime`).
 */
export type DlmsValue =
  | { type: 'null' }
  | { type: 'array' | 'structure'; items: DlmsValue[] }
  | { type: 'boolean'; value: boolean }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }
  | { type: 'enum'; value: number }
  | { type: 'octet-string'; hex: string }
  | { type: 'string'; value: string }
  | { type: 'bcd'; digits: string }
  | { type: 'bit-string'; bits: string }
  | ({ type: 'date-time' | 'date' | 'time' } & DlmsDateTime);

/** Fields of a COSEM date-time; a field the meter leaves unspecified is absent. */
export interface DlmsDateTime {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;

  /** Deviation of local time from UTC in minutes. */
  deviation?: number;

  /** Clock status bits. */
  status?: number;
}

/** Number held by an integer, float, enum or BCD value, or undefined for any other value. */
export function valueNumber(value: DlmsValue): number | undefined {
  switch (value.type) {
    case 'integer':
    case 'float':
    case 'enum':
      return value.value;
    case 'bcd':
      return /^\d+$/.test(value.digits) ? Number(value.digits) : undefined;
    default:
      return undefined;
  }
}

/** Bytes of an octet-string value, or undefined for any other value. */
export function valueBytes(value: DlmsValue): Uint8Array | undefined {
  if (value.type !== 'octet-string') return undefined;
  const bytes = new Uint8Array(value.hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(value.hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

/** Fields of a date-time value or a 12-byte octet string, or undefined for any other value. */
export function valueDateTime(value: DlmsValue): DlmsDateTime | undefined {
  if (value.type === 'date-time') {
    const { type: _, ...fields } = value;
    return fields;
  }
  const b = valueBytes(value);
  if (!b || b.length !== 12) return undefined;
  const field = (v: number, unspecified = 0xff) => (v === unspecified ? undefined : v);
  const year = (b[0] << 8) | b[1];
  const deviation = ((b[9] << 8) | b[10]) << 16 >> 16;
  return {
    year: year === 0xffff ? undefined : year,
    month: field(b[2]),
    day: field(b[3]),
    hour: field(b[5]),
    minute: field(b[6]),
    second: field(b[7]),
    deviation: deviation === -0x8000 ? undefined : deviation,
    status: field(b[11]),
  };
}

/** OBIS in `A.B.C.D.E.F` form held by a 6-byte octet string, or undefined for any other value. */
export function valueObis(value: DlmsValue): string | undefined {
  const b = valueBytes(value);
  return b && b.length === 6 ? Array.from(b).join('.') : undefined;
}
