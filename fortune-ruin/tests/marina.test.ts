import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G, mulRatio } from '../src/core/money';
import { MINUTES_PER_DAY, hm } from '../src/core/calendar';
import { CHARTER, CHARTER_SPOTS, CRUISES, CRUISE_MINUTES, GUEST_SPOTS, WAIT, YACHTS, timeOfDay } from '../src/systems/MarinaSystem';
import { newCore } from './helpers';
import { buildCityMap } from '../src/world/maps/city';
import { CITY_SPOTS, MARINA, OUTDOOR_PLACES } from '../src/world/maps/cityLayout';
import { reachable } from '../src/world/gates';

function at(c: GameCore, h: number, m = 0, days = 1): void {
  c.state.time.minutes = (c.today() + days) * MINUTES_PER_DAY + hm(h, m);
}

/** Make someone a friend the player can ask aboard. */
function friend(c: GameCore, id: string): void {
  const r = c.social.rel(id);
  r.met = true;
  r.knowsName = true;
  r.familiarity = 50;
  r.affection = 45;
}

/** Put the guests where they wait for the boat. */
function onPier(c: GameCore, ids: string[]): void {
  ids.forEach((id, i) => {
    c.state.npcs[id].location = 'city';
    c.state.npcs[id].spot = GUEST_SPOTS[i];
  });
}

describe('the harbour cruise', () => {
  it('sells tickets only while a departure is boarding', () => {
    const c = newCore();
    at(c, 12);
    const r = c.marina.buyCruise('cash');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('14:00');
    at(c, 13, 40, 0);
    const cash = c.economy.balance('cash');
    expect(c.marina.buyCruise('cash').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - CRUISES[1].price);
    // the night cruise costs more
    at(c, 19, 10, 0);
    expect(c.marina.boardingCruise()!.price).toBe(G(90));
  });

  it('takes ninety minutes from the departure, does you good, and the ticket is paid on boarding', () => {
    const c = newCore();
    at(c, 14);
    c.state.player.stats.stress = 50;
    const cash = c.economy.balance('cash');
    const t0 = c.now();
    const r = c.marina.sail('cruise', 'cash');
    expect(r.ok).toBe(true);
    expect(c.now() - t0).toBe(CRUISE_MINUTES);
    expect(c.economy.balance('cash')).toBe(cash - CRUISES[1].price);
    expect(c.state.player.stats.stress).toBeLessThan(50);
    if (!r.ok) return;
    expect(r.report.cards.map((k) => k.scene)).toEqual(['skyline', 'open_sea', 'homecoming']);
    // on board twenty minutes early, you wait on deck until she casts off
    at(c, 16, 40);
    const t1 = c.now();
    expect(c.marina.sail('cruise').ok).toBe(true);
    expect(c.now() - t1).toBe(20 + CRUISE_MINUTES);
  });

  it('the tour boat is away from the pier while a cruise is out', () => {
    const c = newCore();
    at(c, 13, 50);
    expect(c.marina.tourBoatOut()).toBe(false);
    at(c, 14, 30, 0);
    expect(c.marina.tourBoatOut()).toBe(true);
    expect(c.marina.boardCheck('cruise')).not.toBeNull();
    at(c, 15, 31, 0);
    expect(c.marina.tourBoatOut()).toBe(false);
  });

  it('the postcards show the light of their hour', () => {
    const c = newCore();
    const day = c.today() + 1;
    expect(timeOfDay(day * MINUTES_PER_DAY + hm(12))).toBe('day');
    expect(timeOfDay(day * MINUTES_PER_DAY + hm(23))).toBe('night');
    at(c, 19, 30);
    const r = c.marina.sail('cruise', 'cash');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.cards[2].tod).toBe('night');
  });
});

describe('a charter with friends', () => {
  it('books a departure, pays for it, and the friends answer in character', () => {
    const c = newCore();
    at(c, 9);
    for (const id of ['daniel', 'margaret', 'eileen']) friend(c, id);
    const slot = c.marina.slots()[0];
    const bank = c.economy.balance('bank');
    const r = c.marina.book('charter', slot, ['daniel', 'margaret', 'eileen']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(c.economy.balance('bank')).toBe(bank - CHARTER.price);
    expect(r.answers.find((a) => a.id === 'daniel')!.yes).toBe(true);
    expect(r.answers.find((a) => a.id === 'margaret')!.yes).toBe(false); // she gets seasick
    // those who said yes will be waiting on the pier
    const target = c.npcs.target('daniel', slot);
    expect(target.loc).toBe('city');
    expect(GUEST_SPOTS).toContain(String(target.spot));
    expect(c.state.marina!.booking!.guests).toEqual(['daniel', 'eileen']);
    expect(c.state.phone.messages.some((m) => m.from === 'marina')).toBe(true);
  });

  it('only friends can be asked, and the boat has room for three', () => {
    const c = newCore();
    at(c, 9);
    expect(c.marina.invitable()).not.toContain('alexander');
    for (const id of ['daniel', 'eileen', 'kiki', 'tommy']) friend(c, id);
    const r = c.marina.book('charter', c.marina.slots()[0], ['daniel', 'eileen', 'kiki', 'tommy']);
    expect(r.ok).toBe(false);
  });

  it('sails with whoever is on the pier, and they remember the day', () => {
    const c = newCore();
    at(c, 9);
    friend(c, 'daniel');
    friend(c, 'kiki');
    const slot = c.marina.slots()[0];
    c.marina.book('charter', slot, ['daniel', 'kiki']);
    c.state.time.minutes = slot - 40;
    expect(c.marina.canSail()).not.toBeNull(); // too early
    c.state.time.minutes = slot;
    onPier(c, ['daniel', 'kiki']);
    const before = c.social.rel('daniel').affection;
    const r = c.marina.sail('charter');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.guests.map((g) => g.id).sort()).toEqual(['daniel', 'kiki']);
    expect(c.now() - slot).toBe(CHARTER.minutes);
    expect(c.state.marina!.booking).toBeNull();
    expect(c.state.social.memories.some((m) => m.npc === 'daniel' && m.kind === 'yacht_trip')).toBe(true);
    expect(c.social.rel('daniel').affection).toBeGreaterThan(before);
    // they come back with you and linger on the pier
    expect(c.state.npcs.daniel.location).toBe('city');
    expect(CHARTER_SPOTS).toContain(String(c.state.npcs.daniel.spot));
    expect(c.npcs.target('daniel', c.now()).spot).toBe(c.state.npcs.daniel.spot);
  });

  it('whoever is late is left on the pier, and does not take it well', () => {
    const c = newCore();
    at(c, 9);
    friend(c, 'daniel');
    friend(c, 'kiki');
    const slot = c.marina.slots()[0];
    c.marina.book('charter', slot, ['daniel', 'kiki']);
    c.state.time.minutes = slot;
    onPier(c, ['daniel']);
    c.state.npcs.kiki.location = null;
    expect(c.marina.late()).toEqual(['kiki']);
    const r = c.marina.sail('charter');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.guests.map((g) => g.id)).toEqual(['daniel']);
    expect(c.state.social.memories.some((m) => m.npc === 'kiki' && m.kind === 'stood_up')).toBe(true);
    expect(c.state.npcs.kiki.overrides.some((o) => o.reason === '在码头等着上船')).toBe(false);
  });

  it('boarding early means waiting on deck until the slot', () => {
    const c = newCore();
    at(c, 9);
    const slot = c.marina.slots()[0];
    c.marina.book('charter', slot, []);
    c.state.time.minutes = slot - 25;
    expect(c.marina.sail('charter').ok).toBe(true);
    expect(c.now()).toBe(slot + CHARTER.minutes);
  });

  it('reminds you by phone an hour before, and the boat you booked is the one you board', () => {
    const c = newCore();
    at(c, 6);
    const slot = c.marina.slots()[0];
    c.marina.book('charter', slot, []);
    const n = c.state.phone.messages.filter((m) => m.from === 'marina').length;
    c.marina.tickMinute(slot - 61);
    expect(c.state.phone.messages.filter((m) => m.from === 'marina').length).toBe(n);
    c.marina.tickMinute(slot - 60);
    c.marina.tickMinute(slot - 59);
    expect(c.state.phone.messages.filter((m) => m.from === 'marina').length).toBe(n + 1);
    c.state.time.minutes = slot;
    expect(c.marina.boardCheck('own')).not.toBeNull();
    expect(c.marina.boardCheck('charter')).toBeNull();
  });

  it('friends who wait an hour for nothing go home and remember it', () => {
    const c = newCore();
    at(c, 9);
    friend(c, 'daniel');
    const slot = c.marina.slots()[0];
    c.marina.book('charter', slot, ['daniel']);
    c.marina.tickMinute(slot + WAIT);
    expect(c.state.marina!.booking).not.toBeNull();
    c.marina.tickMinute(slot + WAIT + 1);
    expect(c.state.marina!.booking).toBeNull();
    expect(c.state.social.memories.some((m) => m.npc === 'daniel' && m.kind === 'missed_party')).toBe(true);
  });
});

describe('owning a yacht', () => {
  it('is bought from the bank, counts at its resale value, bills berth and crew monthly, and sells through a broker', () => {
    const c = newCore();
    c.economy.receive('bank', G(2000000), 'other', 'test');
    const before = c.economy.netWorth();
    const y = YACHTS.seagull;
    expect(c.marina.buy('seagull').ok).toBe(true);
    expect(c.marina.buy('aurora').ok).toBe(false); // one boat at a time
    expect(c.economy.netWorth()).toBe(before - y.price + mulRatio(y.price, 70, 100));
    const bills = c.state.economy.bills.length;
    c.marina.monthlyBills();
    expect(c.state.economy.bills.length).toBe(bills + 1);
    expect(c.state.economy.bills.at(-1)!.amount).toBe(y.monthly);
    const bank = c.economy.balance('bank');
    const price = c.marina.sellPrice();
    expect(price).toBe(mulRatio(y.price, 70, 100) - mulRatio(mulRatio(y.price, 70, 100), 500, 10000));
    expect(c.marina.sell().ok).toBe(true);
    expect(c.economy.balance('bank')).toBe(bank + price);
    expect(c.state.marina!.owned).toBeNull();
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('goes out alone for the price of fuel, in working hours', () => {
    const c = newCore();
    c.economy.receive('bank', G(2000000), 'other', 'test');
    c.marina.buy('seagull');
    at(c, 22);
    expect(c.marina.sail('own').ok).toBe(false);
    at(c, 10);
    const bank = c.economy.balance('bank');
    const t0 = c.now();
    expect(c.marina.sail('own').ok).toBe(true);
    expect(c.economy.balance('bank')).toBe(bank - YACHTS.seagull.fuel);
    expect(c.now() - t0).toBe(120);
  });

  it('old saves get an empty marina', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.marina;
    expect(migrate(st).marina?.owned).toBeNull();
  });
});
describe('the pontoon', () => {
  const m = buildCityMap();
  const acc = reachable(m, m.spawns.start.x, m.spawns.start.y);
  const ok = (x: number, y: number) => acc[y * m.w + x] === 1;

  it('is reached from the promenade, and every berth can be boarded from it', () => {
    expect(ok(106, MARINA.gangway)).toBe(true);
    for (const y of Object.values(MARINA.berths)) expect(ok(MARINA.x1, y), `boarding tile by the berth at row ${y}`).toBe(true);
  });

  it('has its guests and its regulars standing on the boards, not in the river', () => {
    for (const id of [...GUEST_SPOTS, 'marina_whitmore', 'marina_view']) {
      const s = CITY_SPOTS[id];
      expect(s, id).toBeTruthy();
      expect(ok(s.x, s.y), `${id} at ${s.x},${s.y}`).toBe(true);
    }
  });

  it('is wood, not animated water', () => {
    const water = new Set(m.water);
    for (let y = MARINA.y0; y <= MARINA.y1; y++) for (let x = MARINA.x0; x <= MARINA.x1; x++) expect(water.has(y * m.w + x)).toBe(false);
  });

  it('every boat sits in a berth with something to do at it', () => {
    for (const boat of ['tour', 'club', 'own']) expect(m.interactables.some((it) => it.interact.kind === 'marina' && it.interact.data?.boat === boat), boat).toBe(true);
  });

  it('the map can send a taxi to the marina, the night market, Pier 7 and the ferry pier', () => {
    for (const [id, p] of Object.entries(OUTDOOR_PLACES)) expect(ok(p.tile.x, p.tile.y), id).toBe(true);
    const c = newCore();
    expect(c.services.taxiQuote('marina')).not.toBeNull();
  });
});

describe('calling it off', () => {
  it('refunds most of a charter in good time, nothing at the last minute, and friends hear of it', () => {
    const c = newCore();
    at(c, 6);
    friend(c, 'daniel');
    const slot = c.marina.slots()[1];
    c.marina.book('charter', slot, ['daniel']);
    const bank = c.economy.balance('bank');
    c.state.time.minutes = slot - 4 * 60;
    const r = c.marina.cancel();
    expect(r.ok).toBe(true);
    expect(c.economy.balance('bank')).toBe(bank + mulRatio(CHARTER.price, 80, 100));
    expect(c.state.npcs.daniel.overrides.some((o) => o.reason === '在码头等着上船')).toBe(false);
    expect(c.state.marina!.booking).toBeNull();
    // the second time, too late
    c.state.time.minutes = slot - 5 * 60;
    const slot2 = c.marina.slots()[0];
    c.marina.book('charter', slot2, ['daniel']);
    const bank2 = c.economy.balance('bank');
    c.state.time.minutes = slot2 - 30;
    c.marina.cancel();
    expect(c.economy.balance('bank')).toBe(bank2);
    expect(c.state.social.memories.some((mm) => mm.npc === 'daniel' && mm.kind === 'stood_up')).toBe(true);
    expect(c.economy.checkConservation().ok).toBe(true);
  });
});
