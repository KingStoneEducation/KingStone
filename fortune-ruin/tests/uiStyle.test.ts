import { describe, expect, it } from 'vitest';
import { uiZoom } from '../src/ui/uiScale';

const sources = import.meta.glob('../src/ui/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const css = Object.values(import.meta.glob('../src/ui/styles.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];

describe('pixel interface rules', () => {
  it('reads the whole stylesheet (the checks below would pass on an empty one)', () => {
    expect(css.length).toBeGreaterThan(50_000);
    expect(css).toContain('#ui-root');
  });

  it('scales the interface so the pixel font lands on whole device pixels where it can', () => {
    expect(uiZoom(1280, 720, 1)).toBe(1);
    expect(uiZoom(1366, 768, 1)).toBe(1);
    expect(uiZoom(1920, 1080, 1)).toBe(1.5); // the one compromise: a 1080p monitor
    expect(uiZoom(2560, 1440, 1)).toBe(2);
    expect(uiZoom(3840, 2160, 1)).toBe(3);
    // high-density laptop: 2 device pixels per font pixel at zoom 1
    expect(uiZoom(1440, 900, 2) * 2).toBe(2);
  });

  it('uses no emoji or glyphs the pixel font lacks in the interface', () => {
    const banned = /[\u{1F300}-\u{1FAFF}−≈≥⟲⟳㎡✕]/u;
    for (const [file, src] of Object.entries(sources)) {
      const hit = src.split('\n').findIndex((l) => banned.test(l));
      expect(hit, `${file}:${hit + 1}`).toBe(-1);
    }
  });

  it('only sets font sizes the 12 px pixel font renders cleanly (multiples of 12)', () => {
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/fontSize: (\d+(?:\.\d+)?)/g)) expect(Number(m[1]) % 12, `${file}: fontSize ${m[1]}`).toBe(0);
    }
    for (const m of css.matchAll(/font-size: (\d+(?:\.\d+)?)px/g)) expect(Number(m[1]) % 12, `styles.css font-size ${m[1]}px`).toBe(0);
  });

  it('has no rounded corners or blurred shadows left in the stylesheet', () => {
    expect(css).not.toMatch(/border-radius: (?!0\b|50%)[1-9]/);
    expect(css).not.toMatch(/box-shadow:[^;]*\b\d+px \d+px [1-9]\d*px/);
    expect(css).not.toMatch(/backdrop-filter/);
  });
});
