import type { GameCore } from '../core/GameCore';
import { G, formatG } from '../core/money';
import { MINUTES_PER_DAY, fromDate, toDate } from '../core/calendar';
import { HOMES } from '../data/housing';
import { NPC_BY_ID } from '../data/npcs';
import { TIER_INDEX } from '../casino/tables';
import { inviteMessage } from './EventManager';

/**
 * People get in touch because of what is going on in the player's life:
 * a friend who heard about the losses comes round with breakfast, the casino
 * host calls when a good customer stops coming, the bank rings about overdue
 * bills, the socialite invites new money to her gala.
 *
 * Every rule looks only at what that person could know: their memories and
 * beliefs about the player, or what their job shows them (the host sees the
 * casino account, the banker the bank account, the landlord the rent).
 * Replies change real things — comps, access, prices, interest, relationships.
 */
interface Rule {
  id: string;
  npc: string;
  cooldown: number;
  chance: number;
  /** hours of the day the rule is checked at (default: every pass) */
  hours?: number[];
  /** may write to someone they have not met (their job gives them the number) */
  strangers?: boolean;
  when: (core: GameCore) => Record<string, string | number> | null;
  fire: (core: GameCore, p: Record<string, string | number>) => void;
}

export const OUTREACH_HOURS = [8, 13, 19];
/** at most this many people reach out in one day */
const DAILY_LIMIT = 2;

const name = (id: string) => NPC_BY_ID[id]?.name ?? id;
const daysSince = (core: GameCore, loc: string) => {
  const d = core.state.world.lastVisit?.[loc];
  return d === undefined ? Infinity : core.today() - d;
};
const knows = (core: GameCore, npc: string, kinds: string[], days: number) => !!core.social.recall(npc, kinds, days);

const RULES: Rule[] = [
  {
    id: 'daniel_casino_nights',
    npc: 'daniel',
    cooldown: 12,
    chance: 0.7,
    when: (core) => {
      const r = core.social.rel('daniel');
      if (r.affection < 15 || core.casino.recentHours(7) < 10) return null;
      const aware = core.social.belief('daniel').knowsGambling >= 20 || knows(core, 'daniel', ['seen_casino', 'big_loss', 'big_win'], 10);
      return aware ? {} : null;
    },
    fire: (core) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 18) + MINUTES_PER_DAY;
      inviteMessage(core, 'basketball', 'daniel', at, 150, '听说你这礼拜天天往赌场跑？我不是来管你的。明天傍晚六点球场，来不来？输了请我喝东西。');
    },
  },
  {
    id: 'daniel_visit',
    npc: 'daniel',
    cooldown: 21,
    chance: 0.8,
    hours: [8],
    when: (core) => {
      const r = core.social.rel('daniel');
      if (r.affection < 35 || !core.isAtHome()) return null;
      const m = core.social.recall('daniel', ['big_loss', 'evicted', 'loan_default'], 4);
      return m ? { kind: m.kind } : null;
    },
    fire: (core, p) => {
      const home = HOMES[core.state.housing.homeId].location;
      core.npcs.setOverrideAt('daniel', core.now() + 10, 90, home, null, 'visit', '来看你');
      core.phone.send('daniel', '丹尼尔', p.kind === 'big_loss' ? '我在你家楼下，带了两份早饭。开门，我们聊聊。' : '我在你家门口。别装不在家，开门。');
      core.journal.add('social', '丹尼尔一早来家里找你。');
    },
  },
  {
    id: 'daniel_car',
    npc: 'daniel',
    cooldown: 9999,
    chance: 1,
    when: (core) => {
      const v = core.inventory.vehicle();
      if (!v || v.price < G(30000) || core.state.player.flags.mechanicFriend) return null;
      return core.social.rel('daniel').affection >= 20 ? { car: v.name } : null;
    },
    fire: (core, p) => {
      core.state.player.flags.mechanicFriend = true;
      core.phone.send('daniel', '丹尼尔', `你开上${p.car}了？！哪天载我兜一圈。保养别去 4S 店，开来车行找我，按成本价给你弄——保险和保养每个月能省三成。`);
    },
  },
  {
    id: 'eileen_missed',
    npc: 'eileen',
    cooldown: 20,
    chance: 0.6,
    when: (core) => {
      const r = core.social.rel('eileen');
      if (r.affection < 25 || (core.state.world.visited.cafe ?? 0) < 3) return null;
      return daysSince(core, 'cafe') >= 9 ? {} : null;
    },
    fire: (core) => {
      core.state.player.flags.freeLatte = 1;
      core.phone.send('eileen', '艾琳', '好久没见你来店里了，最近还好吗？下次来，第一杯拿铁我请。');
    },
  },
  {
    id: 'eileen_note',
    npc: 'eileen',
    cooldown: 14,
    chance: 0.6,
    when: (core) => {
      const r = core.social.rel('eileen');
      const s = core.state.player.stats;
      if (r.affection < 30 || core.now() - r.lastTalk > 4 * MINUTES_PER_DAY) return null;
      return s.stress >= 72 || s.mood <= 28 ? {} : null;
    },
    fire: (core) => {
      core.phone.send('eileen', '艾琳', '上次你来的时候看起来特别累。（附了一张照片：杯套上写着「照顾好自己」。）');
      core.player.addMoodBuff('eileen_note', 6, 60 * 24, '艾琳的便签');
    },
  },
  {
    id: 'victor_comeback',
    npc: 'victor',
    cooldown: 21,
    chance: 0.7,
    strangers: true,
    when: (core) => {
      const m = core.state.casino.membership;
      const tier = TIER_INDEX[m.tier];
      if (tier < 1 || m.visits === 0 || core.today() - m.lastVisitDay < 10 || core.state.casino.bannedUntil > core.now()) return null;
      return { tier };
    },
    fire: (core, p) => {
      const comps = G(40) * Number(p.tier);
      core.state.casino.comps += comps;
      core.phone.send('victor', '维克多（灰港大赌场）', `好久没在场子里见到您了。我给您的账户加了 ${formatG(comps)} 餐饮积分，来的时候找我就能用。随时恭候。`);
    },
  },
  {
    id: 'victor_winner',
    npc: 'victor',
    cooldown: 14,
    chance: 0.8,
    strangers: true,
    when: (core) => {
      const cs = core.state.casino;
      if (core.casino.netLast(3) < G(15000) || core.casino.areaAccess('high') === null) return null;
      return TIER_INDEX[cs.membership.tier] >= 1 || cs.membership.lifetimeTheo >= G(300) ? {} : null;
    },
    fire: (core) => {
      core.state.casino.invites.highLimit = core.today() + 7;
      core.phone.send('victor', '维克多（灰港大赌场）', '恭喜您这几天手气不错。高额区这一周对您开放，专属荷官和包间都准备好了。');
    },
  },
  {
    id: 'jack_warning',
    npc: 'jack',
    cooldown: 20,
    chance: 1,
    strangers: true,
    when: (core) => {
      const cs = core.state.casino;
      return cs.heat >= 40 && !cs.barredBlackjack ? {} : null;
    },
    fire: (core) => {
      core.phone.send('jack', '灰港大赌场安保部', '我们注意到您近期在 21 点桌上的下注方式。请您知悉：赌场有权拒绝任何客人参与任何游戏。');
    },
  },
  {
    id: 'grace_overdue',
    npc: 'grace',
    cooldown: 20,
    chance: 0.8,
    strangers: true,
    when: (core) => {
      const late = core.economy.overdueBills().length > 0 || core.state.economy.loans.some((l) => l.status === 'default');
      return late && core.state.player.creditScore < 620 ? {} : null;
    },
    fire: (core) => {
      core.phone.send('grace', '格蕾丝（灰港储蓄信托）', '系统显示您的账户有逾期。越早处理，对信用记录的影响越小——上班时间来柜台找我，我们可以谈延期或分期。', [{ id: 'open:bills', label: '查看账单' }]);
    },
  },
  {
    id: 'grace_private',
    npc: 'grace',
    cooldown: 9999,
    chance: 1,
    strangers: true,
    when: (core) => (core.economy.balance('bank') >= G(500000) && !core.state.player.flags.privateBanking ? {} : null),
    fire: (core) => {
      core.state.player.flags.privateBanking = true;
      core.phone.send('grace', '格蕾丝（灰港储蓄信托）', '您的存款达到了私人银行的服务标准。从下个月起，储蓄账户中超过 500,000 G 的部分按年化 2.5% 计息（其余部分仍为 1.5%）。');
    },
  },
  {
    id: 'margaret_cookies',
    npc: 'margaret',
    cooldown: 60,
    chance: 0.5,
    when: (core) => {
      const h = core.state.housing;
      if (h.homeId !== 'home_basic' || h.tenure !== 'rent' || !core.housing.landlord().margaret || core.today() - h.leaseStartDay < 56) return null;
      if (h.overdueDays > 0 || h.evictionNoticeDay !== null || core.housing.rentOverdue()) return null;
      return core.social.rel('margaret').affection >= 10 ? {} : null;
    },
    fire: (core) => {
      core.inventory.add('homemade_cookies', 1);
      core.social.applyDelta('margaret', { affection: 2 });
      core.phone.send('margaret', '玛格丽特', '这几个月房租一天都没晚过，谢谢你。我烤了些饼干，放在你门口了。');
    },
  },
  {
    id: 'kiki_jealous',
    npc: 'kiki',
    cooldown: 30,
    chance: 0.8,
    when: (core) => (knows(core, 'kiki', ['promotion'], 10) ? {} : null),
    fire: (core) => {
      core.social.applyDelta('kiki', { envy: 6 });
      core.phone.send('kiki', '琪琪', '恭喜升职呀～以后可要多罩着我哦（笑）');
    },
  },
  {
    id: 'kiki_treat',
    npc: 'kiki',
    cooldown: 20,
    chance: 0.7,
    when: (core) => (knows(core, 'kiki', ['big_win'], 7) && core.career.job('office_clerk') ? {} : null),
    fire: (core) => {
      core.phone.send('kiki', '琪琪', '听说你发财啦？请我们部门喝个下午茶嘛～', [
        { id: 'out:treat:kiki', label: '请大家喝下午茶（120 G）' },
        { id: 'out:no:kiki', label: '下次吧' },
      ]);
    },
  },
  {
    id: 'lillian_gala',
    npc: 'lillian',
    cooldown: 45,
    chance: 0.6,
    strangers: true,
    when: (core) => (core.economy.netWorth() >= G(800000) ? {} : null),
    fire: (core) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 20) + 4 * MINUTES_PER_DAY;
      const others = ['alexander', 'sophia'];
      for (const o of ['lillian', ...others]) core.npcs.setOverrideAt(o, at, 180, 'club', o === 'lillian' ? 'club_lounge1' : null, 'party', '慈善晚宴');
      const met = core.social.rel('lillian').met;
      inviteMessage(core, 'gala', 'lillian', at, 180, `${met ? '亲爱的' : '冒昧打扰，我从朋友那里要到了您的联系方式。'}周五晚上八点，子午线会所有一场为港区儿童医院募款的慈善晚宴，我想邀请您出席。着装：正装。`, {}, others);
    },
  },
  {
    id: 'isabella_wardrobe',
    npc: 'isabella',
    cooldown: 40,
    chance: 0.6,
    when: (core) => (core.economy.netWorth() >= G(300000) && core.inventory.appearancePrestige() <= 2 ? {} : null),
    fire: (core) => {
      core.state.player.flags['discount:boutique'] = core.today() + 14;
      core.phone.send('isabella', '伊莎贝拉', '恕我直言，你的衣柜配不上你现在的身份。两周内来店里，所有成衣给你打八五折。');
    },
  },
  {
    id: 'tommy_drunk',
    npc: 'tommy',
    cooldown: 14,
    chance: 0.7,
    when: (core) => (knows(core, 'tommy', ['drunk_scene'], 5) ? {} : null),
    fire: (core) => {
      core.phone.send('tommy', '汤米', '昨晚你喝得有点多。下次来，我先给你调一杯无酒精的。别嫌我啰嗦。');
    },
  },
  {
    id: 'ben_tasting',
    npc: 'ben',
    cooldown: 45,
    chance: 0.5,
    when: (core) => ((core.state.world.visited.restaurant ?? 0) >= 5 && core.social.rel('ben').affection >= 20 ? {} : null),
    fire: (core) => {
      core.state.player.flags.freePasta = 1;
      core.phone.send('ben', '本杰明', '招牌意面换了做法。来店里尝尝，第一份算我的。');
    },
  },
];

export const OUTREACH_IDS = RULES.map((r) => r.id);

export class OutreachSystem {
  constructor(private core: GameCore) {}

  private key(id: string): string {
    return `out:${id}`;
  }

  /** Called at OUTREACH_HOURS. `only` limits the pass to some rules (tests). */
  pass(hour: number, only?: string[]): void {
    const core = this.core;
    const e = core.state.events;
    const day = core.today();
    const sentKey = `out:sent:${day}`;
    let sent = e.count[sentKey] ?? 0;
    for (const rule of RULES) {
      if (sent >= DAILY_LIMIT) break;
      if (only && !only.includes(rule.id)) continue;
      if (rule.hours && !rule.hours.includes(hour)) continue;
      if ((e.cooldown[this.key(rule.id)] ?? -1) > day) continue;
      const r = core.social.rel(rule.npc);
      if (!r.met && !rule.strangers) continue;
      if (r.status === 'estranged') continue;
      const p = rule.when(core);
      if (!p || !core.rng.chance(rule.chance)) continue;
      rule.fire(core, p);
      e.cooldown[this.key(rule.id)] = day + rule.cooldown;
      e.count[this.key(rule.id)] = (e.count[this.key(rule.id)] ?? 0) + 1;
      sent++;
      e.count[sentKey] = sent;
    }
    delete e.count[`out:sent:${day - 1}`];
  }

  /** Replies to outreach messages ("out:<verb>:<npc>"). */
  act(verb: string, npc: string): { text: string; resolve?: boolean } {
    const core = this.core;
    switch (verb) {
      case 'treat': {
        const r = core.economy.pay(G(120), 'food', '请同事喝下午茶', 'cafe', ['cash', 'bank']);
        if (!r.ok) return { text: `付不了钱：${r.error}`, resolve: false };
        core.social.applyDirect(npc, { kind: 'generous_treat', facets: { generosity: 0.7, attention: 0.4 }, importance: 14 }, { source: 'witnessed' });
        core.player.adjustReputation('social', 1);
        return { text: '下午茶送到了办公室，大家都很开心。' };
      }
      case 'no':
        core.social.applyDelta(npc, { affection: -2 });
        return { text: `你婉拒了${name(npc)}。` };
    }
    return { text: '' };
  }
}
