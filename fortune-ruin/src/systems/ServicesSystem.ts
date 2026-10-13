import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { toDate } from '../core/calendar';
import { NPCS } from '../data/npcs';
import { LOCATION_BUILDING, BUILDING_BY_ID, locationAnchor } from '../world/maps/cityLayout';

export type ServiceResult = { ok: true; message: string } | { ok: false; error: string };

export const CLUB_ANNUAL_FEE = G(12000);
export const LUMIERE_BOOKING_FEE = G(30);
const TAXI_BASE = G(8);

/**
 * Paid lifestyle services: club membership, restaurant bookings and
 * getting around town. Each has explicit requirements and prices.
 */
export class ServicesSystem {
  constructor(private core: GameCore) {}

  // ------------------------------------------------------------ Meridian Club

  isClubMember(): boolean {
    const until = Number(this.core.state.player.flags.clubMemberUntil ?? -1);
    return !!this.core.state.player.flags.clubMember && until >= this.core.today();
  }

  /** A member who likes you enough can sponsor you. */
  clubSponsor(): string | null {
    const soc = this.core.social;
    for (const n of NPCS) {
      if (n.district !== '山丘富人区') continue;
      const r = soc.rel(n.id);
      if ((r.status === 'friend' || r.status === 'close' || r.status === 'partner') && r.trust >= 25) return n.id;
    }
    return null;
  }

  clubCheck(): string | null {
    if (this.isClubMember()) return '你已经是子午线会所的会员了';
    const sponsor = this.clubSponsor();
    const nw = this.core.economy.netWorth();
    const rep = this.core.state.player.reputation.social;
    if (!sponsor && !(nw >= G(1000000) && rep >= 40)) return '入会需要一位会员担保（山丘区的朋友），或净资产 100 万 G 以上且有一定社会声望';
    if (this.core.economy.balance('bank') < CLUB_ANNUAL_FEE) return `银行存款不足以支付年费 ${formatG(CLUB_ANNUAL_FEE)}`;
    return null;
  }

  joinClub(): ServiceResult {
    const err = this.clubCheck();
    if (err) return { ok: false, error: err };
    const r = this.core.economy.spend('bank', CLUB_ANNUAL_FEE, 'entertainment', '子午线会所年费', 'club');
    if (!r.ok) return { ok: false, error: r.error };
    const f = this.core.state.player.flags;
    f.clubMember = true;
    f.clubMemberUntil = this.core.today() + 336;
    const sponsor = this.clubSponsor();
    this.core.journal.add('milestone', `成为子午线会所会员${sponsor ? `（担保人：${NPCS.find((n) => n.id === sponsor)?.name}）` : ''}。`, true);
    this.core.touch();
    return { ok: true, message: '欢迎加入子午线会所。会员卡已寄到你的住处。' };
  }

  // ------------------------------------------------------------ Lumière

  /** Book a table for today (before 21:00) or tomorrow. */
  bookLumiere(tomorrow: boolean): ServiceResult {
    const day = this.core.today() + (tomorrow ? 1 : 0);
    const d = toDate(this.core.now());
    if (!tomorrow && d.hour >= 21) return { ok: false, error: '今晚已经订满了，请预订明天' };
    if (Number(this.core.state.player.flags.lumiereReservation ?? -1) === day) return { ok: false, error: '那天你已经有预订了' };
    const r = this.core.economy.spend('bank', LUMIERE_BOOKING_FEE, 'food', 'Lumière 订位费', 'fine_dining');
    if (!r.ok) return { ok: false, error: r.error };
    this.core.state.player.flags.lumiereReservation = day;
    this.core.touch();
    return { ok: true, message: `已预订 ${tomorrow ? '明天' : '今天'}晚上的 Lumière 餐位（订位费 ${formatG(LUMIERE_BOOKING_FEE)}，不可退）。请注意着装要求。` };
  }

  // ------------------------------------------------------------ getting around

  private distance(from: { x: number; y: number }, to: { x: number; y: number }): number {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  }

  /** Where the player currently is on the city map (door of the current venue). */
  originTile(): { x: number; y: number } {
    const w = this.core.state.world;
    if (w.location === 'city') return { x: w.x, y: w.y };
    return locationAnchor(w.location, null);
  }

  destinationTile(loc: string): { x: number; y: number } | null {
    const b = LOCATION_BUILDING[loc];
    const bd = b ? BUILDING_BY_ID[b] : null;
    if (!bd?.door) return null;
    return { x: bd.door.x + Math.floor(((bd.door.w ?? 1) - 1) / 2), y: bd.door.y + 1 };
  }

  taxiQuote(loc: string): { fare: Money; minutes: number } | null {
    const to = this.destinationTile(loc);
    if (!to) return null;
    const d = this.distance(this.originTile(), to);
    const night = toDate(this.core.now()).hour < 6 || toDate(this.core.now()).hour >= 22;
    const fare = Math.round((TAXI_BASE + d * 12 * (night ? 1.3 : 1)) / 100) * 100;
    return { fare, minutes: Math.max(4, Math.round(d / 9) + 3) };
  }

  driveQuote(loc: string): { cost: Money; minutes: number } | null {
    const v = this.core.inventory.vehicle();
    const to = this.destinationTile(loc);
    if (!v?.vehicle || !to) return null;
    const d = this.distance(this.originTile(), to);
    if (v.id === 'bicycle') return { cost: 0, minutes: Math.max(3, Math.round(d / 5) + 1) };
    return { cost: v.vehicle.tripCost, minutes: Math.max(3, Math.round(d / 11) + 2) };
  }

  /** Pays and spends the travel time; the caller moves the player. */
  travel(loc: string, mode: 'taxi' | 'drive'): ServiceResult {
    if (this.core.state.player.stats.drunk >= 30 && mode === 'drive') return { ok: false, error: '你喝了酒，不能开车' };
    if (mode === 'taxi') {
      const q = this.taxiQuote(loc);
      if (!q) return { ok: false, error: '无法到达那里' };
      const r = this.core.economy.pay(q.fare, 'transport', '出租车车费', 'taxi', ['cash', 'bank']);
      if (!r.ok) return { ok: false, error: r.error };
      this.core.advance(q.minutes, 'idle');
      return { ok: true, message: `打车 ${q.minutes} 分钟，车费 ${formatG(q.fare)}` };
    }
    const q = this.driveQuote(loc);
    if (!q) return { ok: false, error: '你没有交通工具' };
    if (q.cost > 0) {
      const r = this.core.economy.pay(q.cost, 'vehicle', '油费与停车费', 'parking', ['cash', 'bank']);
      if (!r.ok) return { ok: false, error: r.error };
    }
    this.core.advance(q.minutes, 'idle');
    return { ok: true, message: `${this.core.inventory.vehicle()?.id === 'bicycle' ? '骑车' : '开车'} ${q.minutes} 分钟${q.cost ? `，花费 ${formatG(q.cost)}` : ''}` };
  }
}
