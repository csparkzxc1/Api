import { describe, expect, it } from 'vitest';
import { hashToken } from '../src/security/crypto.js';

describe('pairing code hashing', () => {
  it('produces stable, distinct hashes', () => {
    const a = hashToken('123456');
    const b = hashToken('123456');
    const c = hashToken('123457');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.length).toBe(32);
  });
});
