import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import * as LOC from '../src/data/locations';
import { DATE_VENUES, ROMANCE, type Interest } from '../src/data/romance';
import { NPCS } from '../src/data/npcs';
import { newCore } from './helpers';

function core(pronoun: 'he' | 'she' | 'they', interest: Interest, seed = 1): GameCore {
  return newCore(seed, { appearance: { skin: 1, hairStyle: 0, hairColor: 0, pronoun }, interest });
}

function lucky<T>(c: GameCore, f: () => T): T {
  const chance = c.rng.chance.bind(c.rng);
  c.rng.chance = () => true;
  try {
    return f();
  } finally {
    c.rng.chance = chance;
  }
}

function warm(c: GameCore, id: string, v = 60): void {
  const r = c.social.rel(id);
  r.met = true;
  r.knowsName = true;
  r.familiarity = v;
  r.affection = v;
  r.trust = v;
  r.attraction = v;
}

/** Turn up to a scheduled date and choose how the evening goes. */
function goOnDate(c: GameCore, id: string, choice = 'listen'): string {
  const ev = c.events.upcoming().find((e) => e.def === 'date' && e.npc === id)!;
  c.state.time.minutes = ev.at;
  c.setLocation(String(ev.location), -1, -1);
  c.events.tickMinute(c.now());
  expect(c.events.pendingPrompt?.title).toBe('约会');
  return c.events.resolvePrompt(choice);
}

describe('who can fall for whom', () => {
  it('every pronoun and interest has several people to meet; "not now" has none', () => {
    for (const p of ['he', 'she', 'they'] as const) {
      for (const i of ['men', 'women', 'all'] as const) {
        const c = core(p, i);
        expect(c.romance.candidates().length, `${p}/${i}`).toBeGreaterThanOrEqual(3);
      }
      expect(core(p, 'none').romance.candidates()).toEqual([]);
    }
  });

  it('candidates match both sides: the player’s interest and who they themselves like', () => {
    const c = core('she', 'women');
    for (const id of c.romance.candidates()) {
      expect(NPCS.find((n) => n.id === id)!.look.body).toBe('f');
      expect(ROMANCE[id].likes).toContain('she');
    }
  });

  it('people at work for the casino, the landlady and the boss keep it professional', () => {
    const c = core('they', 'all');
    for (const id of ['victor', 'natasha', 'jack', 'margaret', 'raymond', 'ben', 'oldzhou', 'marco']) {
      warm(c, id, 80);
      expect(c.romance.askOption(id).show, id).toBe(false);
    }
  });

  it('someone who could never fall for you can admire you, but much less', () => {
    const c = core('he', 'all');
    // Isabella likes women and non-binary people; Eileen could fall for him
    for (const id of ['isabella', 'eileen']) warm(c, id, 30);
    const before = { isabella: c.social.rel('isabella').attraction, eileen: c.social.rel('eileen').attraction };
    for (const id of ['isabella', 'eileen']) c.social.applyDirect(id, { kind: 'chat', facets: { charm: 1 }, importance: 2 }, { silent: true, noMemory: true });
    const gainI = c.social.rel('isabella').attraction - before.isabella;
    const gainE = c.social.rel('eileen').attraction - before.eileen;
    expect(gainI).toBeGreaterThan(0);
    expect(gainI).toBeLessThan(gainE * 0.5);
  });
});

describe('dating', () => {
  it('asking out only appears once you know each other, and a yes books a real evening out', () => {
    const c = core('he', 'women');
    expect(c.romance.askOption('eileen').show).toBe(false);
    warm(c, 'eileen');
    expect(c.romance.askOption('eileen')).toEqual({ show: true });
    const res = lucky(c, () => c.romance.askOut('eileen'));
    expect(res.yes).toBe(true);
    const ev = c.events.upcoming().find((e) => e.def === 'date')!;
    expect(ev.location).toBe(ROMANCE.eileen.venues[0]);
    // from tomorrow, on a day the place is open
    const day = Math.floor(ev.at / MINUTES_PER_DAY);
    expect(day).toBeGreaterThanOrEqual(c.today() + 1);
    expect(day).toBeLessThanOrEqual(c.today() + 7);
    expect(c.romance.askOption('eileen').disabled).toBe('你们已经约好了');
    // she shows up there
    c.state.time.minutes = ev.at;
    c.npcs.settle(c.now());
    expect(c.state.npcs.eileen.location).toBe(ev.location);
  });

  it('three good dates and a confession make you partners; the dinners are paid for', () => {
    const c = core('they', 'all', 3);
    warm(c, 'grace', 70);
    lucky(c, () => c.romance.askOut('grace'));
    for (let i = 0; i < 3; i++) {
      const venue = c.events.upcoming().find((e) => e.def === 'date')!.location!;
      const money = c.economy.balance('cash') + c.economy.balance('bank');
      goOnDate(c, 'grace', i === 1 ? 'share' : 'listen');
      expect(money - (c.economy.balance('cash') + c.economy.balance('bank'))).toBe(DATE_VENUES[venue].cost);
      expect(c.romance.stage('grace')).toBe('dating');
      if (i < 2) {
        expect(c.romance.confessOption('grace').disabled).toBe('再多约会几次吧');
        c.romance.dateAgain('grace');
      }
    }
    expect(c.romance.dates('grace')).toBe(3);
    const res = lucky(c, () => c.romance.confess('grace'));
    expect(res.yes).toBe(true);
    expect(c.romance.partner()).toBe('grace');
    expect(c.social.statusName(c.social.rel('grace').status)).toBe('恋人');
    // nobody else while you are together
    warm(c, 'eileen', 70);
    expect(c.romance.askOption('eileen').disabled).toBe('你已经有恋人了');
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('every date is booked while the place is open, on any day of the week', () => {
    const { LOCATIONS, isOpen } = LOC;
    for (let start = 0; start < 7; start++) {
      const c = core('they', 'all', 20 + start);
      c.state.time.minutes += start * MINUTES_PER_DAY;
      for (const id of c.romance.candidates()) {
        for (let n = 0; n < ROMANCE[id].venues.length; n++) {
          c.social.rel(id).flags.dates = n;
          const ev = c.romance.scheduleDate(id);
          for (const t of [ev.at, ev.until - 1]) {
            const d = toDate(t);
            expect(isOpen(LOCATIONS[String(ev.location)], d.weekday, d.minuteOfDay), `${id} at ${ev.location}`).toBe(true);
          }
        }
      }
    }
  });

  it('standing someone up hurts', () => {
    const c = core('he', 'women', 4);
    warm(c, 'kiki', 55);
    lucky(c, () => c.romance.askOut('kiki'));
    const ev = c.events.upcoming().find((e) => e.def === 'date')!;
    const before = c.social.rel('kiki').affection;
    c.state.time.minutes = ev.until + 1;
    c.events.tickMinute(c.now());
    expect(ev.status).toBe('missed');
    expect(c.social.recall('kiki', ['stood_up'], 1)).toBeTruthy();
    expect(c.social.rel('kiki').affection).toBeLessThan(before - 3);
  });

  it('a partner you never call drifts away and finally ends it', () => {
    const c = core('he', 'men', 5);
    warm(c, 'tommy', 60);
    const r = c.social.rel('tommy');
    r.flags.romance = 'partner';
    r.status = 'partner';
    r.lastContact = c.now() - 19 * MINUTES_PER_DAY;
    r.affection = 20;
    c.romance.dailyPass();
    expect(c.romance.stage('tommy')).toBe('ex');
    expect(r.status).not.toBe('partner');
    expect(c.state.phone.messages.some((m) => m.from === 'tommy' && m.body === ROMANCE.tommy.leave)).toBe(true);
  });

  it('breaking up is yours to do, and it costs the relationship', () => {
    const c = core('she', 'men', 6);
    warm(c, 'daniel', 70);
    const r = c.social.rel('daniel');
    r.flags.romance = 'partner';
    r.status = 'partner';
    const trust = r.trust;
    c.romance.breakUp('daniel');
    expect(c.romance.stage('daniel')).toBe('ex');
    expect(r.trust).toBeLessThan(trust);
    expect(c.romance.partner()).toBeNull();
  });

  it('the conversation menu leads to it', () => {
    const c = core('he', 'women', 7);
    c.state.time.minutes = 3 * MINUTES_PER_DAY + 10 * 60;
    c.npcs.settle(c.now());
    c.state.world.location = c.state.npcs.eileen.location ?? 'cafe';
    c.state.npcs.eileen.location = c.state.world.location;
    warm(c, 'eileen', 60);
    const v = c.dialogue.start('eileen');
    expect(v.options.some((o) => o.id === 'menu_romance')).toBe(true);
    const sub = c.dialogue.choose('menu_romance');
    expect(sub.options.map((o) => o.id)).toContain('romance_ask');
    c.dialogue.end();
  });
});
