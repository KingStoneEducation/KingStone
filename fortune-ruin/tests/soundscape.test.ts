import { describe, expect, it } from 'vitest';
import { ambienceFor, musicFor, type SoundContext } from '../src/audio/soundscape';
import { LOOP_PAD, TRACKS, type TrackId } from '../src/audio/tracks';
import { LOCATIONS } from '../src/data/locations';
import { CASINO_TABLES, casinoArea } from '../src/world/maps/casinoMap';
import { TABLE_BY_ID } from '../src/casino/tables';

const at = (location: string, extra: Partial<SoundContext> = {}): SoundContext => ({
  screen: 'game',
  location,
  ambience: LOCATIONS[location]?.ambience ?? null,
  hour: 14,
  night: false,
  casinoArea: location === 'casino' ? 'floor' : null,
  table: null,
  ...extra,
});

describe('which music plays where', () => {
  it('menus get the theme; nothing plays before the game has booted', () => {
    expect(musicFor({ ...at('city'), screen: 'menu' })).toBe('menu');
    expect(musicFor({ ...at('city'), screen: 'create' })).toBe('menu');
    expect(musicFor({ ...at('city'), screen: 'boot' })).toBeNull();
  });

  it('the casino follows the clock and its rooms', () => {
    expect(musicFor(at('casino', { hour: 15 }))).toBe('casino_day');
    expect(musicFor(at('casino', { hour: 22 }))).toBe('casino_night');
    expect(musicFor(at('casino', { hour: 3 }))).toBe('casino_night');
    expect(musicFor(at('casino', { casinoArea: 'poker' }))).toBe('poker');
    expect(musicFor(at('casino', { casinoArea: 'vip' }))).toBe('highlimit');
    expect(musicFor(at('casino', { casinoArea: 'high' }))).toBe('highlimit');
    // the members' floor upstairs has its own pieces and no casino floor sounds
    expect(musicFor(at('casino', { casinoArea: 'sky_lounge' }))).toBe('skyline');
    expect(musicFor(at('casino', { casinoArea: 'suite' }))).toBe('skyline');
    expect(musicFor(at('casino', { casinoArea: 'spa' }))).toBe('spa');
    expect(ambienceFor(at('casino', { casinoArea: 'sky_bar' }))).toBeNull();
  });

  it('at a table, the table decides', () => {
    expect(musicFor(at('casino', { table: { game: 'poker', area: 'main' } }))).toBe('poker');
    expect(musicFor(at('casino', { table: { game: 'blackjack', area: 'vip' } }))).toBe('highlimit');
    expect(musicFor(at('casino', { hour: 23, table: { game: 'roulette', area: 'main' } }))).toBe('casino_night');
  });

  it('the city has a day and a night theme; places have their own', () => {
    expect(musicFor(at('city'))).toBe('city_day');
    expect(musicFor(at('city', { night: true }))).toBe('city_night');
    expect(musicFor(at('home_basic'))).toBe('home');
    expect(musicFor(at('home_estate'))).toBe('upscale');
    expect(musicFor(at('cafe'))).toBe('cafe');
    expect(musicFor(at('bar'))).toBe('bar');
    expect(musicFor(at('fine_dining'))).toBe('upscale');
    expect(musicFor(at('store'))).toBe('shop');
  });

  it('no place in the city is left in silence by accident', () => {
    for (const id of Object.keys(LOCATIONS)) expect(musicFor(at(id)), id).not.toBeNull();
  });

  it('ambience is only sparse spot sounds, and none at the tables', () => {
    expect(ambienceFor(at('casino'))).toBe('casino');
    expect(ambienceFor(at('casino', { table: { game: 'blackjack', area: 'main' } }))).toBeNull();
    expect(ambienceFor(at('city', { night: true }))).toBe('city_night');
    expect(ambienceFor(at('city'))).toBeNull();
    expect(ambienceFor(at('office'))).toBeNull();
  });
});

describe('the soundtrack files', () => {
  it('every loop is a whole number of 64-sample blocks and fits in its file', () => {
    for (const [id, t] of Object.entries(TRACKS) as [TrackId, (typeof TRACKS)[TrackId]][]) {
      const samples = t.period * 44100;
      expect(Math.abs(samples - Math.round(samples)), id).toBeLessThan(1e-6);
      expect(Math.round(samples) % 64, id).toBe(0);
      expect(t.loopStart + LOOP_PAD + t.period, id).toBeLessThanOrEqual(t.duration);
    }
  });

  it('every track in the manifest has its file', () => {
    const files = Object.keys(import.meta.glob('../src/audio/music/*.mp3')).map((k) => k.split('/').pop());
    for (const id of Object.keys(TRACKS)) expect(files, id).toContain(`${id}.mp3`);
  });
});

describe('no noise', () => {
  it('the sound engine never generates noise: every effect is built from pitched tones or recorded instruments', () => {
    const src = Object.values(import.meta.glob('../src/audio/Audio.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
    expect(src).not.toMatch(/createBuffer\(/);
    expect(src).not.toMatch(/Math\.random\(\) \* 2 - 1/);
  });
});

describe('casino rooms', () => {
  it('every table stands in the room its rules say it belongs to', () => {
    for (const [id, pos] of Object.entries(CASINO_TABLES)) {
      const cfg = TABLE_BY_ID[id];
      const room = casinoArea(pos.x, pos.y);
      const expected = cfg.game === 'poker' ? 'poker' : cfg.area === 'main' ? 'floor' : cfg.area;
      expect(room, id).toBe(expected);
    }
  });
});
