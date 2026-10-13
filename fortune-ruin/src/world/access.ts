import type { GameCore } from '../core/GameCore';
import { toDate } from '../core/calendar';
import { LOCATIONS, hoursText, isOpen } from '../data/locations';
import { HOMES } from '../data/housing';

/** Whether the player may enter a location right now; returns a reason when not. */
export function entryRefusal(core: GameCore, loc: string): string | null {
  const def = LOCATIONS[loc];
  if (!def) return '这里进不去。';
  const d = toDate(core.now());
  const p = core.state.player;
  // homes
  const home = Object.values(HOMES).find((h) => h.location === loc);
  if (home) {
    const h = core.state.housing;
    if (h.homeId === home.id || h.owned.includes(home.id)) return null;
    return home.id === 'home_basic' ? '这里已经不是你的家了。' : `这是${home.name}。门禁卡刷不开——你不住这里。（可以在手机或电脑上查看房源）`;
  }
  // working there lets you in outside opening hours
  const worksHere = core.career.activeJobs().some((j) => core.career.def(j.jobId).location === loc);
  if (!worksHere && !isOpen(def, d.weekday, d.minuteOfDay)) return `${def.name}已经打烊了。营业时间：${hoursText(def)}`;
  if (loc === 'casino') {
    if (core.state.casino.bannedUntil > core.now()) return '安保拦住了你：「抱歉，您目前处于禁止入场期。」';
    if (p.stats.drunk >= 72) return '门口的安保打量了你一下：「先生/女士，您喝得太多了，今晚请回吧。」';
  }
  if (def.access === 'employees' && !worksHere) return '前台拦住了你：「这里是办公区域，访客请预约。」';
  if (def.access === 'members') {
    const guest = Number(p.flags.clubGuestUntil ?? -1) >= core.today();
    if (!p.flags.clubMember && !guest) return '门房礼貌地欠身：「子午线会所仅接待会员与会员的宾客。」';
  }
  if (def.access === 'reservation') {
    const invited = core.events.upcoming().some((e) => e.status === 'accepted' && e.location === loc && Math.abs(e.at - core.now()) < 180);
    if (p.flags.lumiereReservation !== core.today() && !invited) return '领位员查了查名单：「抱歉，没有您的预订。可以用手机提前预订。」';
  }
  if (def.dressCode !== undefined) {
    const prestige = core.inventory.currentOutfit().prestige ?? 0;
    if (prestige < def.dressCode) return '门童看了看你的着装：「抱歉，本店有着装要求。」';
  }
  return null;
}
