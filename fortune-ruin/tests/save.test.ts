import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { GameCore } from '../src/core/GameCore';
import { MemoryStorage, SaveManager, deserialize, serialize, SaveError } from '../src/systems/SaveManager';
import { newCore, playBlackjackRound } from './helpers';

function script(core: GameCore, steps: number): void {
  for (let i = 0; i < steps; i++) {
    playBlackjackRound(core, 'bj1', G(10));
    core.advance(7, 'gambling');
  }
}

describe('save / load', () => {
  it('round-trips the full world state exactly', () => {
    const core = newCore(31337);
    core.setLocation('casino', 50, 60);
    core.economy.buyChips(G(400), 'cash');
    core.casino.sit('bj1');
    script(core, 10);
    core.social.applyDirect('eileen', { kind: 'gift', facets: { generosity: 0.5 }, importance: 20, data: { item: '花束' } });
    const text = serialize(core, 'slot1');
    const restored = deserialize(text);
    core.syncRng();
    expect(JSON.stringify(restored)).toBe(JSON.stringify(core.state));
    // NPC memories, casino shoe state and world time survive
    expect(restored.social.memories.length).toBe(core.state.social.memories.length);
    expect(restored.casino.tables.bj1).toEqual(core.state.casino.tables.bj1);
    expect(restored.time.minutes).toBe(core.state.time.minutes);
  });

  it('a loaded game continues identically (deterministic simulation incl. the shoe)', () => {
    const a = newCore(4711);
    a.setLocation('casino', 50, 60);
    a.economy.buyChips(G(600), 'cash');
    a.casino.sit('bj1');
    script(a, 6);
    const store = new MemoryStorage();
    const sm = new SaveManager(store);
    sm.save(a, 'slot2', 'test');
    const b = sm.load('slot2');
    script(a, 25);
    script(b, 25);
    a.advance(3 * 24 * 60, 'idle');
    b.advance(3 * 24 * 60, 'idle');
    a.syncRng();
    b.syncRng();
    const strip = (s: GameCore) => JSON.stringify({ ...s.state, meta: { ...s.state.meta, savedReal: 0, playMs: 0 } });
    expect(strip(b)).toBe(strip(a));
  });

  it('saves in the middle of a blackjack hand and resumes it', () => {
    const core = newCore(99);
    core.setLocation('casino', 50, 60);
    core.economy.buyChips(G(200), 'cash');
    core.casino.sit('bj1');
    // deal until the player has a decision to make
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      core.casino.bjPatronBets('bj1');
      core.casino.bjSetBet('bj1', G(10));
      core.casino.bjDeal('bj1');
      const s = core.casino.bj('bj1');
      if (s.phase === 'insurance') core.casino.bjInsurance('bj1', false);
      while (s.phase === 'player' && core.casino.bjTurnOwner('bj1') !== 'player') core.casino.bjPatronAct('bj1');
      if (s.phase === 'player' && core.casino.bjTurnOwner('bj1') === 'player') found = true;
      else core.casino.collect('bj1');
    }
    expect(found).toBe(true);
    const text = serialize(core, 'auto');
    const loaded = new GameCore(deserialize(text));
    const s = loaded.casino.bj('bj1');
    expect(s.phase).toBe('player');
    expect(loaded.casino.bjTurnOwner('bj1')).toBe('player');
    expect(loaded.state.casino.activeTable).toBe('bj1');
    const r = loaded.casino.bjPlayerAct('bj1', 'stand');
    expect(r.ok).toBe(true);
  });

  it('rejects corrupted or foreign files', () => {
    const core = newCore(1);
    const text = serialize(core, 'slot1');
    const tampered = text.replace('"cash":100000', '"cash":999999999');
    expect(() => deserialize(tampered)).toThrow(SaveError);
    expect(() => deserialize('{"hello":1}')).toThrow(SaveError);
    expect(() => deserialize('not json')).toThrow(SaveError);
  });

  it('lists and removes slots', () => {
    const sm = new SaveManager(new MemoryStorage());
    expect(sm.list().every((x) => x === null)).toBe(true);
    const core = newCore(2);
    sm.save(core, 'slot3', '第一次');
    const list = sm.list();
    expect(list[3]?.label).toBe('第一次');
    expect(list[3]?.name).toBe('测试者');
    sm.remove('slot3');
    expect(sm.has('slot3')).toBe(false);
  });
});
