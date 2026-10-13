import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { newCore, skip } from './helpers';
import { NPCS } from '../src/data/npcs';

describe('long-running world simulation', () => {
  it('runs 45 days headless: bills, salary, NPC movement, events — with money conserved', () => {
    const core = newCore(2024);
    const startNet = core.economy.netWorth();
    const visited = new Map<string, Set<string>>();
    const t0 = core.now();
    for (let day = 0; day < 45; day++) {
      for (let h = 0; h < 24; h++) {
        if (core.now() >= t0 + (day * 24 + h + 1) * 60) continue;
        skip(core, t0 + (day * 24 + h + 1) * 60 - core.now());
        for (const d of NPCS) {
          const loc = core.state.npcs[d.id].location;
          if (loc) {
            const s = visited.get(d.id) ?? new Set();
            s.add(loc);
            visited.set(d.id, s);
          }
        }
      }
      expect(core.economy.checkConservation().ok).toBe(true);
    }
    // time moved on correctly
    const d = toDate(core.now());
    expect(d.month).toBe(3); // March + 45 days of 28-day months => April
    // monthly bills were issued on April 1st and autopaid from the bank
    const rent = core.state.economy.bills.filter((b) => b.kind === 'rent');
    expect(rent.length).toBe(1);
    expect(rent[0].paidDay).not.toBeNull();
    // the idle player never went to work: absences led to dismissal
    expect(core.state.career.jobs[0].status).toBe('fired');
    // salary accrued before the start was still paid
    expect(core.state.economy.lifetimeByCat.salary ?? 0).toBeGreaterThan(0);
    // living costs reduced net worth
    expect(core.economy.netWorth()).toBeLessThan(startNet);
    // NPCs actually move between several places
    expect(visited.get('eileen')?.size ?? 0).toBeGreaterThanOrEqual(3);
    expect(visited.get('victor')?.has('casino')).toBe(true);
    // the journal and phone received content
    expect(core.state.journal.entries.length).toBeGreaterThan(3);
    expect(core.state.phone.messages.length).toBeGreaterThan(3);
    // daily stats were recorded
    expect(core.state.stats.days.length).toBeGreaterThanOrEqual(44);
  });

  it('needs decay over time and sleeping restores rest', () => {
    const core = newCore(5);
    core.advance(16 * 60, 'idle');
    const s = core.state.player.stats;
    expect(s.sleep).toBeLessThan(25);
    expect(s.hunger).toBeGreaterThan(80);
    const before = s.sleep;
    expect(core.sleep(8)).toContain('睡');
    expect(core.state.player.stats.sleep).toBeGreaterThan(before + 60);
  });

  it('working a shift pays wages on payday and improves standing', () => {
    const core = newCore(8);
    // go to the office at 8:30 on Monday
    core.advance(90, 'idle');
    core.setLocation('office', 100, 100);
    const r = core.career.workShift('office_clerk');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report!.hours).toBeCloseTo(8, 0);
    expect(toDate(core.now()).hour).toBe(17);
    const accrued = core.state.career.jobs[0].accrued;
    expect(accrued).toBeGreaterThan(G(1100));
    // payday arrives (4 days after start) and money lands in the bank
    const bank = core.economy.balance('bank');
    skip(core, 4 * MINUTES_PER_DAY);
    expect(core.economy.balance('bank')).toBeGreaterThan(bank);
  });
});
