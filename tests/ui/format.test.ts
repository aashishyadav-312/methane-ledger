import { describe, expect, it } from 'vitest';
import { DASH, inr, pct, tonnes, usdM, usdPerT } from '../../src/lib/format';

describe('usdPerT', () => {
  it('formats positive, zero and negative', () => {
    expect(usdPerT(8.333)).toBe('$8.33');
    expect(usdPerT(0)).toBe('$0.00');
    expect(usdPerT(-4.3)).toBe('−$4.30');
  });
  it('never shows a minus on a value that rounds to zero', () => {
    expect(usdPerT(-0.001)).toBe('$0.00');
  });
  it('groups thousands and handles non-finite input', () => {
    expect(usdPerT(1234.5)).toBe('$1,234.50');
    expect(usdPerT(Number.NaN)).toBe(DASH);
  });
});

describe('usdM', () => {
  it('formats positive, zero and negative', () => {
    expect(usdM(8_600_000)).toBe('$8.6M');
    expect(usdM(0)).toBe('$0.0M');
    expect(usdM(-4_300_000)).toBe('−$4.3M');
  });
  it('drops the sign when the value rounds to zero', () => {
    expect(usdM(-10_000)).toBe('$0.0M');
  });
});

describe('tonnes', () => {
  it('formats positive values in t, k t and Mt', () => {
    expect(tonnes(820)).toBe('820 t');
    expect(tonnes(384_781)).toBe('385k t');
    expect(tonnes(1_820_000)).toBe('1.82 Mt');
  });
  it('formats zero', () => {
    expect(tonnes(0)).toBe('0 t');
  });
  it('formats negative values with a true minus', () => {
    expect(tonnes(-384_781)).toBe('−385k t');
    expect(tonnes(-1_820_000)).toBe('−1.82 Mt');
  });
  it('rolls over to Mt when rounding reaches 1000k', () => {
    expect(tonnes(999_600)).toBe('1.00 Mt');
  });
});

describe('pct', () => {
  it('formats a fraction as a percentage', () => {
    expect(pct(0.237, 1)).toBe('23.7%');
    expect(pct(0.1, 0)).toBe('10%');
    expect(pct(0)).toBe('0.0%');
    expect(pct(-0.052, 1)).toBe('−5.2%');
  });
  it('shows an en dash when there is no value', () => {
    expect(pct(null)).toBe(DASH);
  });
});

describe('inr', () => {
  it('formats positive, zero and negative rupee amounts', () => {
    expect(inr(8.333, 85)).toBe('₹708');
    expect(inr(0, 85)).toBe('₹0');
    expect(inr(-1000, 85)).toBe('−₹85,000');
  });
  it('uses Indian digit grouping', () => {
    expect(inr(10_000, 85)).toBe('₹8,50,000');
  });
  it('switches to crore from one crore up', () => {
    expect(inr(8_600_000, 85)).toBe('₹73.10 crore');
    expect(inr(-8_600_000, 85)).toBe('−₹73.10 crore');
  });
});
