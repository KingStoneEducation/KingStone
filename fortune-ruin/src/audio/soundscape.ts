import type { Ambience } from '../data/locations';
import type { CasinoArea } from '../world/maps/casinoMap';
import type { TrackId } from './tracks';

/** What decides the music: where the player is, when, and what they are doing. */
export interface SoundContext {
  screen: 'boot' | 'menu' | 'create' | 'game';
  location: string | null;
  ambience: Ambience | null;
  /** hour of the day, 0..23 */
  hour: number;
  /** after dusk / before dawn outdoors */
  night: boolean;
  /** room of the casino the player stands in */
  casinoArea: CasinoArea | null;
  /** the table the player sits at */
  table: { game: string; area: string } | null;
  /** among the stalls of the night market while it is open */
  nightMarket?: boolean;
  /** what it is doing outside */
  weather?: { raining: boolean; intensity: number; storm: boolean; fog: number };
}

const LUXURY_HOMES = new Set(['home_penthouse', 'home_estate']);
const SKY_AREAS = new Set<CasinoArea>(['sky_lobby', 'sky_lounge', 'sky_bar', 'spa', 'boutique', 'suite']);

/** The casino has no windows: it follows the clock, the evening crowd from eight. */
function casinoFloor(hour: number): TrackId {
  return hour >= 20 || hour < 6 ? 'casino_night' : 'casino_day';
}

export function musicFor(c: SoundContext): TrackId | null {
  if (c.screen === 'boot') return null;
  if (c.screen !== 'game') return 'menu';
  if (c.table) {
    if (c.table.game === 'poker') return 'poker';
    if (c.table.area === 'high' || c.table.area === 'vip') return 'highlimit';
    return casinoFloor(c.hour);
  }
  const loc = c.location ?? '';
  if (loc === 'casino') {
    switch (c.casinoArea) {
      case 'poker':
        return 'poker';
      case 'vip':
      case 'high':
        return 'highlimit';
      case 'office':
        return 'upscale';
      case 'spa':
        return 'spa';
      case 'sky_lobby':
      case 'sky_lounge':
      case 'sky_bar':
      case 'boutique':
      case 'suite':
        return 'skyline';
      default:
        return casinoFloor(c.hour);
    }
  }
  if (loc === 'city') return c.nightMarket ? 'night_market' : c.night ? 'city_night' : 'city_day';
  // the island across the bay has its own: steel pan by day, the lighthouse at night; the fishermen's diner too
  if (loc === 'isle' || loc === 'isle_diner') return c.night ? 'isle_night' : 'isle_day';
  if (LUXURY_HOMES.has(loc)) return 'upscale';
  switch (c.ambience) {
    case 'home':
      return 'home';
    case 'cafe':
      return 'cafe';
    case 'restaurant':
      return loc === 'fine_dining' ? 'upscale' : 'cafe';
    case 'bar':
      return 'bar';
    case 'club':
      return 'upscale';
    case 'boutique':
      return loc === 'luxury' ? 'upscale' : 'shop';
    case 'store':
    case 'bank':
    case 'office':
      return 'shop';
    default:
      return null;
  }
}

/** Sparse spot sounds only (no continuous noise beds). */
export type SpotAmbience = 'casino' | 'city_night' | 'cafe' | null;

const outdoors = (c: SoundContext) => c.location === 'city' || c.location === 'isle';

export function ambienceFor(c: SoundContext): SpotAmbience {
  if (c.screen !== 'game') return null;
  // no chips clicking on the quiet members' floor
  if (c.location === 'casino' && !c.table) return c.casinoArea && SKY_AREAS.has(c.casinoArea) ? null : 'casino';
  // the night's small sounds are drowned by the rain
  if (outdoors(c) && c.night) return c.weather?.raining ? null : 'city_night';
  if (c.ambience === 'cafe' || (c.ambience === 'restaurant' && c.location !== 'fine_dining')) return 'cafe';
  return null;
}

/** The weather as heard from where you are: how hard the rain falls on you or on the roof, and the foghorn. */
export interface WeatherSound {
  /** 0..1 */
  rain: number;
  /** heard through a roof and windows */
  muffled: boolean;
  foghorn: boolean;
}

export function weatherSoundFor(c: SoundContext): WeatherSound | null {
  if (c.screen !== 'game' || !c.weather) return null;
  // the casino floor has no windows and the tables are in it
  if (c.location === 'casino' && (c.table || !c.casinoArea || !SKY_AREAS.has(c.casinoArea))) return null;
  const out = outdoors(c);
  const rain = c.weather.raining ? (c.weather.storm ? 1 : 0.25 + 0.75 * c.weather.intensity) : 0;
  return { rain, muffled: !out, foghorn: out && c.weather.fog > 0.5 };
}
