import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { appraise } from '../src/systems/SocialSystem';
import { NPC_BY_ID } from '../src/data/npcs';
import { newCore } from './helpers';
import { MINUTES_PER_DAY } from '../src/core/calendar';

const neutral = { affection: 10, trust: 10, respect: 10, attraction: 0, envy: 0, dependency: 0, fear: 0, familiarity: 30 };

describe('appraisal: different NPCs react differently to the same behaviour', () => {
  it('a big casino win', () => {
    const facets = { wealthGain: 1, gambling: 0.8 };
    const victor = appraise(NPC_BY_ID.victor.traits, facets, neutral);
    const eileen = appraise(NPC_BY_ID.eileen.traits, facets, neutral);
    const alexander = appraise(NPC_BY_ID.alexander.traits, facets, neutral);
    const sophia = appraise(NPC_BY_ID.sophia.traits, facets, neutral);
    const kiki = appraise(NPC_BY_ID.kiki.traits, facets, neutral);
    // the casino host respects a winner far more than the investment advisor does
    expect(victor.respect!).toBeGreaterThan(5);
    expect(sophia.respect ?? 0).toBeLessThan(victor.respect!);
    // the barista who hates gambling does not gain respect or trust from it
    expect(eileen.respect ?? 0).toBeLessThan(2);
    expect(eileen.trust ?? 0).toBeLessThan(0);
    // the old-money heir is not impressed by gambling money
    expect(alexander.respect ?? 0).toBeLessThan(victor.respect!);
    // an envious, materialistic coworker gets envious
    expect(kiki.envy ?? 0).toBeGreaterThan(eileen.envy ?? 0);
  });

  it('financial crisis: loyal friends stay, opportunists pull back', () => {
    const facets = { wealthLoss: 1, crisis: 1 };
    const close = { ...neutral, affection: 55, trust: 50, familiarity: 70 };
    const daniel = appraise(NPC_BY_ID.daniel.traits, facets, close);
    const eileen = appraise(NPC_BY_ID.eileen.traits, facets, close);
    const lillian = appraise(NPC_BY_ID.lillian.traits, facets, close);
    expect(daniel.affection ?? 0).toBeGreaterThan(0);
    expect(eileen.affection ?? 0).toBeGreaterThan(0);
    expect(lillian.affection ?? 0).toBeLessThan(0);
    expect((lillian.respect ?? 0)).toBeLessThan(daniel.respect ?? 0);
  });

  it('lying hurts honest people most', () => {
    const e = appraise(NPC_BY_ID.eileen.traits, { deceit: 1 }, neutral);
    const m = appraise(NPC_BY_ID.marco.traits, { deceit: 1 }, neutral);
    expect(e.trust!).toBeLessThan(m.trust!);
  });
});

describe('relationships, memory and knowledge', () => {
  it('wealth falling does not wipe out an existing friendship', () => {
    const core = newCore(3);
    const before = core.social.rel('daniel').affection;
    core.social.applyDirect('daniel', { kind: 'big_loss', facets: { wealthLoss: 1.2, gambling: 0.6 }, importance: 40, data: { amount: G(8000) } });
    core.social.applyDirect('daniel', { kind: 'evicted', facets: { wealthLoss: 0.7, crisis: 0.8 }, importance: 45 });
    const after = core.social.rel('daniel').affection;
    expect(after).toBeGreaterThan(before - 10);
    expect(core.social.rel('daniel').status === 'friend' || core.social.rel('daniel').status === 'close').toBe(true);
  });

  it('NPCs remember events with time, importance and source', () => {
    const core = newCore(4);
    core.social.applyDirect('eileen', { kind: 'lent_money', facets: { generosity: 0.8, support: 0.7 }, importance: 34, data: { amount: G(300) } });
    const m = core.social.recall('eileen', 'lent_money');
    expect(m).toBeDefined();
    expect(m!.source).toBe('witnessed');
    expect(m!.t).toBe(core.now());
    expect(m!.importance).toBeGreaterThan(20);
    core.advance(10 * MINUTES_PER_DAY, 'idle');
    // still remembered ten days later, with decayed salience
    const later = core.social.recall('eileen', 'lent_money');
    expect(later).toBeDefined();
    expect(core.social.effectiveImportance(later!)).toBeLessThan(later!.importance);
  });

  it('strangers do not know your bank balance; the bank officer learns it through legitimate access', () => {
    const core = newCore(5);
    expect(core.social.belief('grace').wealth).toBeNull();
    expect(core.social.belief('alexander').wealth).toBeNull();
    core.setLocation('bank', 100, 100);
    core.social.institutionalKnowledge('grace');
    expect(core.social.belief('grace').wealth?.basis).toBe('bank_records');
    expect(core.social.belief('alexander').wealth).toBeNull();
  });

  it('rumors spread along social ties and can be distorted', () => {
    const core = newCore(6);
    core.social.applyDirect('kiki', { kind: 'big_win', facets: { wealthGain: 1, gambling: 0.7 }, importance: 50, data: { amount: G(10000), game: '轮盘' } });
    for (let i = 0; i < 12; i++) core.social.spreadRumors();
    const heard = core.state.social.memories.filter((m) => m.kind === 'big_win' && m.source === 'rumor');
    expect(heard.length).toBeGreaterThan(0);
    for (const h of heard) {
      expect(h.reliability).toBeLessThan(1);
      expect(h.via).toBeDefined();
      expect(NPC_BY_ID[h.via!].circle).toContain(h.npc);
    }
    // the people who heard it now believe the player is richer
    const listener = heard[0].npc;
    expect(core.social.belief(listener).wealth).not.toBeNull();
  });

  it('perceived wealth follows appearance, not the bank balance', () => {
    const core = newCore(7);
    const plain = core.wealth.perceivedByStrangers();
    core.state.inventory.outfits.push('outfit_designer');
    core.inventory.wear('outfit_designer');
    expect(core.wealth.perceivedByStrangers()).toBeGreaterThan(plain * 5);
    // real wealth did not change
    expect(core.economy.netWorth()).toBe(G(20000));
  });

  it('dialogue reacts to what the NPC knows', () => {
    const core = newCore(8);
    core.setLocation('cafe', 100, 100);
    core.state.npcs.eileen.location = 'cafe';
    core.social.applyDirect('eileen', { kind: 'big_loss', facets: { wealthLoss: 1, gambling: 0.7 }, importance: 45, data: { amount: G(6000) } }, { source: 'rumor', reliability: 0.6, via: 'daniel' });
    const view = core.dialogue.start('eileen');
    const text = view.lines.join(' ');
    expect(text).toMatch(/丹尼尔|输/);
    expect(view.options.some((o) => o.id === 'resp_honest')).toBe(true);
    const next = core.dialogue.choose('resp_honest');
    expect(next.lines.length).toBeGreaterThan(0);
    core.dialogue.choose('bye');
    expect(core.dialogue.session).toBeNull();
  });
});
