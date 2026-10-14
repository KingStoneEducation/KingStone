import { EventBus } from './EventBus';
import { Rng } from './rng';
import { G, formatG, type Money } from './money';
import { MINUTES_PER_DAY, toDate } from './calendar';
import type { Bill, Encounter, GameState, JournalEntry, Loan, MemberTier, Memory, PhoneMessage, RelDims, Txn, AccountId } from './state';
import { EconomySystem } from '../systems/EconomySystem';
import { PlayerSystem, type Activity } from '../systems/PlayerSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { HousingSystem } from '../systems/HousingSystem';
import { CareerSystem } from '../systems/CareerSystem';
import { CasinoManager } from '../systems/CasinoManager';
import { MarketSystem } from '../systems/MarketSystem';
import { NPCManager } from '../systems/NPCManager';
import { SocialSystem } from '../systems/SocialSystem';
import { DialogueEngine } from '../systems/DialogueEngine';
import { EventManager, type EventPrompt } from '../systems/EventManager';
import { JournalSystem, PhoneSystem } from '../systems/PhoneSystem';
import { WealthSystem } from '../systems/WealthSystem';
import { ServicesSystem } from '../systems/ServicesSystem';
import { EncounterSystem } from '../systems/EncounterSystem';
import { StorySystem } from '../systems/StorySystem';
import { OUTREACH_HOURS, OutreachSystem } from '../systems/OutreachSystem';
import { RomanceSystem } from '../systems/RomanceSystem';
import { BusinessSystem } from '../systems/BusinessSystem';
import { CompanionSystem } from '../systems/CompanionSystem';
import { SkyFloorSystem, SUITE_COMFORT } from '../systems/SkyFloorSystem';
import { PawnSystem } from '../systems/PawnSystem';
import { OldTownSystem } from '../systems/OldTownSystem';
import { HOMES } from '../data/housing';

export interface GameEvents {
  money: { account: AccountId; balance: Money; delta: Money; txn: Txn };
  'time:hour': { hour: number };
  'time:day': { day: number };
  'time:skip': { minutes: number };
  toast: { text: string; tone?: 'info' | 'good' | 'bad' | 'warn' };
  'phone:message': { message: PhoneMessage };
  journal: { entry: JournalEntry };
  relationship: { npc: string; delta: Partial<RelDims>; reason: string };
  memory: { npc: string; memory: Memory };
  appearance: Record<string, never>;
  purchase: { itemId: string; shopId: string; amount: Money };
  drink: { itemId: string };
  'bill:paid': { bill: Bill; late: boolean };
  'bill:late': { bill: Bill; daysLate: number };
  'loan:missed': { loan: Loan };
  'loan:default': { loan: Loan };
  'loan:paid': { loan: Loan };
  'rent:overdue': { days: number; total: Money };
  evicted: { from: string };
  moved: { homeId: string };
  'shift:done': { jobId: string; perf: number };
  'casino:tier': { tier: MemberTier };
  'casino:round': { game: string; tableId: string; stake: Money; ret: Money; net: Money };
  'casino:left': { net: Money; rounds: number; hours: number };
  'casino:sit': { tableId: string };
  'casino:watched': { heat: number };
  'casino:backoff': Record<string, never>;
  'casino:notable': { net: Money };
  'casino:bgResult': { tableId: string; text: string };
  'patron:emote': { id: string; emote: string; net: Money };
  'patron:left': { id: string; net: Money };
  'patron:arrived': { id: string; tableId: string };
  'npc:arrived': { id: string; location: string | null };
  'npc:encounter': { encounter: Encounter };
  'dialogue:start': { npc: string };
  'dialogue:end': { npc: string };
  'npc:departed': { id: string; from: string | null; to: string | null };
  'npc:moved': { id: string };
  invest: { id: string; units: number; side: 'buy' | 'sell'; amount: Money; pnl?: Money };
  'event:prompt': { prompt: EventPrompt };
  'world:teleport': { location: string; spawn: string | null };
  'player:collapse': { reason: 'sleep' | 'health'; text: string };
  'ui:open': { panel: string };
  autosave: { reason: string };
}

export const MS_PER_MINUTE = { world: 700, table: 2400 };

export class GameCore {
  state: GameState;
  bus = new EventBus<GameEvents>();
  rng: Rng;
  /** reasons the clock is currently stopped (menus, dialogue...) */
  paused = new Set<string>();
  /** UI change counter */
  version = 0;
  timeMode: 'world' | 'table' = 'world';
  speed = 1;
  private acc = 0;
  private advancing = false;

  economy: EconomySystem;
  player: PlayerSystem;
  inventory: InventorySystem;
  housing: HousingSystem;
  career: CareerSystem;
  casino: CasinoManager;
  market: MarketSystem;
  npcs: NPCManager;
  social: SocialSystem;
  dialogue: DialogueEngine;
  events: EventManager;
  phone: PhoneSystem;
  journal: JournalSystem;
  wealth: WealthSystem;
  services: ServicesSystem;
  encounters: EncounterSystem;
  stories: StorySystem;
  outreach: OutreachSystem;
  romance: RomanceSystem;
  business: BusinessSystem;
  companions: CompanionSystem;
  sky: SkyFloorSystem;
  pawn: PawnSystem;
  oldtown: OldTownSystem;

  constructor(state: GameState) {
    this.state = state;
    this.rng = new Rng(state.rng);
    this.economy = new EconomySystem(this);
    this.player = new PlayerSystem(this);
    this.inventory = new InventorySystem(this);
    this.housing = new HousingSystem(this);
    this.career = new CareerSystem(this);
    this.market = new MarketSystem(this);
    this.npcs = new NPCManager(this);
    this.social = new SocialSystem(this);
    this.casino = new CasinoManager(this);
    this.dialogue = new DialogueEngine(this);
    this.events = new EventManager(this);
    this.phone = new PhoneSystem(this);
    this.journal = new JournalSystem(this);
    this.wealth = new WealthSystem(this);
    this.services = new ServicesSystem(this);
    this.encounters = new EncounterSystem(this);
    this.stories = new StorySystem(this);
    this.outreach = new OutreachSystem(this);
    this.romance = new RomanceSystem(this);
    this.business = new BusinessSystem(this);
    this.companions = new CompanionSystem(this);
    this.sky = new SkyFloorSystem(this);
    this.pawn = new PawnSystem(this);
    this.oldtown = new OldTownSystem(this);
  }

  now(): number {
    return this.state.time.minutes;
  }

  /** Current time including the fraction of the minute in progress (for smooth animation only). */
  nowFloat(): number {
    if (this.paused.size > 0) return this.state.time.minutes;
    const ms = MS_PER_MINUTE[this.timeMode] / this.speed;
    return this.state.time.minutes + Math.min(0.999, this.acc / ms);
  }

  today(): number {
    return Math.floor(this.state.time.minutes / MINUTES_PER_DAY);
  }

  touch(): void {
    this.version++;
  }

  /** Persist RNG position into the state (call before saving). */
  syncRng(): void {
    this.state.rng = this.rng.getState();
  }

  isAtHome(): boolean {
    return this.state.world.location === HOMES[this.state.housing.homeId].location;
  }

  requestTeleport(location: string, spawn: string | null): void {
    this.bus.emit('world:teleport', { location, spawn });
  }

  toast(text: string, tone: GameEvents['toast']['tone'] = 'info'): void {
    this.bus.emit('toast', { text, tone });
  }

  // ------------------------------------------------------------ clock

  /** Real-time progression, called every frame with the elapsed milliseconds. */
  update(deltaMs: number): void {
    this.state.meta.playMs += deltaMs;
    if (this.paused.size > 0 || this.advancing) return;
    const ms = MS_PER_MINUTE[this.timeMode] / this.speed;
    this.acc += Math.min(deltaMs, 250);
    let guard = 0;
    while (this.acc >= ms && guard++ < 5) {
      this.acc -= ms;
      this.tickMinute(this.player.activity);
    }
  }

  /** Skip time (sleep, work, travel, eating...). */
  advance(minutes: number, activity: Activity): void {
    const n = Math.max(0, Math.round(minutes));
    if (n === 0) return;
    const wasAdvancing = this.advancing;
    this.advancing = true;
    let collapsed: 'sleep' | 'health' | null = null;
    for (let i = 0; i < n; i++) {
      this.tickMinute(activity);
      if (activity !== 'sleeping') {
        collapsed = this.player.mustCollapse();
        if (collapsed) break;
      }
    }
    this.advancing = wasAdvancing;
    this.bus.emit('time:skip', { minutes: n });
    if (collapsed && !this.advancing) this.collapse(collapsed);
    this.touch();
  }

  private tickMinute(activity: Activity): void {
    const before = toDate(this.state.time.minutes);
    this.state.time.minutes += 1;
    const t = this.state.time.minutes;
    const d = toDate(t);
    this.player.tick(1, activity);
    this.npcs.tick(t);
    this.encounters.tick(t);
    this.career.tickMinute(t, activity);
    this.events.tickMinute(t);
    this.casino.tickBackground(1);
    if (d.hour !== before.hour) this.onHour(d.hour);
    if (d.dayIndex !== before.dayIndex) this.onDay(d.dayIndex);
    if (activity !== 'sleeping' && !this.advancing) {
      const c = this.player.mustCollapse();
      if (c) this.collapse(c);
    }
  }

  private onHour(hour: number): void {
    // NPCs sharing the place notice the player
    for (const id of this.social.presentNpcs(10)) this.social.observePlayer(id);
    if (this.state.world.location === 'casino') {
      for (const id of this.social.presentNpcs()) {
        if (this.casino.recentHours(7) > 12) this.social.applyDirect(id, { kind: 'seen_casino', facets: { gambling: 0.2 }, importance: 8 }, { silent: true });
      }
    }
    if (hour === 8) {
      this.career.processApplications();
      this.events.dailyPass('morning');
    }
    if (hour === 9) {
      this.career.processPay();
      this.economy.processBills();
      this.housing.processRent();
      this.events.processReceivables();
      this.events.processPlayerDebts();
    }
    if (hour === 11) this.stories.dailyPass();
    if (hour === 7) this.romance.dailyPass();
    if (OUTREACH_HOURS.includes(hour)) this.outreach.pass(hour);
    if (hour === 18) this.events.dailyPass('evening');
    this.sky.hourly(hour);
    this.bus.emit('time:hour', { hour });
  }

  private onDay(day: number): void {
    // the shop's takings for the day that just ended come in before the snapshot
    this.business.endOfDay(day - 1);
    this.wealth.dailySnapshot(day - 1);
    this.economy.rolloverDay(day);
    this.economy.processLoans();
    this.market.dailyUpdate(day);
    this.npcs.dailyUpdate(day);
    this.social.dailyDrift(day);
    this.social.spreadRumors();
    this.casino.dailyUpdate();
    this.pawn.daily(day);
    const d = toDate(day * MINUTES_PER_DAY);
    if (d.day === 1) {
      this.housing.issueMonthlyBills();
      this.business.monthlyBills();
      this.economy.payMonthlyInterest();
      this.casino.monthlyReview();
      this.career.monthlyReset();
    }
    if (toDate(day * MINUTES_PER_DAY).weekday === 0) this.business.weekly();
    this.bus.emit('time:day', { day });
    this.bus.emit('autosave', { reason: 'day' });
  }

  // ------------------------------------------------------------ sleep & collapse

  canSleep(): string | null {
    if (!this.isAtHome()) {
      const err = this.sky.sleepRefusal();
      if (err) return err;
    }
    if (this.state.player.stats.sleep > 92) return '你现在一点也不困';
    return null;
  }

  /** How restful sleep is where the player is: their home, or the casino suite. */
  sleepComfort(): number {
    return !this.isAtHome() && this.sky.inSuite() ? SUITE_COMFORT : this.housing.comfort();
  }

  /** Sleep until the given hour (next occurrence) or for N hours. */
  sleep(hours: number): string {
    const err = this.canSleep();
    if (err) return err;
    const minutes = Math.round(hours * 60);
    this.advance(minutes, 'sleeping');
    this.state.player.lastSleepAt = this.now();
    this.state.player.awakeSince = this.now();
    this.bus.emit('autosave', { reason: 'sleep' });
    return `睡了 ${hours} 小时。`;
  }

  /** Passing out from exhaustion or illness costs time, money and dignity. */
  collapse(reason: 'sleep' | 'health'): void {
    if (this.advancing) return;
    const where = this.state.world.location;
    const atHome = this.isAtHome();
    let text: string;
    if (reason === 'health') {
      const insured = !this.economy.overdueBills().some((b) => b.kind === 'insurance');
      const bill = insured ? G(140) : G(480);
      this.economy.pay(bill, 'medical', insured ? '急诊（保险报销后自付）' : '急诊费用（无保险）', 'hospital', ['bank', 'cash']) ;
      this.social.witness({ kind: 'drunk_scene', facets: { recklessness: 0.5, crisis: 0.3 }, importance: 20 });
      this.advance(10 * 60, 'sleeping');
      this.state.player.stats.health = 45;
      text = `你的身体撑不住了，在${where === 'city' ? '街头' : '这里'}晕倒，被送进了灰港综合医院。${insured ? '保险报销了大部分费用。' : `没有有效保险，你支付了 ${formatG(bill)}。`}`;
      this.journal.add('life', text, true);
    } else {
      if (!atHome) this.social.witness({ kind: 'drunk_scene', facets: { recklessness: 0.4 }, importance: 16 });
      this.advance(9 * 60, 'sleeping');
      text = atHome ? '你困得倒头就睡。' : '你实在撑不住，靠在角落里睡着了。醒来时浑身酸痛，钱包也被人翻过……';
      if (!atHome) {
        const lost = Math.min(this.economy.balance('cash'), Math.round((this.economy.balance('cash') * this.rng.range(0, 0.3)) / 100) * 100);
        if (lost > 0) {
          this.economy.spend('cash', lost, 'other', '昏睡时现金被偷', 'thief');
          text += `（少了 ${formatG(lost)} 现金）`;
        }
        this.journal.add('life', text, true);
      }
    }
    this.state.player.lastSleepAt = this.now();
    if (where === 'casino') this.casino.leaveCasino();
    const home = HOMES[this.state.housing.homeId].location;
    this.setLocation(home, -1, -1);
    this.bus.emit('player:collapse', { reason, text });
    this.requestTeleport(home, 'bed');
  }

  /** Authoritative location change (the world scene mirrors it). x/y = -1 means "use the spawn point". */
  setLocation(location: string, x: number, y: number): void {
    const w = this.state.world;
    if (w.location !== location) {
      if (w.location === 'casino' && location !== 'casino') this.casino.leaveCasino();
      w.visited[location] = (w.visited[location] ?? 0) + 1;
      (w.lastVisit ??= {})[location] = this.today();
      w.location = location;
      if (location === 'casino') this.casino.enterCasino();
    }
    if (x >= 0) w.x = x;
    if (y >= 0) w.y = y;
    this.touch();
  }
}
