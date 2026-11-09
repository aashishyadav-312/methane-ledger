import { expect, test } from 'vitest';
import { CONSTANTS, evaluate } from '../../src/model';
import { MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH } from '../../src/model/fixtures';

test('evaluate for Moonidih runs 1,000 times in under 500 ms', () => {
  for (let i = 0; i < 50; i++) evaluate(MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS); // warm up
  const runs = 1000;
  const t0 = performance.now();
  let checksum = 0;
  for (let i = 0; i < runs; i++) {
    const settings = { ...REFERENCE_SETTINGS, creditPriceUsdPerT: 5 + (i % 30) };
    checksum += evaluate(MOONIDIH_V1, settings, REFERENCE_TECH, CONSTANTS).npvUsd;
  }
  const elapsedMs = performance.now() - t0;
  expect(Number.isFinite(checksum)).toBe(true);
  expect(elapsedMs, `${runs} runs took ${elapsedMs.toFixed(1)} ms`).toBeLessThan(500);
});
