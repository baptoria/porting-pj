import { it, expect } from "vitest";
// @ts-ignore executable core is also embedded verbatim into the hashed AudioWorklet
import { PcmRing } from "../scripts/phase9-8i-ring.mjs";
it("renders synthetic mono tone at 1x/2x with no overwritten or duplicated samples", () => {
  for (const rate of [1, 2]) {
    const r = new PcmRing(48000);
    r.setRate(rate);
    const src = Float32Array.from({ length: 22050 }, (_, i) =>
      Math.sin((2 * Math.PI * 500 * i) / 22050),
    );
    r.push(src, 22050);
    const out = new Float32Array(4800);
    r.render(out);
    let crossings = 0;
    for (let i = 1; i < out.length; i++)
      if (out[i - 1] < 0 && out[i] >= 0) crossings++;
    expect(crossings).toBeGreaterThan(49 * rate - 2);
    expect(crossings).toBeLessThan(51 * rate + 2);
    expect(
      Math.abs(r.report().consumedFrames - 2205 * rate),
    ).toBeLessThanOrEqual(1); // Fractional source frame remains queued, never dropped.
    expect(r.report().underflowFrames).toBe(0);
  }
});
it("preserves queued data on speed transitions and reports real render starvation without repreroll", () => {
  const r = new PcmRing(48000);
  r.push(new Float32Array(4000).fill(0.2), 22050);
  const out = new Float32Array(4800);
  r.render(out);
  const first = r.report().consumedFrames;
  r.setRate(2);
  r.render(out);
  expect(r.report().consumedFrames).toBe(3999);
  expect(r.report().underflowFrames).toBeGreaterThan(0);
  r.push(new Float32Array(400).fill(0.3), 22050);
  const resumed = new Float32Array(128);
  r.render(resumed);
  expect(resumed[127]).toBeCloseTo(0.3);
  expect(r.report().consumedFrames).toBeGreaterThan(first);
  expect(r.report().droppedFrames).toBe(0);
  r.setRate(1);
  expect(r.report().rate).toBe(1);
});
it("bounds memory and makes overflow visible instead of overwriting unread samples", () => {
  const r = new PcmRing(48000);
  r.push(new Float32Array(65000).fill(0.25), 22050);
  expect(r.push(new Float32Array(1000), 22050)).toBe(false);
  const out = new Float32Array(128);
  r.render(out);
  expect(out[100]).toBeCloseTo(0.25);
  expect(r.report().droppedFrames).toBe(1000);
  expect(r.report().ringCapacityFrames).toBe(65536);
});
it("silent gaps still count as actual gaps and rolling health recovers without erasing lifetime counts", () => {
  const r = new PcmRing(48000);
  r.push(new Float32Array(1600), 22050);
  r.render(new Float32Array(4800));
  expect(r.report().underflowFrames).toBeGreaterThan(0);
  expect(r.report().audibleGapFrames).toBe(0);
  const prior = r.report().underflowFrames;
  for (let i = 0; i < 1100; i++) {
    r.push(new Float32Array(60), 22050);
    r.render(new Float32Array(128));
  }
  expect(r.report().underflowFrames).toBeGreaterThanOrEqual(prior);
  expect(r.report().windowGapMs).toBe(0);
});

it("does not extrapolate or consume partial source steps on a low-rate output device",()=>{
 const r=new PcmRing(22050);r.setRate(2);r.started=true;
 r.push(new Float32Array([0,1]),22050);r.render(new Float32Array(1));
 expect(r.report().underflowFrames).toBe(1);expect(r.report().consumedFrames).toBe(0);
 r.push(new Float32Array([2,3,4,5]),22050);const out=new Float32Array(2);r.render(out);
 expect(Array.from(out)).toEqual([0,2]);expect(r.report().consumedFrames).toBe(4);expect(r.fraction).toBe(0);expect(r.report().droppedFrames).toBe(0);
});
