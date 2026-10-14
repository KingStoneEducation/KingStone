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
}

const LUXURY_HOMES = new Set(['home_penthouse', 'home_estate']);

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
      default:
        return casinoFloor(c.hour);
    }
  }
  if (loc === 'city') return c.night ? 'city_night' : 'city_day';
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

export function ambienceFor(c: SoundContext): SpotAmbience {
  if (c.screen !== 'game') return null;
  if (c.location === 'casino' && !c.table) return 'casino';
  if (c.location === 'city' && c.night) return 'city_night';
  if (c.ambience === 'cafe' || (c.ambience === 'restaurant' && c.location !== 'fine_dining')) return 'cafe';
  return null;
}
