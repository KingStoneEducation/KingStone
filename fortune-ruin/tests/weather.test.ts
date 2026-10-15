import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/GameCore';
import { deserialize, serialize } from '../src/systems/SaveManager';
import { DAYS_PER_YEAR, GAME_START_MINUTES, MINUTES_PER_DAY, hm, seasonOfMonth, toDate, type Season } from '../src/core/calendar';
import { SEASON_ODDS, SOAK_MINUTES, conditionsAt, dayWeather, describeNow, forecastLine, type Sky, type Conditions } from '../src/systems/WeatherSystem';
import { FERRY, FISHING } from '../src/systems/IsleSystem';
import { SLOTS } from '../src/systems/MarinaSystem';
import { LABOR, nightMarketOpen } from '../src/systems/OldTownSystem';
import { planTrip } from '../src/systems/NPCManager';
import { ambienceFor, weatherSoundFor, type SoundContext } from '../src/audio/soundscape';
import { LOCATIONS } from '../src/data/locations';
import { ITEMS, SHOPS } from '../src/data/items';
import { NPCS } from '../src/data/npcs';
import { FERRY_PIER } from '../src/world/maps/cityLayout';
import { ISLE_PIER, onIsle } from '../src/world/maps/isleLayout';
import { PUDDLE_ODDS, puddleSpots, snowKind, tileName } from '../src/world/groundWeather';
import { buildCityMap } from '../src/world/maps/city';
import { buildIsleMap } from '../src/world/maps/isle';
import { interiorMap } from '../src/world/maps/interiors';
import { newCore } from './helpers';

/** A game with its real weather (the test helper pins it to clear days). */
function real(seed = 12345): GameCore {
  const c = newCore(seed);
  c.weather.force = null;
  return c;
}

/** The first storm day after the start of the game, for this seed. */
function firstStorm(c: GameCore, after = c.today() + 2): number {
  for (let d = after; d < after + 2000; d++) if (c.weather.stormDay(d)) return d;
  throw new Error('no storm');
}

/** Live minutes on the clock (as when walking about), not skipped ones. */
function live(c: GameCore, minutes: number): void {
  for (let i = 0; i < minutes * 3; i++) c.update(250);
}

describe('the weather of a day', () => {
  it('is the same every time for a game (and after a reload), and different from game to game', () => {
    const a = real(7);
    const b = real(7);
    const other = real(8);
    const days = Array.from({ length: 120 }, (_, i) => a.today() + i);
    expect(days.map((d) => a.weather.day(d))).toEqual(days.map((d) => b.weather.day(d)));
    expect(days.map((d) => a.weather.day(d).sky)).not.toEqual(days.map((d) => other.weather.day(d).sky));
    const loaded = new GameCore(deserialize(serialize(a, 'slot1')));
    expect(days.map((d) => loaded.weather.day(d))).toEqual(days.map((d) => a.weather.day(d)));
  });

  it('follows the season: storms come in summer, fog in winter; and the first morning is clear', () => {
    const count: Record<Season, Record<Sky, number>> = {} as Record<Season, Record<Sky, number>>;
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as Season[]) count[s] = { clear: 0, cloudy: 0, rain: 0, storm: 0, fog: 0, snow: 0 };
    let n = 0;
    for (let seed = 1; seed <= 12; seed++)
      for (let d = 0; d < DAYS_PER_YEAR * 2; d++) {
        const season = seasonOfMonth(Math.floor((d % DAYS_PER_YEAR) / 28));
        count[season][dayWeather(seed, d).sky]++;
        n++;
      }
    const share = (s: Season, k: Sky) => (count[s][k] / Object.values(count[s]).reduce((a, b) => a + b, 0)) * 100;
    for (const s of Object.keys(SEASON_ODDS) as Season[]) {
      for (const [k, p] of SEASON_ODDS[s]) {
        // a wet day makes rain more likely the next (spells), so rain runs a little above its odds and the rest a little below
        if (k === 'rain') expect(share(s, k), `${s} rain`).toBeGreaterThan(p - 3);
        else expect(Math.abs(share(s, k) - p), `${s} ${k}`).toBeLessThan(Math.max(4, p * 0.25));
      }
    }
    expect(share('summer', 'storm')).toBeGreaterThan(share('winter', 'storm') * 4);
    expect(share('winter', 'fog')).toBeGreaterThan(share('summer', 'fog') * 1.5);
    expect(n).toBeGreaterThan(8000);
    for (let seed = 1; seed < 50; seed++) expect(dayWeather(seed, Math.floor(GAME_START_MINUTES / MINUTES_PER_DAY)).sky).toBe('clear');
  });

  it('rains inside its hours (running on past midnight), all day in a storm; the fog lifts in the morning', () => {
    let checked = 0;
    for (let d = 100; d < 400 && checked < 30; d++) {
      const w = dayWeather(3, d);
      const y = dayWeather(3, d - 1);
      if (w.sky !== 'rain' || !w.rain) continue;
      checked++;
      const at = (m: number) => conditionsAt(w, y, d * MINUTES_PER_DAY + m);
      expect(at(w.rain.from).raining).toBe(true);
      if (w.rain.from > 0 && !(y.rain && y.rain.to > MINUTES_PER_DAY + w.rain.from - 1)) expect(at(w.rain.from - 1).raining).toBe(false);
      if (w.rain.to > MINUTES_PER_DAY) {
        // the next day, until it stops
        const next = dayWeather(3, d + 1);
        const m = w.rain.to - MINUTES_PER_DAY - 1;
        expect(conditionsAt(next, w, (d + 1) * MINUTES_PER_DAY + m).raining).toBe(true);
      } else if (w.rain.to < MINUTES_PER_DAY) expect(at(w.rain.to).raining || (y.rain !== null && y.rain.to > MINUTES_PER_DAY + w.rain.to)).toBe(false);
      expect(w.intensity).toBeGreaterThan(0.2);
    }
    expect(checked).toBe(30);
    const storm = dayWeather(1, 200, 'storm');
    for (let m = 0; m < MINUTES_PER_DAY; m += 30) expect(conditionsAt(storm, storm, 200 * MINUTES_PER_DAY + m)).toMatchObject({ raining: true, storm: true, overcast: 1 });
    for (let d = 0; d < 400; d++) {
      const w = dayWeather(5, d);
      if (w.sky !== 'fog') continue;
      expect(w.fogUntil).toBeGreaterThanOrEqual(hm(8));
      expect(w.fogUntil).toBeLessThanOrEqual(hm(11));
      expect(conditionsAt(w, dayWeather(5, d - 1), d * MINUTES_PER_DAY + hm(6)).fog).toBe(1);
      expect(conditionsAt(w, dayWeather(5, d - 1), d * MINUTES_PER_DAY + w.fogUntil).fog).toBe(0);
    }
  });

  it('is warmer in summer than in winter, and warmest in the afternoon', () => {
    const c = real();
    const july = 6 * 28 + 14;
    const jan = 14;
    let summer = 0;
    let winter = 0;
    for (let y = 0; y < 3; y++) {
      summer += dayWeather(9, y * DAYS_PER_YEAR + july).high;
      winter += dayWeather(9, y * DAYS_PER_YEAR + jan).high;
    }
    expect(summer / 3).toBeGreaterThan(winter / 3 + 12);
    const d = c.today() + 3;
    const w = c.weather.day(d);
    expect(c.weather.now(d * MINUTES_PER_DAY + hm(15)).temp).toBe(w.high);
    expect(c.weather.now(d * MINUTES_PER_DAY + hm(3)).temp).toBe(w.low);
  });

  it('says what it is like now and what tomorrow will bring', () => {
    const c = real();
    expect(c.weather.forecast(3).map((w) => w.day)).toEqual([c.today(), c.today() + 1, c.today() + 2]);
    const cond = (o: Partial<Conditions>): Conditions => ({ sky: 'clear', raining: false, snowing: false, storm: false, intensity: 0, overcast: 0, fog: 0, temp: 20, snowCover: 0, wet: 0, ...o });
    expect(describeNow(cond({ sky: 'storm', raining: true, storm: true, intensity: 1, overcast: 1 }), false).name).toBe('暴风雨');
    expect(describeNow(cond({ sky: 'rain', raining: true, intensity: 0.3, overcast: 0.8 }), false).name).toBe('小雨');
    expect(describeNow(cond({ sky: 'snow', raining: true, snowing: true, intensity: 0.9, overcast: 0.8, temp: -1 }), false)).toEqual({ name: '大雪', icon: 'snow' });
    expect(describeNow(cond({ sky: 'rain', overcast: 0.55 }), false).name).toBe('阴');
    expect(describeNow(cond({}), true).icon).toBe('moon');
    for (let d = 60; d < 200; d++) {
      const w = dayWeather(2, d);
      const f = forecastLine(w);
      expect(f.name.length, `${d}`).toBeGreaterThan(0);
      expect(f.note.length, `${d}`).toBeGreaterThan(2);
      if (w.sky === 'storm') expect(f.note).toContain('渡轮');
      if (w.sky === 'rain' && w.rain!.to <= MINUTES_PER_DAY && w.rain!.from > 0) expect(f.note).toMatch(/凌晨|清晨|上午|中午|下午|傍晚|夜里/);
    }
  });
});

describe('a storm day', () => {
  it('the ferry stays tied up at Greyhaven all day, and the next boat is the first one after the storm', () => {
    const c = real();
    const d = firstStorm(c);
    for (const m of [hm(7, 20), hm(10), hm(13, 55), hm(19)]) {
      c.state.time.minutes = d * MINUTES_PER_DAY + m;
      c.state.world.location = 'city';
      expect(c.isle.boarding()).toBeNull();
      expect(c.isle.ferryAt('city')).toBe(true);
      expect(c.isle.ferryAt('isle')).toBe(false);
      expect(c.isle.boardCheck('deck', 'cash')).toContain('停航');
      expect(c.isle.cross('deck', 'cash').ok).toBe(false);
    }
    let after = d + 1;
    while (c.weather.stormDay(after)) after++;
    expect(c.isle.nextFerry('city')).toBe(after * MINUTES_PER_DAY + FERRY.city[0]);
    // someone setting out for the island the evening before waits for the first boat after it
    const trip = planTrip('city', 'isle', FERRY_PIER.board, FERRY_PIER.board, (d - 1) * MINUTES_PER_DAY + hm(19, 30), ISLE_PIER.board, ISLE_PIER.board, (x) => c.weather.stormDay(x));
    expect(trip.boat).toBe(after * MINUTES_PER_DAY + FERRY.city[0]);
  });

  it('keeps the fishing boats in, the fish market shut, the docks idle and the night market packed away', () => {
    const c = real();
    const d = firstStorm(c);
    c.state.time.minutes = d * MINUTES_PER_DAY + hm(5);
    c.state.world.location = 'isle';
    const o = c.isle.fishingOffer();
    if (toDate(c.now()).weekday !== 6) expect(o.reason).toContain('风暴');
    expect(o.ok).toBe(false);
    expect(c.isle.boatsIn()).toBe(true);
    c.state.time.minutes = d * MINUTES_PER_DAY + FISHING.back + 30;
    expect(c.isle.marketOpen()).toBe(false);
    c.state.time.minutes = d * MINUTES_PER_DAY + LABOR.from + 10;
    c.state.world.location = 'city';
    const l = c.oldtown.laborOffer();
    expect(l.ok).toBe(false);
    if (toDate(c.now()).weekday !== 6) expect(l.reason).toContain('风暴');
    c.state.time.minutes = d * MINUTES_PER_DAY + hm(20);
    expect(nightMarketOpen(c.now(), c.weather.stormDay())).toBe(false);
    expect(nightMarketOpen(c.now())).toBe(true);
    expect(c.oldtown.fortune().ok).toBe(false);
  });

  it('shuts the beach, the pool and the private beach', () => {
    const c = newCore();
    c.weather.force = 'storm';
    c.state.time.minutes = (c.today() + 1) * MINUTES_PER_DAY + hm(11);
    c.state.world.location = 'isle_resort';
    c.state.isle!.room = { kind: 'resort', until: c.now() + 600, paid: 0 };
    expect(c.isle.guestBeach('pool').ok).toBe(false);
    expect(c.isle.guestBeach('beach').ok).toBe(false);
    c.state.world.location = 'isle';
    expect(c.isle.lifeguardOn()).toBe(false);
    expect(c.isle.beachShut()).toContain('风暴');
    expect(c.isle.rentLounger().ok).toBe(false);
    expect(c.isle.swim().ok).toBe(false);
  });

  it('cancels the harbour cruises and the club does not send a boat out; a trip already booked is refunded in full', () => {
    const c = real();
    const d = firstStorm(c);
    c.state.time.minutes = d * MINUTES_PER_DAY + hm(10, 50);
    c.state.world.location = 'city';
    expect(c.marina.boardingCruise()).toBeNull();
    expect(c.marina.tourBoatOut()).toBe(false);
    expect(c.marina.boardCheck('cruise', 'cash')).toContain('停航');
    c.state.marina!.owned = 'seagull';
    expect(c.marina.canGoAlone()).toContain('风暴');
    // the day before, the storm day's slots are not offered and cannot be booked
    c.state.time.minutes = (d - 1) * MINUTES_PER_DAY + hm(8);
    expect(c.marina.slots().every((s) => Math.floor(s / MINUTES_PER_DAY) !== d)).toBe(true);
    const r = c.marina.book('own', d * MINUTES_PER_DAY + SLOTS[0], []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('风暴');
    // booked in fair weather, then a storm comes (forced): the club calls it off and pays it all back
    const b = newCore();
    b.state.time.minutes = (b.today() + 1) * MINUTES_PER_DAY + hm(8);
    const bank = b.economy.balance('bank');
    const slot = b.marina.slots()[0];
    expect(b.marina.book('charter', slot, []).ok).toBe(true);
    b.weather.force = 'storm';
    b.advance(1, 'idle');
    expect(b.state.marina!.booking).toBeNull();
    expect(b.economy.balance('bank')).toBe(bank);
    expect(b.state.phone.messages.some((m) => m.from === 'marina' && m.body.includes('全额退回'))).toBe(true);
  });

  it('the weather service warns at six the evening before', () => {
    const c = real();
    const d = firstStorm(c);
    c.state.time.minutes = (d - 1) * MINUTES_PER_DAY + hm(17, 58);
    c.advance(3, 'idle');
    const warn = c.state.phone.messages.filter((m) => m.from === 'weather');
    expect(warn.length).toBe(1);
    expect(warn[0].body).toContain('渡轮');
    // and only then
    c.advance(60, 'idle');
    expect(c.state.phone.messages.filter((m) => m.from === 'weather').length).toBe(1);
  });

  it('nobody goes out of doors or over to the island', () => {
    const c = newCore();
    c.weather.force = 'storm';
    for (let t = c.today() * MINUTES_PER_DAY; t < (c.today() + 7) * MINUTES_PER_DAY; t += 10) {
      for (const def of NPCS) {
        const w = c.npcs.scheduled(def, t);
        expect(w.loc === 'city' || onIsle(w.loc), `${def.id} ${toDate(t).weekday} ${toDate(t).minuteOfDay}`).toBe(false);
      }
    }
    // in fair weather the same week has people in the park and on the island
    c.weather.force = 'clear';
    let outdoors = 0;
    let island = 0;
    for (let t = c.today() * MINUTES_PER_DAY; t < (c.today() + 7) * MINUTES_PER_DAY; t += 10)
      for (const def of NPCS) {
        const w = c.npcs.scheduled(def, t);
        if (w.loc === 'city') outdoors++;
        if (onIsle(w.loc)) island++;
      }
    expect(outdoors).toBeGreaterThan(50);
    expect(island).toBeGreaterThan(10);
  });
});

describe('in the rain', () => {
  it('the lifeguard takes his flag in: no loungers, no swimming, no private beach (the pool stays open)', () => {
    const c = newCore();
    c.weather.force = 'rain';
    c.state.time.minutes = (c.today() + 1) * MINUTES_PER_DAY + hm(12);
    c.state.world.location = 'isle';
    expect(c.isle.lifeguardOn()).toBe(false);
    expect(c.isle.beachShut()).toContain('下雨');
    const cash = c.economy.balance('cash');
    expect(c.isle.rentLounger().ok).toBe(false);
    expect(c.economy.balance('cash')).toBe(cash);
    expect(c.isle.swim().ok).toBe(false);
    c.state.world.location = 'isle_resort';
    c.state.isle!.room = { kind: 'resort', until: c.now() + 600, paid: 0 };
    expect(c.isle.guestBeach('beach').ok).toBe(false);
    expect(c.isle.guestBeach('pool').ok).toBe(true);
    // when it is dry again, so is the beach
    c.weather.force = 'clear';
    c.state.world.location = 'isle';
    expect(c.isle.lifeguardOn()).toBe(true);
    expect(c.isle.beachShut()).toBeNull();
  });

  it('nobody plays on the court, and people leave the benches, the court and the beach (but not the night market\'s stools)', () => {
    const c = newCore();
    c.weather.force = 'rain';
    expect(c.player.leisure('exercise').ok).toBe(false);
    let marketSeats = 0;
    for (let t = c.today() * MINUTES_PER_DAY; t < (c.today() + 7) * MINUTES_PER_DAY; t += 10)
      for (const def of NPCS) {
        const w = c.npcs.scheduled(def, t);
        if (w.loc === 'city' || onIsle(w.loc)) {
          if (w.loc === 'city' || w.loc === 'isle') expect(['leisure', 'exercise', 'busk'], `${def.id} ${w.spot}`).not.toContain(w.act);
          if (w.spot?.startsWith('nm_seat')) marketSeats++;
        }
      }
    expect(marketSeats).toBeGreaterThan(0);
    c.weather.force = 'clear';
    expect(c.player.leisure('exercise').ok).toBe(true);
  });

  it('walking about without an umbrella soaks you; with one you stay dry; a taxi or a shift does not count', () => {
    const c = newCore();
    c.weather.force = 'rain';
    c.state.time.minutes = (c.today() + 1) * MINUTES_PER_DAY + hm(12);
    c.state.world.location = 'city';
    live(c, SOAK_MINUTES - 2);
    expect(c.state.player.moodBuffs.some((b) => b.id === 'wet')).toBe(false);
    live(c, 4);
    const wet = c.state.player.moodBuffs.find((b) => b.id === 'wet');
    expect(wet?.amount).toBeLessThan(0);
    // dry, with an umbrella: nothing
    const d = newCore();
    d.weather.force = 'rain';
    d.state.time.minutes = (d.today() + 1) * MINUTES_PER_DAY + hm(12);
    d.state.world.location = 'city';
    d.inventory.give(ITEMS.umbrella, 1);
    live(d, SOAK_MINUTES * 3);
    expect(d.state.player.moodBuffs.some((b) => b.id === 'wet')).toBe(false);
    // time skipped (a ride, a shift) is not time in the rain
    const e = newCore();
    e.weather.force = 'rain';
    e.state.world.location = 'city';
    e.advance(SOAK_MINUTES * 4, 'idle');
    expect(e.state.player.moodBuffs.some((b) => b.id === 'wet')).toBe(false);
    // under a roof: dry
    const f = newCore();
    f.weather.force = 'rain';
    f.state.world.location = 'store';
    live(f, SOAK_MINUTES * 3);
    expect(f.state.player.moodBuffs.some((b) => b.id === 'wet')).toBe(false);
  });

  it('in a storm even an umbrella only helps so much', () => {
    const c = newCore();
    c.weather.force = 'storm';
    c.state.world.location = 'city';
    c.inventory.give(ITEMS.umbrella, 1);
    live(c, SOAK_MINUTES + 2);
    expect(c.state.player.moodBuffs.some((b) => b.id === 'wet')).toBe(false);
    live(c, SOAK_MINUTES + 2);
    expect(c.state.player.moodBuffs.find((b) => b.id === 'wet')?.amount).toBe(-2);
  });

  it('the convenience store sells umbrellas', () => {
    expect(SHOPS.store.items).toContain('umbrella');
    const c = newCore();
    c.state.world.location = 'store';
    expect(c.inventory.buy('store', 'umbrella', 'cash').ok).toBe(true);
    expect(c.weather.hasUmbrella()).toBe(true);
  });
});

describe('what you hear of it', () => {
  const ctx = (location: string, extra: Partial<SoundContext> = {}): SoundContext => ({
    screen: 'game',
    location,
    ambience: LOCATIONS[location]?.ambience ?? null,
    hour: 14,
    night: false,
    casinoArea: location === 'casino' ? 'floor' : null,
    table: null,
    weather: { raining: true, intensity: 0.6, storm: false, fog: 0 },
    ...extra,
  });

  it('rain on the street, muffled under a roof, nothing on the windowless casino floor', () => {
    expect(weatherSoundFor(ctx('city'))).toMatchObject({ muffled: false });
    expect(weatherSoundFor(ctx('city'))!.rain).toBeGreaterThan(0.5);
    expect(weatherSoundFor(ctx('cafe'))).toMatchObject({ muffled: true });
    expect(weatherSoundFor(ctx('casino'))).toBeNull();
    expect(weatherSoundFor(ctx('casino', { table: { game: 'blackjack', area: 'main' } }))).toBeNull();
    // the members' floor upstairs has windows
    expect(weatherSoundFor(ctx('casino', { casinoArea: 'sky_lounge' }))).toMatchObject({ muffled: true });
    expect(weatherSoundFor(ctx('city', { weather: { raining: false, intensity: 0, storm: false, fog: 0 } }))!.rain).toBe(0);
  });

  it('the foghorn only by the water in the fog; the night\'s small sounds give way to the rain', () => {
    const fog = { raining: false, intensity: 0, storm: false, fog: 1 };
    expect(weatherSoundFor(ctx('isle', { weather: fog }))!.foghorn).toBe(true);
    expect(weatherSoundFor(ctx('cafe', { weather: fog }))!.foghorn).toBe(false);
    expect(ambienceFor(ctx('city', { night: true }))).toBeNull();
    expect(ambienceFor(ctx('city', { night: true, weather: fog }))).toBe('city_night');
  });
});

describe('snow', () => {
  it('comes a few times a winter, on cold days, and never in the other seasons', () => {
    let snow = 0;
    let winter = 0;
    for (let seed = 1; seed <= 12; seed++)
      for (let d = 0; d < DAYS_PER_YEAR * 2; d++) {
        const season = seasonOfMonth(Math.floor((d % DAYS_PER_YEAR) / 28));
        const w = dayWeather(seed, d);
        if (season === 'winter') winter++;
        if (w.sky !== 'snow') continue;
        snow++;
        expect(season).toBe('winter');
        expect(w.high, `${seed}/${d}`).toBeLessThanOrEqual(4);
        expect(w.rain).not.toBeNull();
        expect(forecastLine(w)).toMatchObject({ icon: 'snow' });
        expect(forecastLine(w).note).toContain('积雪');
      }
    expect(snow / winter).toBeGreaterThan(0.04);
    expect(snow / winter).toBeLessThan(0.1);
  });

  it('settles while it falls, lies for a while after, and melts (slowly when it stays below freezing)', () => {
    const d = 400;
    const today = dayWeather(5, d, 'snow');
    const before = dayWeather(5, d - 1, 'clear');
    const at = (m: number) => conditionsAt(today, before, d * MINUTES_PER_DAY + m);
    expect(at(1)).toMatchObject({ raining: true, snowing: true });
    expect(at(1).snowCover).toBeLessThan(0.05);
    expect(at(60).snowCover).toBeGreaterThan(at(1).snowCover);
    expect(at(hm(6)).snowCover).toBe(1);
    // snow is not puddles
    expect(at(hm(6)).wet).toBe(0);
    // the next day it has stopped: thawing above freezing, lasting below it
    const thaw = { ...dayWeather(5, d + 1, 'clear'), low: 2, high: 8 };
    const frost = { ...thaw, low: -6, high: -1 };
    const after = (w: typeof thaw, h: number) => conditionsAt(w, today, (d + 1) * MINUTES_PER_DAY + hm(h));
    expect(after(thaw, 1).snowing).toBe(false);
    expect(after(thaw, 4).snowCover).toBeLessThan(after(thaw, 1).snowCover);
    expect(after(thaw, 10).snowCover).toBe(0);
    expect(after(frost, 10).snowCover).toBeGreaterThan(0.6);
    // melting snow leaves the streets wet; frozen, it does not
    expect(after(thaw, 4).wet).toBeGreaterThan(0);
    expect(after(frost, 4).wet).toBe(0);
  });

  it('a rain day leaves the streets wet for a few hours after; a dry spell leaves them dry', () => {
    let checked = 0;
    for (let d = 100; d < 600 && checked < 20; d++) {
      const w = dayWeather(3, d);
      const y = dayWeather(3, d - 1);
      if (w.sky !== 'rain' || !w.rain || y.rain || w.rain.to > MINUTES_PER_DAY - hm(4)) continue;
      checked++;
      const at = (m: number) => conditionsAt(w, y, d * MINUTES_PER_DAY + m);
      if (w.rain.from > 0) expect(at(w.rain.from - 1).wet).toBe(0);
      expect(at(w.rain.from + 40).wet).toBe(1);
      expect(at(w.rain.to + 60).wet).toBeGreaterThan(0.5);
      expect(at(w.rain.to + hm(3) + 1).wet).toBe(0);
      expect(at(w.rain.to + 60).snowCover).toBe(0);
    }
    expect(checked).toBe(20);
    const clear = dayWeather(3, 50, 'clear');
    for (let m = 0; m < MINUTES_PER_DAY; m += 60) expect(conditionsAt(clear, clear, 50 * MINUTES_PER_DAY + m).wet).toBe(0);
  });

  it('caught out in it without an umbrella you get snow down your collar, and you do not hear it fall', () => {
    const c = newCore();
    c.weather.force = 'snow';
    c.state.time.minutes = (c.today() + 1) * MINUTES_PER_DAY + hm(12);
    c.state.world.location = 'city';
    expect(c.weather.now()).toMatchObject({ snowing: true, raining: true });
    live(c, SOAK_MINUTES + 2);
    expect(c.state.player.moodBuffs.find((b) => b.id === 'wet')?.label).toBe('落了一身雪');
    const sound = weatherSoundFor({ screen: 'game', location: 'city', ambience: null, hour: 12, night: false, casinoArea: null, table: null, weather: c.weather.now() });
    expect(sound).toMatchObject({ rain: 0, muffled: false });
  });
});

describe('on the ground', () => {
  it('snow lies on grass, pavements and (as slush) on the roads, never on the water or in the pools', () => {
    expect(snowKind('grass2')).toBe('soft');
    expect(snowKind('garden')).toBe('soft');
    expect(snowKind('sidewalk')).toBe('packed');
    expect(snowKind('cobble')).toBe('packed');
    expect(snowKind('road_line_h')).toBe('slush');
    expect(snowKind('crosswalk_v')).toBe('slush');
    for (const t of ['water0', 'water1', 'water2', 'pool', 'pool_edge', 'shore_n', 'runner_c', 'carpet_blue']) expect(snowKind(t), t).toBe('none');
  });

  it('the puddles stand in the same hollows of the paving every time, on open paved ground only, and never indoors', () => {
    for (const map of [buildCityMap(), buildIsleMap()]) {
      const spots = puddleSpots(map);
      expect(spots).toEqual(puddleSpots(map));
      let paved = 0;
      for (let i = 0; i < map.w * map.h; i++) if (!map.blocked[i] && /^(sidewalk|plaza|path|cobble|concrete|court|road|crosswalk|parking)/.test(tileName(map.ground[i]))) paved++;
      expect(spots.length, map.id).toBeGreaterThan(paved * PUDDLE_ODDS * 0.6);
      expect(spots.length, map.id).toBeLessThan(paved * PUDDLE_ODDS * 1.4);
      for (const p of spots) {
        const tx = Math.floor(p.x / 16);
        const ty = Math.floor(p.y / 16);
        const i = ty * map.w + tx;
        expect(map.blocked[i], `${map.id} ${tx},${ty}`).toBe(0);
        expect(tileName(map.ground[i])).not.toMatch(/water|pool|shore|grass|sand|deck|dock/);
      }
    }
    expect(puddleSpots(interiorMap('cafe'))).toEqual([]);
  });
});
