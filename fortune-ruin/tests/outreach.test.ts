import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { HOMES } from '../src/data/housing';
import { OUTFITS } from '../src/data/items';
import { entryRefusal } from '../src/world/access';
import { newCore, skip } from './helpers';

/** Run one outreach pass with every rule certain to fire if its situation holds. */
function pass(core: GameCore, hour = 13, only?: string[]): string[] {
  const before = core.state.phone.messages.length;
  const chance = core.rng.chance.bind(core.rng);
  core.rng.chance = () => true;
  try {
    core.outreach.pass(hour, only);
  } finally {
    core.rng.chance = chance;
  }
  return core.state.phone.messages.slice(before).map((m) => m.from);
}

function freshDay(core: GameCore): void {
  // new day, and no limit carried over
  core.state.time.minutes += MINUTES_PER_DAY;
  for (const k of Object.keys(core.state.events.count)) if (k.startsWith('out:sent:')) delete core.state.events.count[k];
}

describe('people reach out because of what is happening to you', () => {
  it('stays quiet when nothing in particular is going on', () => {
    const core = newCore(3);
    expect(pass(core)).toEqual([]);
  });

  it('the casino host calls a lapsed regular and really adds the comps', () => {
    const core = newCore(4);
    const m = core.state.casino.membership;
    m.tier = 'gold';
    m.visits = 6;
    m.lastVisitDay = core.today() - 12;
    const comps = core.state.casino.comps;
    expect(pass(core)).toContain('victor');
    expect(core.state.casino.comps).toBe(comps + G(80));
    // and not again the next day
    freshDay(core);
    expect(pass(core)).not.toContain('victor');
  });

  it('a big winner is invited into the high-limit room for a week', () => {
    const core = newCore(5);
    core.state.casino.membership.tier = 'silver';
    core.state.casino.stats.sessions.push({ start: core.now() - 300, end: core.now() - 60, net: G(20000), rounds: 40 });
    expect(core.casino.areaAccess('high')).not.toBeNull();
    expect(pass(core)).toContain('victor');
    expect(core.casino.areaAccess('high')).toBeNull();
  });

  it('security writes before anyone is barred', () => {
    const core = newCore(6);
    core.state.casino.heat = 45;
    expect(pass(core)).toContain('jack');
  });

  it('the bank offers private banking above 500,000 G, and the interest is real', () => {
    const core = newCore(7, { start: 'heir' });
    const base = newCore(7, { start: 'heir' });
    expect(pass(core, 13, ['grace_private'])).toContain('grace');
    expect(core.state.player.flags.privateBanking).toBe(true);
    const income = (c: GameCore) => c.state.economy.ledger.filter((t) => t.cat === 'interest_income').reduce((a, t) => a + t.amount, 0);
    core.economy.payMonthlyInterest();
    base.economy.payMonthlyInterest();
    // 1% a year more on the 2,500,000 G above the threshold
    expect(income(core) - income(base)).toBe(Math.floor((G(2500000) * 100) / 10000 / 12));
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('a friend who heard about your losses comes round in the morning', () => {
    const core = newCore(8);
    core.social.applyDelta('daniel', { affection: 40 });
    core.social.applyDirect('daniel', { kind: 'big_loss', facets: { wealthLoss: 1 }, importance: 40, data: { amount: G(8000) } }, { source: 'rumor', silent: true });
    expect(core.isAtHome()).toBe(true);
    expect(pass(core, 8)).toContain('daniel');
    skip(core, 20);
    expect(core.state.npcs.daniel.location).toBe(HOMES[core.state.housing.homeId].location);
  });

  it('Eileen notices you have stopped coming and the first latte really is free', () => {
    const core = newCore(9);
    core.social.applyDelta('eileen', { affection: 30 });
    core.state.world.visited.cafe = 4;
    core.state.world.lastVisit = { cafe: core.today() - 10 };
    expect(pass(core)).toContain('eileen');
    expect(core.inventory.unitPrice('cafe', 'latte')).toBe(0);
    const cash = core.economy.balance('cash');
    expect(core.inventory.buy('cafe', 'latte', 'cash', 2).ok).toBe(true);
    // one free, one paid
    expect(cash - core.economy.balance('cash')).toBe(core.inventory.unitPrice('cafe', 'latte'));
    expect(core.inventory.unitPrice('cafe', 'latte')).toBeGreaterThan(0);
  });

  it('a mechanic friend makes the car cheaper to keep while you stay friends', () => {
    const core = newCore(10, { start: 'heir' });
    const full = core.housing.vehicleUpkeep();
    core.social.applyDelta('daniel', { affection: 25 });
    expect(pass(core, 13, ['daniel_car'])).toContain('daniel');
    expect(core.housing.vehicleUpkeep()).toBe(Math.round(full * 0.7));
    core.state.social.rel.daniel.affection = 0;
    expect(core.housing.vehicleUpkeep()).toBe(full);
  });

  it('the stylist offers a discount when the clothes do not match the money', () => {
    const core = newCore(11, { start: 'founder' });
    core.social.applyDelta('isabella', { familiarity: 10 });
    core.state.social.rel.isabella.met = true;
    expect(pass(core, 13, ['isabella_wardrobe'])).toContain('isabella');
    expect(core.inventory.unitPrice('boutique', 'outfit_suit')).toBe(Math.round(OUTFITS.outfit_suit.price * 0.85));
    core.state.time.minutes += 15 * MINUTES_PER_DAY;
    expect(core.inventory.unitPrice('boutique', 'outfit_suit')).toBe(OUTFITS.outfit_suit.price);
  });

  it('new money is invited to the charity gala; the donation is paid and remembered', () => {
    const core = newCore(12, { start: 'heir' });
    const sent = pass(core, 13, ['lillian_gala']);
    expect(sent).toContain('lillian');
    const msg = core.state.phone.messages.find((m) => m.from === 'lillian')!;
    const accept = msg.actions!.find((a) => a.id.startsWith('accept:'))!;
    core.phone.respond(msg.id, accept.id);
    const ev = core.events.upcoming().find((e) => e.def === 'gala')!;
    expect(ev.status).toBe('accepted');
    // members only, but the invitation gets you in
    core.state.time.minutes = ev.at;
    core.inventory.wear('outfit_suit');
    expect(entryRefusal(core, 'club')).toBeNull();
    core.setLocation('club', -1, -1);
    core.events.tickMinute(core.now());
    expect(core.events.pendingPrompt?.title).toBe('慈善晚宴');
    const bank = core.economy.balance('bank');
    const rep = core.state.player.reputation.social;
    core.events.resolvePrompt('donate');
    expect(bank - core.economy.balance('bank')).toBe(G(10000));
    expect(core.state.player.reputation.social).toBe(rep + 4);
    expect(core.social.recall('lillian', ['donated'], 1)).toBeTruthy();
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('never more than two people a day, and strangers only when their job gives them your number', () => {
    const core = newCore(13, { start: 'heir' });
    core.state.casino.heat = 45;
    const sent = [...pass(core, 8), ...pass(core, 13), ...pass(core, 19)];
    expect(sent.length).toBe(2);
    for (const id of sent) expect(['victor', 'jack', 'grace', 'lillian', 'daniel']).toContain(id);
  });
});
