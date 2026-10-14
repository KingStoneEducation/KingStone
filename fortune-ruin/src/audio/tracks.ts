import menu from './music/menu.mp3';
import casinoDay from './music/casino_day.mp3';
import casinoNight from './music/casino_night.mp3';
import highlimit from './music/highlimit.mp3';
import poker from './music/poker.mp3';
import cityDay from './music/city_day.mp3';
import cityNight from './music/city_night.mp3';
import home from './music/home.mp3';
import cafe from './music/cafe.mp3';
import bar from './music/bar.mp3';
import upscale from './music/upscale.mp3';
import shop from './music/shop.mp3';
import sfxWin from './sfx/win.mp3';
import sfxBigwin from './sfx/bigwin.mp3';
import sfxBlackjack from './sfx/blackjack.mp3';
import sfxLose from './sfx/lose.mp3';
import sfxPhone from './sfx/phone.mp3';

/**
 * The soundtrack: original pieces composed for the game (sources and the
 * rendering pipeline are in tools/music), rendered with the MIT-licensed
 * FluidR3 GM soundfont. Each file holds one loop period as it sounds while
 * looping — taken from the piece's second pass, so reverb and releases from
 * the end carry into the start — plus a one-second tail; `loopStart` and
 * `period` are exact, so the engine loops between sample positions without a
 * seam. (A track with an intro starts at 0 and loops from `loopStart`.)
 */
export type TrackId = 'menu' | 'casino_day' | 'casino_night' | 'highlimit' | 'poker' | 'city_day' | 'city_night' | 'home' | 'cafe' | 'bar' | 'upscale' | 'shop';

export interface TrackInfo {
  url: string;
  title: string;
  /** seconds into the file where the repeating part begins */
  loopStart: number;
  /** length of one repetition, seconds */
  period: number;
  /** total length of the file, seconds */
  duration: number;
}

export const TRACKS: Record<TrackId, TrackInfo> = {
  menu: { url: menu, title: '夜色筹码（主题）', loopStart: 115.2, period: 102.4, duration: 218.6 },
  casino_day: { url: casinoDay, title: '幸运七（赌场 · 白天）', loopStart: 0, period: 128, duration: 129 },
  casino_night: { url: casinoNight, title: '午夜筹码（赌场 · 夜晚）', loopStart: 0, period: 96, duration: 97 },
  highlimit: { url: highlimit, title: '丝绒绳后（高额区与 VIP 厅）', loopStart: 0, period: 96, duration: 97 },
  poker: { url: poker, title: '读牌（扑克室）', loopStart: 0, period: 76.8, duration: 77.8 },
  city_day: { url: cityDay, title: '灰港的早晨（城市 · 白天）', loopStart: 0, period: 76.8, duration: 77.8 },
  city_night: { url: cityNight, title: '霓虹与雨（城市 · 夜晚）', loopStart: 0, period: 96, duration: 97 },
  home: { url: home, title: '回家（住处）', loopStart: 0, period: 80, duration: 81 },
  cafe: { url: cafe, title: '港口咖啡（咖啡馆与餐厅）', loopStart: 0, period: 61.44, duration: 62.44 },
  bar: { url: bar, title: '最后一杯（酒吧）', loopStart: 0, period: 80, duration: 81 },
  upscale: { url: upscale, title: '水晶灯下（高级场所）', loopStart: 0, period: 80, duration: 81 },
  shop: { url: shop, title: '营业中（商店与办公）', loopStart: 0, period: 76.8, duration: 77.8 },
};

export type StingerId = 'win' | 'bigwin' | 'blackjack' | 'lose' | 'phone';

export const STINGERS: Record<StingerId, string> = {
  win: sfxWin,
  bigwin: sfxBigwin,
  blackjack: sfxBlackjack,
  lose: sfxLose,
  phone: sfxPhone,
};

/** Playback starts this far into the loop region, past any encoder delay at the head of the file. */
export const LOOP_PAD = 0.25;
