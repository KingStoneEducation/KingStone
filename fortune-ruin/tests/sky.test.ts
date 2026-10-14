import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import type { MemberTier } from '../src/core/state';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { NPC_BY_ID } from '../src/data/npcs';
import { CHECKOUT, COMP_STORE, SUITE_RATES } from '../src/systems/SkyFloorSystem';
import { LUMIERE_BOOKING_FEE } from '../src/systems/ServicesSystem';
import { casinoArea, LIFT_GROUND, LIFT_SKY, SKY_X } from '../src/world/maps/casinoMap';
import { interiorMap } from '../src/world/maps/interiors';
import { regionAt } from '../src/world/maps/types';
import { reachable } from '../src/world/gates';
import { newCore } from './helpers';

/** A tile inside suite 1201 and one in the members' lounge. */
const SUITE = { x: SKY_X + 38, y: 27 };
const LOUNGE = { x: SKY_X + 6, y: 13 };

function at(c: GameCore, tile: { x: number; y: number }): void {
  c.setLocation('casino', tile.x, tile.y);
  c.state.world.x = tile.x;
  c.state.world.y = tile.y;
}

function member(c: GameCore, tier: MemberTier): void {
  c.state.casino.membership.tier = tier;
}

/** Minutes of the next Saturday at hh:mm, counting from today. */
function saturday(c: GameCore, hh: number, mm = 0): number {
  for (let d = c.today(); d < c.today() + 8; d++) if (toDate(d * MINUTES_PER_DAY).weekday === 5) return d * MINUTES_PER_DAY + hh * 60 + mm;
  throw new Error('no saturday');
}

describe('the members floor is upstairs, separate from the gaming floor', () => {
  const m = interiorMap('casino');

  it('the two floors are not connected on foot, only by the lift', () => {
    const fromDoor = reachable(m, m.spawns.entry.x, m.spawns.entry.y);
    expect(fromDoor[LIFT_GROUND.y * m.w + LIFT_GROUND.x]).toBe(1);
    expect(fromDoor[LIFT_SKY.y * m.w + LIFT_SKY.x]).toBe(0);
    expect(regionAt(m, LIFT_SKY.x, LIFT_SKY.y)?.id).toBe('sky');
    expect(regionAt(m, LIFT_GROUND.x, LIFT_GROUND.y)?.id).toBe('ground');
    expect(regionAt(m, LIFT_SKY.x, LIFT_SKY.y)?.entry).toEqual(LIFT_SKY);
  });

  it('every room upstairs is where the map says it is', () => {
    expect(casinoArea(SUITE.x, SUITE.y)).toBe('suite');
    expect(casinoArea(LOUNGE.x, LOUNGE.y)).toBe('sky_lounge');
    expect(casinoArea(SKY_X + 5, 28)).toBe('spa');
    expect(casinoArea(SKY_X + 24, 29)).toBe('boutique');
    expect(casinoArea(SKY_X + 40, 12)).toBe('sky_bar');
    expect(casinoArea(LIFT_SKY.x, LIFT_SKY.y)).toBe('sky_lobby');
    // the ground floor is unchanged
    expect(casinoArea(LIFT_GROUND.x, LIFT_GROUND.y + 5)).toBe('floor');
  });
});

describe('who may take the lift up', () => {
  it('gold members and better; silver members on Saturday nights; anyone with a room key or an invitation', () => {
    const c = newCore(1);
    expect(c.sky.access()).toContain('金卡');
    member(c, 'silver');
    expect(c.sky.access()).not.toBeNull();
    c.state.time.minutes = saturday(c, 21, 30);
    expect(c.sky.isSkyNight()).toBe(true);
    expect(c.sky.access()).toBeNull();
    c.state.time.minutes += 4 * 60; // 01:30 on Sunday: over
    expect(c.sky.access()).not.toBeNull();
    member(c, 'gold');
    expect(c.sky.access()).toBeNull();
    // a casino employee may not
    const d = newCore(2);
    member(d, 'gold');
    d.career.hire('dealer');
    expect(d.sky.access()).toContain('员工');
  });

  it('Victor can invite a regular silver member up for two days', () => {
    const c = newCore(3);
    member(c, 'silver');
    c.state.casino.membership.lifetimeTheo = G(500);
    c.setLocation('casino', -1, -1);
    const r = c.social.rel('victor');
    r.met = true;
    r.knowsName = true;
    r.familiarity = 30;
    c.dialogue.start('victor');
    c.dialogue.choose('menu_services');
    c.dialogue.choose('svc_sky');
    expect(c.sky.access()).toBeNull();
    c.state.time.minutes += 2 * MINUTES_PER_DAY;
    expect(c.sky.access()).not.toBeNull();
  });
});

describe('suite 1201', () => {
  it('costs what the rate card says for each tier, and the key works until noon the next day', () => {
    for (const tier of ['visitor', 'gold', 'diamond'] as MemberTier[]) {
      const c = newCore(4);
      c.state.economy.accounts.bank += G(5000);
      c.state.economy.initial.bank += G(5000);
      member(c, tier);
      const bank = c.economy.balance('bank');
      const r = c.sky.bookSuite('bank');
      expect(r.ok).toBe(true);
      expect(bank - c.economy.balance('bank')).toBe(SUITE_RATES[tier]);
      expect(c.sky.suiteGuest()).toBe(true);
      expect(c.sky.access()).toBeNull();
      expect(c.sky.bookSuite('bank').ok).toBe(false);
      const out = (c.today() + 1) * MINUTES_PER_DAY + CHECKOUT;
      c.state.time.minutes = out - 1;
      expect(c.sky.suiteGuest()).toBe(true);
      c.state.time.minutes = out;
      expect(c.sky.suiteGuest()).toBe(false);
    }
  });

  it('platinum members get one free night a week; after midnight a booking is for the night already under way', () => {
    const c = newCore(5);
    member(c, 'platinum');
    c.state.economy.accounts.bank += G(3000);
    c.state.economy.initial.bank += G(3000);
    const bank = c.economy.balance('bank');
    expect(c.sky.suiteQuote().price).toBe(0);
    c.sky.bookSuite();
    expect(c.economy.balance('bank')).toBe(bank);
    // two in the morning two days later: the second night this week is charged and ends at noon today
    c.state.time.minutes = (c.today() + 2) * MINUTES_PER_DAY + 2 * 60;
    expect(c.sky.suiteQuote().price).toBe(SUITE_RATES.platinum);
    c.sky.bookSuite();
    expect(bank - c.economy.balance('bank')).toBe(SUITE_RATES.platinum);
    expect(c.state.casino.sky.suiteUntil).toBe(c.today() * MINUTES_PER_DAY + CHECKOUT);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('can be paid with dining credit instead of money', () => {
    const c = newCore(6);
    member(c, 'gold');
    c.state.casino.comps = G(1500);
    const bank = c.economy.balance('bank');
    expect(c.sky.bookSuite('comps').ok).toBe(true);
    expect(c.state.casino.comps).toBe(G(1500) - SUITE_RATES.gold);
    expect(c.economy.balance('bank')).toBe(bank);
  });

  it('you can sleep there only with a valid key, and sleep there is better than in a starter flat', () => {
    const c = newCore(7);
    member(c, 'diamond');
    at(c, SUITE);
    c.state.player.stats.sleep = 20;
    expect(c.canSleep()).toContain('房卡');
    c.sky.bookSuite();
    expect(c.canSleep()).toBeNull();
    at(c, LOUNGE);
    expect(c.canSleep()).toBe('只能在家里睡觉');
    at(c, SUITE);
    expect(c.sleepComfort()).toBeGreaterThan(c.housing.comfort());
    c.sleep(3);
    const suiteSleep = c.state.player.stats.sleep;
    // the same three hours at home
    const h = newCore(7);
    h.state.player.stats.sleep = 20;
    h.sleep(3);
    expect(suiteSleep).toBeGreaterThan(h.state.player.stats.sleep);
  });
});

describe('services upstairs', () => {
  it('the spa takes time, lowers stress and is priced by tier', () => {
    const c = newCore(8);
    member(c, 'gold');
    c.state.player.stats.stress = 70;
    const t0 = c.now();
    const bank = c.economy.balance('bank');
    const r = c.sky.spa('full');
    expect(r.ok).toBe(true);
    expect(c.now() - t0).toBe(90);
    expect(c.state.player.stats.stress).toBeLessThan(45);
    expect(bank - c.economy.balance('bank')).toBe(G(336)); // 80% of 420
    // platinum: the first one each day is free, the next one is 70%
    const p = newCore(9);
    member(p, 'platinum');
    const pb = p.economy.balance('bank');
    p.sky.spa('neck');
    expect(p.economy.balance('bank')).toBe(pb);
    p.sky.spa('sauna');
    expect(pb - p.economy.balance('bank')).toBe(G(112));
    // no massage when drunk, but the sauna is fine
    p.state.player.stats.drunk = 70;
    expect(p.sky.spa('neck').ok).toBe(false);
    expect(p.sky.spa('sauna').ok).toBe(true);
    // not for those who cannot be upstairs
    expect(newCore(10).sky.spa('neck').ok).toBe(false);
  });

  it('the car is free for platinum members and costs one and a half taxi fares for gold', () => {
    const c = newCore(11);
    member(c, 'platinum');
    at(c, LOUNGE);
    const bank = c.economy.balance('bank') + c.economy.balance('cash');
    const t0 = c.now();
    expect(c.sky.limo('fine_dining').ok).toBe(true);
    expect(c.economy.balance('bank') + c.economy.balance('cash')).toBe(bank);
    expect(c.now()).toBeGreaterThan(t0);
    const g = newCore(12);
    member(g, 'gold');
    at(g, LOUNGE);
    const taxi = g.services.taxiQuote('club')!.fare;
    const q = g.sky.limoQuote('club')!;
    expect(q.fare).toBe(Math.round((taxi * 1.5) / 100) * 100);
    const before = g.economy.balance('bank') + g.economy.balance('cash');
    g.sky.limo('club');
    expect(before - (g.economy.balance('bank') + g.economy.balance('cash'))).toBe(q.fare);
    expect(g.economy.checkConservation().ok).toBe(true);
  });

  it('the concierge books Lumière without the fee for platinum, and late for diamond', () => {
    const c = newCore(13);
    member(c, 'platinum');
    const bank = c.economy.balance('bank');
    expect(c.sky.bookLumiere(true).ok).toBe(true);
    expect(c.economy.balance('bank')).toBe(bank);
    const g = newCore(14);
    member(g, 'gold');
    const gb = g.economy.balance('bank');
    g.sky.bookLumiere(true);
    expect(gb - g.economy.balance('bank')).toBe(LUMIERE_BOOKING_FEE);
    const d = newCore(15);
    member(d, 'diamond');
    d.state.time.minutes = d.today() * MINUTES_PER_DAY + 22 * 60;
    expect(d.services.bookLumiere(false).ok).toBe(false);
    expect(d.sky.bookLumiere(false).ok).toBe(true);
  });

  it('the boutique trades dining credit for gifts and nothing else', () => {
    const c = newCore(16);
    const item = COMP_STORE.find((x) => x.id === 'silk_scarf')!;
    c.state.casino.comps = item.comps - 1;
    expect(c.sky.redeem('silk_scarf').ok).toBe(false);
    c.state.casino.comps = item.comps + G(10);
    const cash = c.economy.balance('cash');
    expect(c.sky.redeem('silk_scarf').ok).toBe(true);
    expect(c.state.casino.comps).toBe(G(10));
    expect(c.inventory.count('silk_scarf')).toBe(1);
    expect(c.inventory.giftables().some((d) => d.id === 'silk_scarf')).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash);
  });

  it('the lounge buffet is complimentary; champagne at the sky bar is free on Saturday nights', () => {
    const c = newCore(17);
    member(c, 'silver');
    expect(c.inventory.unitPrice('sky_lounge', 'sky_hot')).toBe(0);
    expect(c.inventory.unitPrice('sky_bar', 'champagne')).toBeGreaterThan(0);
    c.state.time.minutes = saturday(c, 22);
    expect(c.inventory.unitPrice('sky_bar', 'champagne')).toBe(0);
    expect(c.inventory.unitPrice('sky_bar', 'sky_cocktail')).toBeGreaterThan(0);
    member(c, 'gold');
    expect(c.inventory.unitPrice('sky_bar', 'sky_cocktail')).toBe(0);
  });
});

describe('Saturday night upstairs', () => {
  it('Victor hosts it, and Lillian and Alexander often come up', () => {
    const c = newCore(18);
    const t = saturday(c, 22, 15);
    expect(c.npcs.scheduled(NPC_BY_ID.victor, t)).toMatchObject({ loc: 'casino', spot: 'sky_host' });
    let lillian = 0;
    let alexander = 0;
    for (let w = 0; w < 10; w++) {
      if (c.npcs.scheduled(NPC_BY_ID.lillian, t + w * 7 * MINUTES_PER_DAY).spot === 'sky_lounge1') lillian++;
      if (c.npcs.scheduled(NPC_BY_ID.alexander, t + w * 7 * MINUTES_PER_DAY).spot === 'sky_bar1') alexander++;
    }
    expect(lillian).toBeGreaterThanOrEqual(5);
    expect(alexander).toBeGreaterThanOrEqual(4);
    // every spot they use exists on the map
    const m = interiorMap('casino');
    for (const s of ['sky_host', 'sky_lounge1', 'sky_bar1']) expect(m.spots[s], s).toBeTruthy();
  });
});
