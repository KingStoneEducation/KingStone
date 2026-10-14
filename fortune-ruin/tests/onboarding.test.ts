import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { G } from '../src/core/money';
import { DEALER } from '../src/tables/dealerLines';
import { parseCard } from '../src/casino/cards';
import { newCore } from './helpers';

describe('knowing you have a job', () => {
  it('a new life starts on a workday morning with the office shift on the agenda', () => {
    const core = newCore(5);
    const a = core.career.agenda();
    expect(a).toHaveLength(1);
    expect(a[0].jobId).toBe('office_clerk');
    expect(a[0].status).toBe('upcoming');
    const start = toDate(a[0].start);
    expect(start.minuteOfDay).toBe(9 * 60);
    expect(Math.floor(a[0].start / MINUTES_PER_DAY)).toBe(core.today());
  });

  it('reminds the player an hour before, a quarter before, and when they are late', () => {
    const core = newCore(6);
    const toasts: string[] = [];
    core.bus.on('toast', ({ text }) => toasts.push(text));
    core.advance(60, 'idle'); // 07:00 → 08:00
    expect(toasts.some((t) => t.includes('一小时后'))).toBe(true);
    core.advance(45, 'idle'); // 08:45
    expect(toasts.some((t) => t.includes('15 分钟'))).toBe(true);
    expect(core.career.agenda()[0].status).toBe('open');
    core.advance(30, 'idle'); // 09:15
    expect(toasts.some((t) => t.includes('迟到'))).toBe(true);
    expect(core.career.agenda()[0].status).toBe('late');
  });

  it('says nothing to a player who is already at work, or asleep', () => {
    const core = newCore(7);
    core.setLocation('office', 5, 5);
    const toasts: string[] = [];
    core.bus.on('toast', ({ text }) => toasts.push(text));
    core.advance(100, 'idle'); // until 08:40, at the office
    expect(toasts.filter((t) => t.includes('上班'))).toHaveLength(0);
    const core2 = newCore(8);
    const t2: string[] = [];
    core2.bus.on('toast', ({ text }) => t2.push(text));
    core2.advance(100, 'sleeping');
    expect(t2.filter((t) => t.includes('上班'))).toHaveLength(0);
  });

  it('after the shift, the agenda points to the next workday', () => {
    const core = newCore(9);
    core.setLocation('office', 5, 5);
    core.advance(60, 'idle'); // 08:00, clock-in opens
    const r = core.career.workShift('office_clerk');
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    const a = core.career.agenda()[0];
    expect(a.status).toBe('next');
    expect(Math.floor(a.start / MINUTES_PER_DAY)).toBe(core.today() + 1);
  });
});

describe('dealer speech', () => {
  const samples = (): string[] => [
    DEALER.shuffle(),
    DEALER.bjBetting(true, false),
    DEALER.bjBetting(false, true),
    DEALER.bjBetting(false, false),
    DEALER.bjInsurance(),
    DEALER.bjNoBlackjack(),
    DEALER.bjDealerBlackjack(),
    DEALER.bjDealerStands(18),
    DEALER.bjDealerOver(24),
    DEALER.bjYourTurn(),
    DEALER.bacBetting(12, false),
    DEALER.bacBetting(1, true),
    DEALER.bacNoMoreBets(),
    DEALER.bacBurn(parseCard('7h'), 7),
    DEALER.bacNatural('both', 8, 9),
    DEALER.bacNatural('player', 9, 3),
    DEALER.bacDraw('player', 4),
    DEALER.bacDraw('banker', 5),
    DEALER.bacResult('tie', 6, 6, true, true),
    DEALER.bacResult('banker', 2, 7, false, false),
    DEALER.rlBetting(G(10), G(200)),
    DEALER.rlNoMoreBets(),
    DEALER.rlResult(0, 'green'),
    DEALER.rlResult(17, 'black'),
    DEALER.pkAllIn('莉娜'),
    DEALER.pkShowdown(),
    DEALER.pkWin('莉娜', G(240), '两对', false),
    DEALER.pkWin('你', G(240), null, true),
    DEALER.pkWelcome(),
    DEALER.pkNextOpen(),
    DEALER.pkBusted(),
    DEALER.pkSeated(),
    DEALER.pkNext(),
  ];

  it('sounds like a professional dealer: no slang, no exclamations, polite to the guest', () => {
    for (const line of samples()) {
      expect(line, line).not.toMatch(/爆|！|!|吗\?|打光|搞定|哈/);
      // the guest is addressed as 您, never 你
      expect(line, line).not.toMatch(/你/);
      expect(line.trim().length).toBeGreaterThan(1);
    }
  });

  it('closes betting with the table phrase and announces outcomes plainly', () => {
    expect(DEALER.rlNoMoreBets()).toContain('买定离手');
    expect(DEALER.bacNoMoreBets()).toContain('买定离手');
    expect(DEALER.bjDealerOver(23)).toContain('超过 21 点');
    expect(DEALER.bacResult('player', 7, 5, false, true)).toBe('闲 7 点，庄 5 点，闲赢。庄对。');
    expect(DEALER.rlResult(17, 'black')).toBe('17 号，黑色，单，小。');
  });
});
