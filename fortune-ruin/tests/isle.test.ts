import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY, hm, toDate } from '../src/core/calendar';
import { CHECKOUT, FARES, FERRY, FERRY_BOARD, FERRY_LATE, FERRY_MINUTES, FISHING, LOUNGER, ROOMS, SWIM_MINUTES, boatsIn, ferryAt, nextDeparture } from '../src/systems/IsleSystem';
import { MEAL_FRESH } from '../src/systems/InventorySystem';
import { planTrip } from '../src/systems/NPCManager';
import { CITY_SPOTS, FERRY_PIER, locationAnchor } from '../src/world/maps/cityLayout';
import { ISLE_SPOTS, onIsle } from '../src/world/maps/isleLayout';
import { newCore } from './helpers';

/** Tomorrow (a Tuesday in a new game) at h:m, or `days` days on. */
function at(c: GameCore, h: number, m = 0, days = 1): void {
  c.state.time.minutes = (c.today() + days) * MINUTES_PER_DAY + hm(h, m);
}

function onIsland(c: GameCore, loc = 'isle'): void {
  c.state.world.location = loc;
}

describe('the ferry across the bay', () => {
  it('boards twenty minutes before a departure, waits for it, and crosses in forty minutes', () => {
    const c = newCore();
    at(c, 9, 20);
    expect(c.isle.boarding()).toBeNull();
    expect(c.isle.boardCheck('deck', 'cash')).toContain('10:00');
    at(c, 9, 45, 0);
    expect(c.isle.boarding()).toBe(FERRY.city[1]);
    const cash = c.economy.balance('cash');
    const r = c.isle.cross('deck', 'cash');
    expect(r.ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - FARES.deck);
    // fifteen minutes on board before she leaves, then the crossing
    expect(toDate(c.now()).minuteOfDay).toBe(FERRY.city[1] + FERRY_MINUTES);
    if (r.ok) expect(r.report.waited).toBe(15);
    expect(c.state.isle!.visited).toBe(true);
  });

  it('the boats back leave from the island, the last at eight', () => {
    const c = newCore();
    onIsland(c);
    at(c, 20, 5);
    expect(c.isle.boarding()).toBeNull();
    // the next one is tomorrow morning
    const n = c.isle.nextFerry();
    expect(n).toBe((c.today() + 1) * MINUTES_PER_DAY + FERRY.isle[0]);
    at(c, 19, 45, 0);
    expect(c.isle.boarding()).toBe(FERRY.isle.at(-1));
  });

  it('one ferry shuttles: she is at a pier from her arrival there until she leaves, and boarding falls inside that', () => {
    for (let m = 0; m < MINUTES_PER_DAY; m++) {
      // never at both piers, and boarding only while she is there
      expect(ferryAt('city', m) && ferryAt('isle', m), `minute ${m}`).toBe(false);
      for (const side of ['city', 'isle'] as const) {
        const boarding = FERRY[side].some((d) => m >= d - FERRY_BOARD && m <= d + FERRY_LATE);
        if (boarding) expect(ferryAt(side, m), `${side} ${m}`).toBe(true);
      }
    }
    // she spends the night at Greyhaven
    expect(ferryAt('city', hm(23))).toBe(true);
    expect(ferryAt('city', hm(3))).toBe(true);
  });

  it('the lounge costs more and does you more good', () => {
    const a = newCore();
    const b = newCore();
    for (const c of [a, b]) {
      at(c, 12, 50);
      c.state.player.stats.stress = 50;
    }
    a.isle.cross('deck', 'card');
    b.isle.cross('lounge', 'card');
    expect(b.state.player.stats.stress).toBeLessThan(a.state.player.stats.stress);
    expect(FARES.lounge).toBeGreaterThan(FARES.deck);
  });
});

describe('a night on the island', () => {
  it('the guesthouse is cheap, the resort is not, and either room lasts until eleven', () => {
    const c = newCore();
    at(c, 21);
    onIsland(c, 'isle_guesthouse');
    expect(c.isle.canSleep('isle_guesthouse')).not.toBeNull();
    const cash = c.economy.balance('cash');
    expect(c.isle.checkIn('guesthouse', 'cash').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - ROOMS.guesthouse.price);
    expect(c.isle.canSleep('isle_guesthouse')).toBeNull();
    // the bed at the resort is not yours
    expect(c.isle.canSleep('isle_resort')).not.toBeNull();
    // one room at a time
    onIsland(c, 'isle_resort');
    expect(c.isle.checkIn('resort', 'card').ok).toBe(false);
    // checkout the next morning
    c.isle.tickMinute((c.today() + 1) * MINUTES_PER_DAY + CHECKOUT);
    expect(c.state.isle!.room).toBeNull();
    expect(ROOMS.resort.price).toBeGreaterThan(ROOMS.guesthouse.price * 5);
  });

  it('only the resort guests get breakfast, the pool and the private beach', () => {
    const c = newCore();
    c.economy.receive('bank', G(5000), 'other', 'test');
    at(c, 8);
    onIsland(c, 'isle_resort');
    expect(c.isle.breakfast().ok).toBe(false);
    expect(c.isle.guestBeach('pool').ok).toBe(false);
    expect(c.isle.checkIn('resort', 'card').ok).toBe(true);
    const r = c.isle.breakfast();
    expect(r.ok).toBe(true);
    expect(c.isle.breakfast().ok).toBe(false);
    expect(c.isle.guestBeach('beach').ok).toBe(true);
    expect(c.economy.checkConservation().ok).toBe(true);
  });
});

describe('the beach and the boats', () => {
  it('loungers and swimming only while the lifeguard is on', () => {
    const c = newCore();
    onIsland(c);
    at(c, 19);
    expect(c.isle.swim().ok).toBe(false);
    expect(c.isle.rentLounger().ok).toBe(false);
    at(c, 11, 0, 0);
    const t0 = c.now();
    expect(c.isle.swim().ok).toBe(true);
    expect(c.now() - t0).toBe(SWIM_MINUTES);
    const cash = c.economy.balance('cash');
    expect(c.isle.rentLounger().ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - LOUNGER.price);
    c.state.player.stats.drunk = 40;
    expect(c.isle.swim().ok).toBe(false);
  });

  it('the fishing boats take hands at dawn, are back at half past two, pay cash and give you a fish', () => {
    const c = newCore();
    onIsland(c);
    at(c, 7);
    expect(c.isle.goFishing().ok).toBe(false);
    at(c, 5, 0, 0);
    c.state.player.stats.energy = 90;
    c.state.player.stats.sleep = 90;
    const cash = c.economy.balance('cash');
    const meals = c.state.inventory.items[MEAL_FRESH] ?? 0;
    const t0 = c.now();
    const r = c.isle.goFishing();
    expect(r.ok).toBe(true);
    // on board at five, she sails at half past and is back nine hours later
    expect(c.now() - t0).toBe(FISHING.back - hm(5));
    expect(FISHING.back - FISHING.until).toBe(FISHING.hours * 60);
    expect(toDate(c.now()).minuteOfDay).toBe(FISHING.back);
    expect(c.economy.balance('cash')).toBe(cash + FISHING.pay);
    // the fish makes three good meals at home
    expect(c.state.inventory.items[MEAL_FRESH]).toBe(meals + 3);
    // once a day
    expect(c.isle.goFishing().ok).toBe(false);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('no boats on Sunday, and the fish market is on when they are back', () => {
    const c = newCore();
    onIsland(c);
    // a new game starts on a Monday: day 6 is Sunday
    c.state.time.minutes = 6 * MINUTES_PER_DAY + hm(5);
    expect(toDate(c.now()).weekday).toBe(6);
    expect(c.isle.fishingOffer().ok).toBe(false);
    expect(boatsIn(c.now() + hm(5))).toBe(true);
    c.state.time.minutes = 6 * MINUTES_PER_DAY + hm(15);
    expect(c.isle.marketOpen()).toBe(false);
    // Tuesday: out at sea all morning, the market on the quay once they are in
    c.state.time.minutes = 1 * MINUTES_PER_DAY + hm(10);
    expect(boatsIn(c.now())).toBe(false);
    expect(c.isle.marketOpen()).toBe(false);
    c.state.time.minutes = 1 * MINUTES_PER_DAY + FISHING.back;
    expect(boatsIn(c.now())).toBe(true);
    expect(c.isle.marketOpen()).toBe(true);
  });

  it('old saves get an empty island', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.isle;
    expect(migrate(st).isle?.room).toBeNull();
  });
});

describe('people from Greyhaven take the same ferry', () => {
  it('a trip across the bay is the walk to the pier, the next boat on the timetable, and the walk off it', () => {
    const day = 3 * MINUTES_PER_DAY;
    const home = locationAnchor(null, null, '老城区');
    const out = planTrip(null, 'isle', home, FERRY_PIER.board, day + hm(9, 20));
    // the walk gets there before ten, so the ten o'clock boat, landing at twenty to eleven
    expect(out.boat).toBe(day + hm(10));
    expect(out.land).toBe(day + hm(10) + FERRY_MINUTES);
    expect(out.arrive).toBeGreaterThan(out.land!);
    expect(out.pier).toBeLessThanOrEqual(out.boat! + FERRY_LATE);
    // setting off too late for it means the next one
    const late = planTrip(null, 'isle', home, FERRY_PIER.board, day + hm(10, 30));
    expect(late.boat).toBe(day + FERRY.city[2]);
    // the last boat back has gone: the first one in the morning
    const stuck = planTrip('isle', null, FERRY_PIER.board, home, day + hm(20, 30));
    expect(stuck.boat).toBe(day + MINUTES_PER_DAY + FERRY.isle[0]);
    expect(nextDeparture('isle', day + hm(20, 1))).toBe(day + hm(20));
    // within the island, or within Greyhaven, no boat
    expect(planTrip('isle', 'isle_diner', FERRY_PIER.board, FERRY_PIER.board, day).boat).toBeUndefined();
  });

  it('over a month, everyone who crosses rides a timetabled boat while she is at the pier, without long waits', () => {
    const c = newCore(4242);
    const trips: NonNullable<GameCore['state']['npcs'][string]['travel']>[] = [];
    c.bus.on('npc:departed', (e) => {
      const t = c.state.npcs[e.id].travel;
      if (t && onIsle(t.from) !== onIsle(t.to)) trips.push({ ...t });
    });
    for (let i = 0; i < 28 * 24; i++) c.advance(60, 'idle');
    // Old Zhou's chess, Kiki's beach, Tommy's busking, Lillian's pool, Sophia's brunch
    expect(trips.length).toBeGreaterThan(10);
    for (const t of trips) {
      const side = onIsle(t.from) ? 'isle' : 'city';
      const m = toDate(t.boat!).minuteOfDay;
      expect(FERRY[side]).toContain(m);
      expect(ferryAt(side, m)).toBe(true);
      expect(t.land).toBe(t.boat! + FERRY_MINUTES);
      expect(ferryAt(side === 'city' ? 'isle' : 'city', toDate(t.land!).minuteOfDay)).toBe(true);
      expect(t.pier!).toBeLessThanOrEqual(t.boat! + FERRY_LATE);
      // the visits are timed to the boats: nobody stands on a pier for an hour
      expect(t.boat! + FERRY_LATE - t.pier!).toBeLessThanOrEqual(45);
    }
  });

  it('you can find yourself on the same boat as someone you know', () => {
    const c = newCore();
    // a Wednesday when Old Zhou goes over for his chess
    let wed = 2;
    while (c.npcs.target('oldzhou', wed * MINUTES_PER_DAY + hm(10)).loc !== 'isle') wed += 7;
    c.state.time.minutes = wed * MINUTES_PER_DAY + hm(6, 30);
    c.npcs.settle(c.now());
    c.advance(45, 'idle');
    expect(c.state.npcs.oldzhou.travel?.boat).toBe(wed * MINUTES_PER_DAY + FERRY.city[0]);
    const r = c.isle.cross('deck', 'cash');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.aboard).toContain('oldzhou');
    // he steps off with you and walks up to the chess table in the village
    expect(c.state.npcs.oldzhou.location).toBeNull();
    c.advance(15, 'idle');
    expect(c.state.npcs.oldzhou.location).toBe('isle');
    expect(c.state.npcs.oldzhou.spot).toBe('isle_chess');
  });
});

describe('who is around outdoors', () => {
  it('counts the people near you on the street or on the island, not everyone on the map', () => {
    const c = newCore();
    const z = c.state.npcs.oldzhou;
    z.location = 'isle';
    z.spot = 'isle_chess';
    z.travel = null;
    c.state.world.location = 'isle';
    c.state.world.x = ISLE_SPOTS.isle_chess.x + 1;
    c.state.world.y = ISLE_SPOTS.isle_chess.y;
    expect(c.social.presentNpcs()).toContain('oldzhou');
    c.state.world.x = 60;
    c.state.world.y = 40;
    expect(c.social.presentNpcs()).not.toContain('oldzhou');
    // in Greyhaven too: by the chess tables in the park, and not from across town
    z.location = 'city';
    z.spot = 'park_chess';
    c.state.world.location = 'city';
    c.state.world.x = CITY_SPOTS.park_chess.x;
    c.state.world.y = CITY_SPOTS.park_chess.y + 2;
    expect(c.social.presentNpcs()).toContain('oldzhou');
    c.state.world.x = (CITY_SPOTS.park_chess.x + 60) % 120;
    c.state.world.y = (CITY_SPOTS.park_chess.y + 45) % 90;
    expect(c.social.presentNpcs()).not.toContain('oldzhou');
  });
});

