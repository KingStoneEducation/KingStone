import type { GameCore } from '../core/GameCore';
import { DAYS_PER_YEAR, GAME_START_MINUTES, MINUTES_PER_DAY, formatClock, hm, seasonOfMonth, toDate, type Season } from '../core/calendar';
import { hashString } from '../core/rng';
import { onIsle } from '../world/maps/isleLayout';

/** The kind of day it is over the bay. */
export type Sky = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';

export interface DayWeather {
  day: number;
  sky: Sky;
  /** when it rains (or snows), in minutes of this day; it can run on past midnight (to > 1440). A storm rains all day. */
  rain: { from: number; to: number } | null;
  /** 0..1: drizzle to downpour */
  intensity: number;
  /** on a foggy morning, when the fog has lifted (minutes of the day) */
  fogUntil: number;
  /** °C */
  low: number;
  high: number;
}

/** What it is like outside at one moment. */
export interface Conditions {
  /** the day's weather */
  sky: Sky;
  /** something is coming down (rain, or snow): the rules for being out in it are the same */
  raining: boolean;
  /** what is coming down is snow */
  snowing: boolean;
  storm: boolean;
  /** 0..1 how hard it is raining (0 when dry) */
  intensity: number;
  /** 0..1 how grey the sky is */
  overcast: number;
  /** 0..1 how thick the fog is */
  fog: number;
  /** °C */
  temp: number;
  /** 0..1 how much snow lies on the ground (it builds up while it snows and melts after) */
  snowCover: number;
  /** 0..1 how wet the streets are: puddles in the rain, drying for a few hours after */
  wet: number;
}

/** Each season's odds of each kind of day (percent). Greyhaven is a damp port: summer brings the storms, winter the fog. */
export const SEASON_ODDS: Record<Season, [Sky, number][]> = {
  spring: [['clear', 34], ['cloudy', 26], ['rain', 26], ['storm', 3], ['fog', 11]],
  summer: [['clear', 46], ['cloudy', 16], ['rain', 22], ['storm', 10], ['fog', 6]],
  autumn: [['clear', 40], ['cloudy', 26], ['rain', 22], ['storm', 5], ['fog', 7]],
  // a few times a winter it is cold enough for the rain to come down as snow
  winter: [['clear', 30], ['cloudy', 30], ['rain', 17], ['storm', 1], ['fog', 15], ['snow', 7]],
};
/** Minutes of steady snow for the ground to be white (sooner when it comes down hard). */
const SNOW_BUILD = 150;
/** After the snow stops: hours for it to melt on a day above freezing, and on one that is not. */
const MELT_HOURS = { thaw: 8, frost: 30 };
/** Hours for the streets to dry after the rain. */
const DRY_HOURS = 3;
/** After a wet day, the chance the rain carries on into the next. */
const SPELL = 0.3;
/** The first morning of a new life in Greyhaven is a clear one. */
const FIRST_DAY = Math.floor(GAME_START_MINUTES / MINUTES_PER_DAY);

/** murmur3's finaliser over the string hash, so neighbouring days are unrelated */
function roll(seed: number, day: number, what: string): number {
  let h = hashString(`${seed}:${day}:${what}`);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function rawSky(seed: number, day: number): Sky {
  const season = seasonOfMonth(Math.floor((((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR) / 28));
  let r = roll(seed, day, 'sky') * 100;
  for (const [sky, p] of SEASON_ODDS[season]) {
    if (r < p) return sky;
    r -= p;
  }
  return 'clear';
}

const round10 = (m: number) => Math.round(m / 10) * 10;

/** The weather of a day, from the game's seed: the same every time (forced, it is that sky from morning to night). */
export function dayWeather(seed: number, day: number, force: Sky | null = null): DayWeather {
  let sky: Sky = force ?? rawSky(seed, day);
  if (!force) {
    if (day === FIRST_DAY) sky = 'clear';
    else if (sky !== 'storm') {
      const before = rawSky(seed, day - 1);
      if ((before === 'rain' || before === 'storm') && roll(seed, day, 'spell') < SPELL) sky = 'rain';
    }
  }
  let rain: DayWeather['rain'] = null;
  let intensity = 0;
  if (sky === 'storm') {
    rain = { from: 0, to: MINUTES_PER_DAY };
    intensity = 1;
  } else if (sky === 'rain' || sky === 'snow') {
    if (force) rain = { from: 0, to: MINUTES_PER_DAY };
    else {
      // most rain sets in from the afternoon into the night; some any time
      const evening = roll(seed, day, 'when') < 0.6;
      const from = round10(evening ? hm(14) + roll(seed, day, 'from') * hm(12) : roll(seed, day, 'from') * (MINUTES_PER_DAY - 60)) % MINUTES_PER_DAY;
      const length = round10(hm(2) + roll(seed, day, 'len') * hm(8));
      rain = { from, to: from + length };
    }
    intensity = 0.25 + roll(seed, day, 'hard') * 0.75;
  }
  const fogUntil = sky === 'fog' ? (force ? MINUTES_PER_DAY : round10(hm(8) + roll(seed, day, 'fog') * hm(3))) : 0;
  // the year's warmth peaks in midsummer, as the long days do (see sunTimes)
  const k = Math.cos((((day % DAYS_PER_YEAR) - 182) / DAYS_PER_YEAR) * Math.PI * 2);
  const mean = 16 + 10 * k + (roll(seed, day, 'temp') - 0.5) * 6;
  const spread = sky === 'clear' ? 10 : sky === 'cloudy' || sky === 'fog' ? 7 : 5;
  // a snow day is a cold one: around freezing
  const mid = sky === 'snow' ? Math.min(mean - 7, 1) : mean - (sky === 'rain' || sky === 'storm' ? 1.5 : 0);
  return { day, sky, rain, intensity, fogUntil, low: Math.round(mid - spread / 2), high: Math.round(mid + spread / 2) };
}

function fogLevel(m: number, until: number): number {
  if (m >= until) return 0;
  return Math.min(1, (until - m) / 60);
}

/** What it is like at absolute minute t (yesterday's rain may still be falling after midnight). */
export function conditionsAt(today: DayWeather, yesterday: DayWeather, t: number): Conditions {
  const m = t - today.day * MINUTES_PER_DAY;
  let raining = false;
  let snowing = false;
  let intensity = 0;
  if (today.rain && m >= today.rain.from && m < today.rain.to) {
    raining = true;
    snowing = today.sky === 'snow';
    intensity = today.intensity;
  } else if (yesterday.rain && m + MINUTES_PER_DAY >= yesterday.rain.from && m + MINUTES_PER_DAY < yesterday.rain.to) {
    raining = true;
    snowing = yesterday.sky === 'snow';
    intensity = yesterday.intensity;
  }
  const storm = today.sky === 'storm';
  const fog = today.sky === 'fog' ? fogLevel(m, today.fogUntil) : 0;
  const overcast = storm ? 1 : raining ? 0.7 + 0.3 * intensity : today.sky === 'cloudy' || today.sky === 'rain' || today.sky === 'snow' ? 0.55 : 0.3 * fog;
  // coolest just before dawn, warmest mid-afternoon
  const warm = (Math.cos(((m - hm(15)) / MINUTES_PER_DAY) * Math.PI * 2) + 1) / 2;
  const temp = Math.round(today.low + (today.high - today.low) * warm);
  const snowCover = Math.max(lying(yesterday, t, today.high), lying(today, t, today.high));
  // once it stops, snow melting on a day above freezing leaves the streets wet
  const wet = Math.max(wetness(yesterday, t), wetness(today, t), snowCover > 0 && !snowing && today.high > 1 ? snowCover * 0.5 : 0);
  return { sky: today.sky, raining, snowing, storm, intensity, overcast, fog, temp, snowCover, wet };
}

/** The snow a day's snowfall leaves lying at minute t: building while it falls, melting after (fast on a day above freezing). */
function lying(w: DayWeather, t: number, high: number): number {
  if (w.sky !== 'snow' || !w.rain) return 0;
  const start = w.day * MINUTES_PER_DAY + w.rain.from;
  const end = w.day * MINUTES_PER_DAY + w.rain.to;
  if (t < start) return 0;
  const rate = (0.6 + w.intensity) / SNOW_BUILD;
  const peak = Math.min(1, (Math.min(t, end) - start) * rate);
  if (t <= end) return peak;
  const hours = (t - end) / 60;
  return Math.max(0, peak * (1 - hours / (high > 1 ? MELT_HOURS.thaw : MELT_HOURS.frost)));
}

/** How wet a day's rain leaves the streets at minute t: puddles while it rains, drying after. */
function wetness(w: DayWeather, t: number): number {
  if (!w.rain || w.sky === 'snow') return 0;
  const start = w.day * MINUTES_PER_DAY + w.rain.from;
  const end = w.day * MINUTES_PER_DAY + w.rain.to;
  if (t < start) return 0;
  if (t <= end) return Math.min(1, (t - start) / 30);
  return Math.max(0, 1 - (t - end) / 60 / DRY_HOURS);
}

/** A word and an icon for the weather right now. */
export function describeNow(c: Conditions, night: boolean): { name: string; icon: WeatherIcon } {
  if (c.storm) return { name: '暴风雨', icon: 'storm' };
  if (c.snowing) return { name: c.intensity < 0.45 ? '小雪' : c.intensity < 0.8 ? '中雪' : '大雪', icon: 'snow' };
  if (c.raining) return { name: c.intensity < 0.45 ? '小雨' : c.intensity < 0.8 ? '中雨' : '大雨', icon: 'rain' };
  if (c.fog > 0.3) return { name: '有雾', icon: 'fog' };
  if (c.overcast >= 0.5) return { name: c.sky === 'cloudy' ? '多云' : '阴', icon: 'cloud' };
  return { name: '晴', icon: night ? 'moon' : 'sun' };
}

export type WeatherIcon = 'sun' | 'moon' | 'cloud' | 'rain' | 'storm' | 'fog' | 'snow';

/** Which part of the day a minute falls in, the way a forecast says it. */
export function partOfDay(m: number): string {
  const x = ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (x < hm(5)) return '凌晨';
  if (x < hm(8)) return '清晨';
  if (x < hm(11)) return '上午';
  if (x < hm(13)) return '中午';
  if (x < hm(17)) return '下午';
  if (x < hm(19)) return '傍晚';
  return '夜里';
}

/** A forecast's line for a day: what kind of day, when the rain comes, what is shut. */
export function forecastLine(w: DayWeather): { name: string; icon: WeatherIcon; note: string } {
  switch (w.sky) {
    case 'storm':
      return { name: '暴风雨', icon: 'storm', note: '风暴过境，全天大风大雨。渡轮、渔船和游艇会停航。' };
    case 'rain': {
      const r = w.rain!;
      const name = w.intensity < 0.45 ? '小雨' : w.intensity < 0.8 ? '中雨' : '大雨';
      const a = partOfDay(r.from);
      const b = partOfDay(r.to - 1);
      const note =
        r.from === 0 && r.to >= MINUTES_PER_DAY ? '下一整天。' : r.to > MINUTES_PER_DAY ? `${a}开始下，一直下到第二天${partOfDay(r.to)}。` : a === b ? `${a}有雨。` : `${a}开始下，${b}停。`;
      return { name, icon: 'rain', note };
    }
    case 'snow': {
      const r = w.rain!;
      const name = w.intensity < 0.45 ? '小雪' : w.intensity < 0.8 ? '中雪' : '大雪';
      const a = partOfDay(r.from);
      const when = r.from === 0 && r.to >= MINUTES_PER_DAY ? '下一整天的雪' : `${a}开始下雪`;
      return { name, icon: 'snow', note: `${when}，最高 ${w.high}°，路上会积雪。` };
    }
    case 'fog':
      return { name: '晨雾', icon: 'fog', note: w.fogUntil >= MINUTES_PER_DAY ? '整天都有雾。' : `早上海湾起雾，${formatClock(w.fogUntil)} 前后散去。` };
    case 'cloudy':
      return { name: '多云', icon: 'cloud', note: '云多，不会下雨。' };
    default:
      return { name: '晴', icon: 'sun', note: '晴，海上风平浪静。' };
  }
}

/** Minutes out in the rain without an umbrella before you are wet through. */
export const SOAK_MINUTES = 10;
export const UMBRELLA = 'umbrella';

/**
 * The weather: a day at a time from the season's odds (see SEASON_ODDS), the
 * same for a save every time it is loaded. Storm days shut the ferry, the
 * fishing boats, the beach, the marina and the docks, and keep people
 * indoors; in the rain the beach closes and nobody sits in the park; walking
 * about in it without an umbrella spoils your mood.
 */
export class WeatherSystem {
  /** set to make every day this kind of day (for testing and debugging; not saved) */
  force: Sky | null = null;
  private cache = new Map<number, DayWeather>();
  private cacheKey = '';
  private wet = 0;
  private lastT = -1;
  private last: Conditions | null = null;

  constructor(private core: GameCore) {}

  /** The weather of a day (today by default). */
  day(d = this.core.today()): DayWeather {
    const key = `${this.core.state.meta.seed}|${this.force ?? ''}`;
    if (key !== this.cacheKey) {
      this.cache.clear();
      this.cacheKey = key;
      this.lastT = -1;
    }
    let w = this.cache.get(d);
    if (!w) {
      w = dayWeather(this.core.state.meta.seed, d, this.force);
      if (this.cache.size > 64) this.cache.clear();
      this.cache.set(d, w);
    }
    return w;
  }

  /** What it is like outside now (or at absolute minute t). */
  now(t = this.core.now()): Conditions {
    const whole = Math.floor(t);
    const key = `${this.core.state.meta.seed}|${this.force ?? ''}`;
    if (whole === this.lastT && this.last && key === this.cacheKey) return this.last;
    const day = Math.floor(whole / MINUTES_PER_DAY);
    const c = conditionsAt(this.day(day), this.day(day - 1), whole);
    this.lastT = whole;
    this.last = c;
    return c;
  }

  /** A storm day: no ferry, no boats, nobody out. */
  stormDay(d = this.core.today()): boolean {
    return this.day(d).sky === 'storm';
  }

  /** The storm of the day of absolute minute t. */
  stormAt(t: number): boolean {
    return this.stormDay(Math.floor(t / MINUTES_PER_DAY));
  }

  raining(t = this.core.now()): boolean {
    return this.now(t).raining;
  }

  /** Today and the days after it. */
  forecast(days = 3): DayWeather[] {
    const today = this.core.today();
    return Array.from({ length: days }, (_, i) => this.day(today + i));
  }

  /** Whether the player has an umbrella with them. */
  hasUmbrella(): boolean {
    return this.core.inventory.count(UMBRELLA) > 0;
  }

  /** Out in the street or on the island's lanes (not under a roof). */
  outdoors(): boolean {
    const loc = this.core.state.world.location;
    return loc === 'city' || loc === 'isle';
  }

  /**
   * Every minute. On the evening before a storm the weather service warns
   * everyone; and someone walking about in the rain (the minutes of the live
   * clock, not those skipped in a taxi, at work or asleep) gets wet through
   * unless they carry an umbrella. In a storm an umbrella barely helps.
   */
  tickMinute(t: number, live: boolean): void {
    const d = toDate(t);
    if (d.minuteOfDay === hm(18) && this.stormDay(d.dayIndex + 1)) this.warn(d.dayIndex + 1);
    if (!live) return;
    const c = this.now(t);
    if (!c.raining || !this.outdoors() || this.core.player.activity === 'sleeping') {
      if (this.wet > 0) this.wet = 0;
      return;
    }
    const covered = this.hasUmbrella();
    if (covered && !c.storm) return;
    this.wet++;
    if (this.wet < (covered ? SOAK_MINUTES * 2 : SOAK_MINUTES)) return;
    // soaked: the next soaking only after another hour out in it
    this.wet = -60;
    const pl = this.core.player;
    const cold = c.temp < 12;
    if (covered) {
      pl.addMoodBuff('wet', -2, 120, '风雨太大，伞也挡不住');
      this.core.toast('风太大了，伞差点被吹翻，裤腿全湿了。', 'warn');
      return;
    }
    const hint = onIsle(this.core.state.world.location) ? '灰港的便利店有伞卖。' : '便利店有伞卖。';
    if (c.snowing) {
      pl.addMoodBuff('wet', -3, 180, '落了一身雪');
      pl.change('health', -1);
      this.core.toast(`雪落了一身，化成水渗进了衣领。${hint}`, 'warn');
      return;
    }
    pl.addMoodBuff('wet', cold ? -6 : -4, 180, cold ? '淋了一身冷雨' : '淋了一身雨');
    pl.change('stress', 2);
    if (cold) pl.change('health', -2);
    this.core.toast(cold ? `冷雨浇透了衣服，冻得直打哆嗦。${hint}` : `你被雨淋透了。${hint}`, 'warn');
  }

  private warn(day: number): void {
    const when = toDate(day * MINUTES_PER_DAY);
    // on the island: the last boat tonight, unless today's storm has already stopped them
    const tail = !onIsle(this.core.state.world.location)
      ? '请尽量减少外出。'
      : this.stormDay(day - 1)
        ? '渡轮明天也不开，岛上的民宿和酒店还有空房。'
        : `今晚回灰港的末班渡轮 ${formatClock(hm(20))} 开，错过就要在岛上等到风暴过去。`;
    this.core.phone.send('weather', '灰港气象台', `风暴预警：明天（${when.month + 1}月${when.day}日）有风暴过境，全天大风大雨。灰港—白石湾渡轮、渔船、港湾游船和游艇会全天停航，7 号码头停工，夜市不出摊。${tail}`);
  }
}
