import { describe, expect, it } from 'vitest';
import { venueTheme } from '../src/ui/theme';
import { allInteriorIds } from '../src/world/maps/interiors';
import { LIFT_SKY } from '../src/world/maps/casinoMap';
import { newCore } from './helpers';

const css = Object.values(import.meta.glob('../src/ui/styles.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];

/** The custom properties a top-level rule for `selector` sets. */
function tokens(selector: string): Set<string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return new Set();
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Set([...body.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
}

/** What every venue theme has to redefine so no part of a window keeps the default look. */
const REQUIRED = ['--frame-paper', '--frame-inset', '--frame-wood', '--frame-btn', '--frame-btn-hover', '--frame-btn-down', '--frame-gold', '--frame-tab', '--frame-tab-on', '--frame-ghost', '--frame-key', '--paper', '--ink', '--wood', '--head-hi', '--text', '--muted', '--line', '--good', '--bad'];

describe('the interface takes on the look of the venue', () => {
  it('gives each kind of place its own theme and leaves the city and plain homes on the default', () => {
    const c = newCore();
    const themeAt = (loc: string) => {
      c.setLocation(loc, 1, 1);
      return venueTheme(c);
    };
    expect(themeAt('city')).toBe('');
    expect(themeAt('home_basic')).toBe('');
    expect(themeAt('bank')).toBe('theme-bank');
    expect(themeAt('finance_office')).toBe('theme-bank');
    expect(themeAt('cafe')).toBe('theme-cafe');
    expect(themeAt('bar')).toBe('theme-bar');
    expect(themeAt('fine_dining')).toBe('theme-luxe');
    expect(themeAt('home_penthouse')).toBe('theme-luxe');
    expect(themeAt('office')).toBe('theme-office');
    expect(themeAt('casino')).toBe('theme-casino');
    c.setLocation('casino', LIFT_SKY.x, LIFT_SKY.y + 1);
    c.state.world.x = LIFT_SKY.x;
    c.state.world.y = LIFT_SKY.y + 1;
    expect(venueTheme(c)).toBe('theme-sky');
  });

  it('turns nautical on the marina pontoon, and back on the promenade', () => {
    const c = newCore();
    c.setLocation('city', 109, 45);
    expect(venueTheme(c)).toBe('theme-marina');
    c.setLocation('city', 104, 45);
    expect(venueTheme(c)).toBe('');
  });

  it('defines every theme it hands out, with the full set of frames and colours', () => {
    const c = newCore();
    const used = new Set<string>(['theme-marina']);
    for (const id of allInteriorIds()) {
      c.setLocation(id, 1, 1);
      used.add(venueTheme(c));
    }
    used.add('theme-sky');
    used.delete('');
    expect(used.size).toBeGreaterThanOrEqual(6);
    for (const theme of used) {
      const set = tokens(`.${theme}`);
      for (const t of REQUIRED) expect(set.has(t), `.${theme} ${t}`).toBe(true);
    }
  });

  it('still uses only pixel frames: every themed frame is a crisp-edged SVG', () => {
    const frames = [...css.matchAll(/--frame-[a-z-]+: url\("data:image\/svg\+xml,([^"]+)"\)/g)].map((m) => decodeURIComponent(m[1]));
    expect(frames.length).toBeGreaterThan(50);
    for (const svg of frames) {
      expect(svg).toContain("shape-rendering='crispEdges'");
      expect(svg).not.toMatch(/<(circle|ellipse|polygon|linearGradient|radialGradient|filter)\b/);
      // paths only trace whole-pixel horizontal and vertical edges
      for (const d of svg.matchAll(/ d='([^']*)'/g)) expect(d[1]).toMatch(/^[MmHhVvZz\d\s-]*$/);
    }
  });
});
