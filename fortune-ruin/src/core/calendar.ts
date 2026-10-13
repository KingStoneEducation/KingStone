/**
 * Calendar: 1 day = 1440 minutes, 7-day weeks, 28-day months, 12 months a year.
 * Day 0 of the epoch is Year 1, January 1st, a Monday.
 */
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 28;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'];
export const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
export const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export interface GameDate {
  totalMinutes: number;
  /** Absolute day number since the epoch. */
  dayIndex: number;
  year: number;
  /** 0-11 */
  month: number;
  /** 1-28 */
  day: number;
  /** 0 = Monday ... 6 = Sunday */
  weekday: number;
  hour: number;
  minute: number;
  /** minutes since midnight */
  minuteOfDay: number;
  season: Season;
  isWeekend: boolean;
}

export function seasonOfMonth(month: number): Season {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

export function toDate(totalMinutes: number): GameDate {
  const t = Math.max(0, Math.floor(totalMinutes));
  const dayIndex = Math.floor(t / MINUTES_PER_DAY);
  const minuteOfDay = t - dayIndex * MINUTES_PER_DAY;
  const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
  const dayOfYear = dayIndex % DAYS_PER_YEAR;
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH);
  const day = (dayOfYear % DAYS_PER_MONTH) + 1;
  const weekday = dayIndex % DAYS_PER_WEEK;
  return {
    totalMinutes: t,
    dayIndex,
    year,
    month,
    day,
    weekday,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    minuteOfDay,
    season: seasonOfMonth(month),
    isWeekend: weekday >= 5,
  };
}

export function fromDate(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const dayIndex = (year - 1) * DAYS_PER_YEAR + month * DAYS_PER_MONTH + (day - 1);
  return dayIndex * MINUTES_PER_DAY + hour * 60 + minute;
}

export function dayStart(dayIndex: number): number {
  return dayIndex * MINUTES_PER_DAY;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatClock(minuteOfDay: number): string {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function formatDate(d: GameDate, withYear = false): string {
  const base = `${MONTH_NAMES[d.month]}${d.day}日 ${WEEKDAY_NAMES[d.weekday]}`;
  return withYear ? `第${d.year}年 ${base}` : base;
}

export function formatDateTime(totalMinutes: number, withYear = false): string {
  const d = toDate(totalMinutes);
  return `${formatDate(d, withYear)} ${formatClock(d.minuteOfDay)}`;
}

/** Short relative description such as "3天前". */
export function formatAgo(now: number, then: number): string {
  const diff = Math.max(0, now - then);
  if (diff < 60) return '刚才';
  if (diff < MINUTES_PER_DAY) return `${Math.floor(diff / 60)}小时前`;
  const days = Math.floor(diff / MINUTES_PER_DAY);
  if (days < 28) return `${days}天前`;
  return `${Math.floor(days / 28)}个月前`;
}

/** Sunrise / sunset (minutes after midnight) varying smoothly with the time of year. */
export function sunTimes(dayIndex: number): { sunrise: number; sunset: number } {
  const dayOfYear = dayIndex % DAYS_PER_YEAR;
  // Longest day around the middle of July (month 6, day 14 => day 182).
  const phase = ((dayOfYear - 182) / DAYS_PER_YEAR) * Math.PI * 2;
  const k = Math.cos(phase); // 1 at midsummer, -1 at midwinter
  const sunrise = Math.round(6.5 * 60 - k * 70);
  const sunset = Math.round(18.75 * 60 + k * 100);
  return { sunrise, sunset };
}

/**
 * 0 = deep night, 1 = full daylight, with ~70 minute twilight ramps.
 */
export function daylight(totalMinutes: number): number {
  const d = toDate(totalMinutes);
  const { sunrise, sunset } = sunTimes(d.dayIndex);
  const m = d.minuteOfDay;
  const ramp = 70;
  if (m <= sunrise - ramp || m >= sunset + ramp) return 0;
  if (m >= sunrise + ramp && m <= sunset - ramp) return 1;
  if (m < sunrise + ramp) return smooth((m - (sunrise - ramp)) / (2 * ramp));
  return smooth(1 - (m - (sunset - ramp)) / (2 * ramp));
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Starting moment of a new game: Year 1, March 1st (Monday) 07:00. */
export const GAME_START_MINUTES = fromDate(1, 2, 1, 7, 0);

/** True if minuteOfDay lies within [start, end), supporting ranges past midnight (end > 1440 or end < start). */
export function inTimeRange(minuteOfDay: number, start: number, end: number): boolean {
  if (end > MINUTES_PER_DAY) return minuteOfDay >= start || minuteOfDay < end - MINUTES_PER_DAY;
  if (end < start) return minuteOfDay >= start || minuteOfDay < end;
  return minuteOfDay >= start && minuteOfDay < end;
}

export function hm(h: number, m = 0): number {
  return h * 60 + m;
}
