import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { MemoryStorage, SaveManager } from '../src/systems/SaveManager';
import { newCore, skip } from './helpers';

function lastMessageFrom(core: GameCore, from: string) {
  return [...core.state.phone.messages].reverse().find((m) => m.from === from && m.actions?.length);
}

function answer(core: GameCore, from: string, suffix: string): string {
  const m = lastMessageFrom(core, from)!;
  const a = m.actions!.find((x) => x.id.endsWith(suffix))!;
  return core.phone.respond(m.id, a.id);
}

/** Advance whole days (storylines are checked at 11:00). */
function days(core: GameCore, n: number): void {
  skip(core, n * MINUTES_PER_DAY);
}

function marcoInTrouble(core: GameCore): void {
  const r = core.social.rel('marco');
  r.met = true;
  r.knowsName = true;
  const rt = core.state.npcs.marco;
  rt.debt = G(9000);
  rt.money = G(200);
  rt.flags.inCrisis = true;
}

describe('storylines: Marco’s gambling debt', () => {
  it('lending: money moves through the ledger and the story follows what Marco does with it', () => {
    const core = newCore(101);
    marcoInTrouble(core);
    const st = core.stories.begin('marco_debt', { via: 'marco' });
    expect(st.stage).toBe('ask');
    const amount = Number(st.data.amount);
    expect(amount).toBeGreaterThanOrEqual(G(800));
    const bank = core.economy.balance('bank');
    expect(answer(core, 'marco', 'ask.lend')).toContain('已转账');
    expect(core.economy.balance('bank')).toBe(bank - amount);
    expect(core.state.economy.receivables.some((r) => r.npc === 'marco' && r.amount === amount && r.status === 'open')).toBe(true);
    expect(core.stories.active('marco_debt')!.stage).toBe('lent');
    // answering again changes nothing
    expect(core.stories.choose('marco_debt', 'ask.lend').text).toContain('已经过去');
    expect(core.economy.balance('bank')).toBe(bank - amount);
    days(core, 8);
    expect(['relapse', 'steady', 'sharks']).toContain(core.stories.active('marco_debt')?.stage);
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('refusing: loan sharks, a plea, and the fallout if nobody steps in', () => {
    const core = newCore(102);
    marcoInTrouble(core);
    core.social.rel('daniel').met = true;
    core.stories.begin('marco_debt', { via: 'marco' });
    const debt = core.state.npcs.marco.debt;
    answer(core, 'marco', 'ask.refuse');
    expect(core.stories.active('marco_debt')!.stage).toBe('spiral');
    expect(core.state.npcs.marco.debt).toBe(debt + G(2500));
    days(core, 4);
    expect(core.stories.active('marco_debt')!.stage).toBe('sharks');
    expect(lastMessageFrom(core, 'daniel')?.actions?.map((a) => a.id.split('.').pop())).toEqual(['pay', 'talk', 'out']);
    answer(core, 'daniel', 'sharks.out');
    expect(core.stories.active('marco_debt')!.stage).toBe('fallout');
    // suspended: no work for two weeks
    const t0 = core.now();
    for (let t = t0; t < t0 + 13 * MINUTES_PER_DAY; t += 60) expect(core.npcs.target('marco', t).act).not.toBe('work');
    days(core, 15);
    expect(core.stories.active('marco_debt')).toBeUndefined();
    expect(core.state.stories.done.at(-1)).toMatchObject({ arc: 'marco_debt', ending: 'fallout' });
    expect(core.state.journal.entries.some((e) => e.text.startsWith('【马可的赌债】'))).toBe(true);
    // it cannot start again right away
    marcoInTrouble(core);
    for (let i = 0; i < 20; i++) core.stories.dailyPass();
    expect(core.stories.active('marco_debt')).toBeUndefined();
  });

  it('paying off the sharks leads to a month away from the tables', () => {
    const core = newCore(103);
    marcoInTrouble(core);
    core.social.rel('daniel').met = true;
    core.stories.begin('marco_debt', { via: 'marco' });
    answer(core, 'marco', 'ask.refuse');
    days(core, 4);
    const help = Number(core.stories.active('marco_debt')!.data.help);
    const bank = core.economy.balance('bank');
    const debt = core.state.npcs.marco.debt;
    answer(core, 'daniel', 'sharks.pay');
    expect(core.economy.balance('bank')).toBe(bank - help);
    expect(core.state.npcs.marco.debt).toBe(debt - help);
    expect(core.stories.active('marco_debt')!.stage).toBe('recovery');
    // he keeps his word: no gambling for 30 days, on screen or off
    const t0 = core.now();
    for (let t = t0; t < t0 + 29 * MINUTES_PER_DAY; t += 30) expect(core.npcs.target('marco', t).act).not.toBe('gamble');
    days(core, 31);
    expect(core.state.stories.done.at(-1)).toMatchObject({ arc: 'marco_debt', ending: 'recovered' });
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('a heart-to-heart works better with trust, and not at all from someone who lives in the casino', () => {
    const tries = (setup: (c: GameCore) => void) => {
      let ok = 0;
      for (let seed = 0; seed < 40; seed++) {
        const core = newCore(500 + seed);
        marcoInTrouble(core);
        setup(core);
        core.stories.begin('marco_debt', { via: 'marco' });
        answer(core, 'marco', 'ask.talk');
        if (core.stories.active('marco_debt')!.stage === 'recovery') ok++;
      }
      return ok;
    };
    const close = tries((c) => Object.assign(c.social.rel('marco'), { affection: 60, trust: 50 }));
    const stranger = tries((c) => Object.assign(c.social.rel('marco'), { affection: 0, trust: 0 }));
    expect(close).toBeGreaterThan(stranger);
  });

  it('only Daniel knows: the story starts as a worried message', () => {
    const core = newCore(104);
    const rt = core.state.npcs.marco;
    rt.flags.inCrisis = true;
    core.social.rel('daniel').met = true;
    core.social.rel('marco').met = false;
    const st = core.stories.begin('marco_debt', { via: 'daniel' });
    expect(st.stage).toBe('rumor');
    answer(core, 'daniel', 'rumor.call');
    expect(core.social.rel('marco').met).toBe(true);
    expect(core.stories.active('marco_debt')!.stage).toBe('ask');
  });
});

describe('storylines: Daniel’s breakfast stall', () => {
  it('investing moves cash into a stake without changing net worth, and every G is accounted for', () => {
    const core = newCore(201);
    core.social.rel('daniel').met = true;
    const st = core.stories.begin('daniel_stall');
    expect(st.stage).toBe('pitch');
    const nw = core.economy.netWorth();
    answer(core, 'daniel', 'pitch.full');
    const stake = core.state.economy.stakes.find((x) => x.id === 'daniel_stall')!;
    expect(stake).toMatchObject({ invested: G(5000), value: G(5000), share: 0.25, status: 'active' });
    expect(core.economy.netWorth()).toBe(nw);
    // run the business to its conclusion (pay up once if asked)
    for (let d = 0; d < 160 && core.stories.active('daniel_stall'); d++) {
      days(core, 1);
      const cur = core.stories.active('daniel_stall');
      if (cur?.stage === 'trouble' && lastMessageFrom(core, 'daniel')?.actions?.some((a) => a.id.endsWith('trouble.more')) && !lastMessageFrom(core, 'daniel')?.resolved) answer(core, 'daniel', 'trouble.more');
    }
    expect(core.stories.active('daniel_stall')).toBeUndefined();
    const ending = core.state.stories.done.find((d) => d.arc === 'daniel_stall')!.ending;
    expect(['thriving', 'modest', 'closed']).toContain(ending);
    expect(stake.status).toBe(ending === 'closed' ? 'closed' : 'sold');
    expect(stake.value).toBe(0);
    // what came back is exactly what the ledger shows from Daniel
    const fromDaniel = core.state.economy.ledger.filter((t) => t.from === 'ext:daniel' && (t.cat === 'dividend' || t.cat === 'investment_sell')).reduce((a, t) => a + t.amount, 0);
    expect(fromDaniel).toBe(stake.received);
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('declining is a quiet ending and the pitch never comes back', () => {
    const core = newCore(202);
    core.social.rel('daniel').met = true;
    core.social.rel('daniel').affection = 40;
    core.stories.begin('daniel_stall');
    answer(core, 'daniel', 'pitch.no');
    expect(core.state.stories.done.at(-1)).toMatchObject({ arc: 'daniel_stall', ending: 'declined' });
    for (let i = 0; i < 60; i++) core.stories.dailyPass();
    expect(core.stories.active('daniel_stall')).toBeUndefined();
    expect(core.state.economy.stakes.length).toBe(0);
  });

  it('a storyline in progress survives save and load and continues identically', () => {
    const core = newCore(203);
    core.social.rel('daniel').met = true;
    core.stories.begin('daniel_stall');
    answer(core, 'daniel', 'pitch.full');
    days(core, 25);
    expect(core.stories.active('daniel_stall')?.stage).toBeDefined();
    const sm = new SaveManager(new MemoryStorage());
    sm.save(core, 'slot1');
    const loaded = sm.load('slot1');
    expect(loaded.state.stories).toEqual(core.state.stories);
    expect(loaded.economy.stakesValue()).toBe(core.economy.stakesValue());
    days(core, 40);
    days(loaded, 40);
    expect(JSON.stringify(loaded.state.stories)).toBe(JSON.stringify(core.state.stories));
    expect(loaded.economy.balance('bank')).toBe(core.economy.balance('bank'));
  });
});

describe('storylines in a running world', () => {
  it('start on their own when their conditions are met', () => {
    const core = newCore(301);
    core.social.rel('daniel').met = true;
    core.social.rel('daniel').affection = 45;
    days(core, 40);
    const seen = new Set([...core.state.stories.active.map((s) => s.arc), ...core.state.stories.done.map((d) => d.arc)]);
    expect(seen.has('daniel_stall')).toBe(true);
    for (const s of core.state.stories.active) expect(s.stage).toBeTruthy();
  });
});
