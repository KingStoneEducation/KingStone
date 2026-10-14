import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { MINUTES_PER_DAY, fromDate, formatDateTime, hm, toDate } from '../core/calendar';
import type { PhoneMessage, ScheduledEvent } from '../core/state';
import { NPC_BY_ID } from '../data/npcs';
import { LOCATIONS } from '../data/locations';
import { TIER_INDEX } from '../casino/tables';
import { wealthClassOf } from './WealthSystem';

/** Birthdays (month 0-11, day 1-28). */
export const BIRTHDAYS: Record<string, [number, number]> = {
  daniel: [2, 20],
  tommy: [2, 27],
  ben: [3, 3],
  eileen: [3, 15],
  kiki: [4, 9],
  oldzhou: [5, 2],
  margaret: [6, 11],
  marco: [3, 22],
  isabella: [4, 18],
  natasha: [5, 21],
  grace: [6, 3],
  sophia: [7, 8],
  victor: [8, 14],
  lillian: [9, 1],
  alexander: [10, 12],
  raymond: [7, 25],
  jack: [8, 2],
};

export interface SocialEventDef {
  id: string;
  name: string;
  location: string;
  spot?: string;
  /** narrative shown on arrival */
  arrival: (core: GameCore, ev: ScheduledEvent) => string;
  /** choices offered when the player arrives */
  choices?: (core: GameCore, ev: ScheduledEvent) => { id: string; label: string; hint?: string }[];
  attend: (core: GameCore, ev: ScheduledEvent, choice?: string) => string;
  miss: (core: GameCore, ev: ScheduledEvent) => void;
  /** once the event's time is over, if the player came */
  after?: (core: GameCore, ev: ScheduledEvent) => void;
  guests?: (ev: ScheduledEvent) => string[];
}

export interface EventPrompt {
  eventId: string;
  title: string;
  text: string;
  choices: { id: string; label: string; hint?: string }[];
}

interface DailyEventDef {
  id: string;
  cooldownDays: number;
  max?: number;
  /** returns a payload when the event can fire now */
  check: (core: GameCore) => Record<string, string | number | boolean> | null;
  chance: (core: GameCore, p: Record<string, string | number | boolean>) => number;
  fire: (core: GameCore, p: Record<string, string | number | boolean>) => void;
}

const npcName = (id: string) => NPC_BY_ID[id]?.name ?? id;

// ---------------------------------------------------------------- social events (invitations)

export const SOCIAL_EVENTS: Record<string, SocialEventDef> = {
  casino_night: {
    id: 'casino_night',
    name: '赌场之夜',
    location: 'casino',
    arrival: (core, ev) => core.companions.arrival(ev),
    choices: (core, ev) => [
      { id: 'together', label: ev.data.mode === 'watch' ? '「走吧，进去转转。」' : '「跟我来，坐一桌。」' },
      { id: 'drink', label: '先去酒吧喝一杯（约 30 G）' },
    ],
    attend: (core, ev, choice) => {
      const id = String(ev.npc);
      if (choice === 'drink') {
        const r = core.economy.pay(G(30), 'drinks', '赌场酒吧：两杯酒', 'casino_bar', ['cash', 'bank']);
        if (r.ok) {
          core.social.applyDirect(id, { kind: 'treated_me', facets: { generosity: 0.4, attention: 0.4 }, importance: 10, data: { what: '喝酒' } }, { source: 'witnessed' });
          core.player.change('mood', 3);
          core.advance(30, 'talking');
          return `你们在幸运七酒吧喝了一杯，聊了会儿天。`;
        }
        return '你摸了摸口袋，还是算了。';
      }
      return ev.data.mode === 'watch' ? `${npcName(id)}跟在你身后。` : `${npcName(id)}会坐到你所在的赌桌（21 点、百家乐或轮盘）；你不在桌上时，TA 去自己喜欢的那张桌子。`;
    },
    miss: (core, ev) => {
      core.social.applyDirect(String(ev.npc), { kind: 'missed_party', facets: { unreliability: 0.6 }, importance: 22, data: { event: '赌场之约' } });
    },
    after: (core, ev) => core.companions.after(ev),
  },
  date: {
    id: 'date',
    name: '约会',
    // the venue is on each scheduled date
    location: 'venue',
    arrival: (core, ev) => core.romance.arrival(ev),
    choices: () => [
      { id: 'listen', label: '认真听 TA 说话' },
      { id: 'share', label: '聊聊你自己' },
      { id: 'joke', label: '逗 TA 开心' },
    ],
    attend: (core, ev, choice) => core.romance.attend(ev, choice),
    miss: (core, ev) => core.romance.miss(ev),
  },
  gala: {
    id: 'gala',
    name: '慈善晚宴',
    location: 'club',
    spot: 'club_lounge1',
    guests: (ev) => [String(ev.npc), ...String(ev.data.others ?? '').split(',').filter(Boolean)],
    arrival: (core, ev) => `子午线会所的大厅点满了蜡烛，弦乐四重奏在角落里演奏。${npcName(String(ev.npc))}站在拍卖台边和客人寒暄，每张桌上都放着认捐卡。`,
    choices: () => [
      { id: 'donate_big', label: '认捐 50,000 G', hint: '整个晚上都会有人记得你' },
      { id: 'donate', label: '认捐 10,000 G' },
      { id: 'mingle', label: '不认捐，只是交际' },
    ],
    attend: (core, ev, choice) => {
      const host = String(ev.npc);
      const guests = SOCIAL_EVENTS.gala.guests!(ev);
      core.advance(150, 'talking');
      core.player.change('hunger', -35);
      let amount = choice === 'donate_big' ? G(50000) : choice === 'donate' ? G(10000) : 0;
      let note = '';
      if (amount > 0) {
        const r = core.economy.pay(amount, 'donation', '港区儿童医院慈善晚宴认捐', 'charity', ['bank', 'cash']);
        if (!r.ok) {
          note = '认捐卡填好了，转账却没能成功。你只好把卡片悄悄收了回来。';
          amount = 0;
        }
      }
      const dressed = (core.inventory.currentOutfit().prestige ?? 1) >= 3;
      for (const g of guests) {
        core.social.applyDirect(g, { kind: 'attended_party', facets: { attention: 0.5, ...(dressed ? { sophistication: 0.4 } : { vulgarity: 0.5 }) }, importance: 12, data: { event: '慈善晚宴' } }, { silent: true });
        if (amount > 0) core.social.applyDirect(g, { kind: 'donated', facets: { generosity: amount >= G(50000) ? 1 : 0.6, kindness: 0.4, wealthDisplay: amount >= G(50000) ? 0.5 : 0.2 }, importance: amount >= G(50000) ? 34 : 22, data: { amount } }, { source: 'witnessed', silent: true });
      }
      core.player.adjustReputation('social', amount >= G(50000) ? 8 : amount > 0 ? 4 : 1);
      if (amount > 0) {
        core.state.player.flags.clubGuestUntil = Math.max(Number(core.state.player.flags.clubGuestUntil ?? -1), core.today() + 14);
        return `你认捐了 ${formatG(amount)}。主持人念到你的名字时，大厅里响起掌声，${npcName(host)}隔着人群向你举杯。（获得两周的会所宾客资格）`;
      }
      return note || `你端着香槟在人群里转了一圈，认识了几位新面孔。${npcName(host)}对你点了点头。`;
    },
    miss: (core, ev) => {
      core.social.applyDirect(String(ev.npc), { kind: 'missed_party', facets: { unreliability: 0.6, rudeness: 0.4 }, importance: 24, data: { event: '慈善晚宴' } });
    },
  },
  birthday: {
    id: 'birthday',
    name: '生日聚会',
    location: 'bar',
    spot: 'bar_table1',
    guests: (ev) => {
      const host = String(ev.npc);
      return [host, ...(NPC_BY_ID[host]?.circle ?? []).slice(0, 3)];
    },
    arrival: (core, ev) => `${npcName(String(ev.npc))}的生日聚会已经开始了。桌上摆着蛋糕，几个朋友正在起哄让寿星许愿。${core.inventory.giftables().length ? '你可以把带来的礼物送给寿星（和他/她交谈）。' : ''}`,
    choices: () => [
      { id: 'cheer', label: '和大家一起庆祝', hint: '花点时间，融入他们' },
      { id: 'buy_round', label: '给全桌点一轮酒（约 60 G）', hint: '慷慨，但别显得在炫耀' },
      { id: 'brief', label: '打个招呼就走', hint: '至少来了' },
    ],
    attend: (core, ev, choice) => {
      const host = String(ev.npc);
      core.social.applyDirect(host, { kind: 'attended_party', facets: { attention: 1, kindness: 0.6, support: 0.3 }, importance: 32, data: { event: '生日聚会' } });
      core.player.change('social', 30);
      core.player.change('stress', -8);
      if (choice === 'buy_round') {
        const r = core.economy.pay(G(60), 'drinks', '生日聚会请全桌喝酒', 'bar');
        if (r.ok) {
          core.social.witness({ kind: 'generous_treat', facets: { generosity: 0.6, wealthDisplay: 0.15 }, importance: 18, data: { what: '喝酒' } });
          core.advance(150, 'talking');
          return '你请全桌喝了一轮。大家举杯为寿星欢呼，气氛热烈。';
        }
        core.advance(120, 'talking');
        return '你想请客，却发现钱不够……你尴尬地笑了笑，好在没人注意到。';
      }
      if (choice === 'brief') {
        core.advance(30, 'talking');
        core.social.applyDirect(host, { kind: 'chat', facets: { attention: 0.3 }, importance: 5 }, { silent: true });
        return '你祝了生日快乐，喝了一杯就先走了。';
      }
      for (const g of SOCIAL_EVENTS.birthday.guests!(ev).slice(1)) core.social.applyDirect(g, { kind: 'attended_party', facets: { attention: 0.5, charm: 0.3 }, importance: 10, data: { event: `${npcName(host)}的生日` } }, { silent: true });
      core.advance(150, 'talking');
      core.player.addMoodBuff('party', 8, 60 * 10, '朋友的生日聚会');
      return `你们聊到很晚。${npcName(host)}搂着你的肩膀说：「谢谢你能来。」`;
    },
    miss: (core, ev) => {
      core.social.applyDirect(String(ev.npc), { kind: 'missed_party', facets: { unreliability: 0.9, neglect: 0.8 }, importance: 34, data: { event: '生日聚会' } });
    },
  },
  group_dinner: {
    id: 'group_dinner',
    name: '朋友聚餐',
    location: 'restaurant',
    spot: 'rest_table2',
    guests: (ev) => [String(ev.npc), ...String(ev.data.others ?? '').split(',').filter(Boolean)],
    arrival: (core, ev) => {
      const total = Number(ev.data.bill ?? G(180));
      return `${npcName(String(ev.npc))}和朋友们已经点好了菜。吃到最后，服务员把 ${formatG(total)} 的账单放在了桌上——大家的目光不约而同地看向了你。`;
    },
    choices: (core, ev) => [
      { id: 'pay_all', label: `全部买单（${formatG(Number(ev.data.bill ?? G(180)))}）`, hint: '大方，但大家会记住你「有钱」' },
      { id: 'split', label: 'AA 制，各付各的', hint: `你的那份约 ${formatG(Math.round(Number(ev.data.bill ?? G(180)) / 4))}` },
      { id: 'excuse', label: '借口去洗手间，提前溜走' },
    ],
    attend: (core, ev, choice) => {
      const bill = Number(ev.data.bill ?? G(180));
      const guests = SOCIAL_EVENTS.group_dinner.guests!(ev);
      core.advance(100, 'talking');
      core.player.change('hunger', -60);
      core.player.change('social', 25);
      if (choice === 'pay_all') {
        const r = core.economy.pay(bill, 'food', '朋友聚餐买单', 'restaurant');
        if (r.ok) {
          for (const g of guests) core.social.applyDirect(g, { kind: 'treated_me', facets: { generosity: 0.7, wealthDisplay: 0.3 }, importance: 20, data: { what: '吃饭' } }, { silent: true });
          return '你爽快地买了单。大家纷纷道谢，有人开玩笑说下次还要你请。';
        }
        for (const g of guests) core.social.applyDirect(g, { kind: 'chat', facets: { stinginess: 0.2 }, importance: 8 }, { silent: true });
        return '你掏出卡……余额不足。场面有点尴尬，最后还是 AA 了。';
      }
      if (choice === 'split') {
        const share = Math.round(bill / 4 / 100) * 100;
        core.economy.pay(share, 'food', '朋友聚餐 AA', 'restaurant');
        for (const g of guests) {
          const t = NPC_BY_ID[g]?.traits;
          core.social.applyDirect(g, { kind: 'chat', facets: t && t.opportunism > 0.5 ? { stinginess: 0.35, attention: 0.4 } : { attention: 0.5, honesty: 0.1 }, importance: 8 }, { silent: true });
        }
        return '你提议 AA，大家各付了自己的那份。有人小声嘀咕了一句「发财了还这么抠」。';
      }
      for (const g of guests) core.social.applyDirect(g, { kind: 'rude', facets: { stinginess: 0.8, deceit: 0.3 }, importance: 22 }, { silent: true });
      return '你借口去洗手间，然后从后门溜走了。手机很快震了一下……';
    },
    miss: (core, ev) => {
      core.social.applyDirect(String(ev.npc), { kind: 'missed_party', facets: { unreliability: 0.6, neglect: 0.4 }, importance: 20, data: { event: '聚餐' } });
    },
  },
  private_dinner: {
    id: 'private_dinner',
    name: '私人晚宴',
    location: 'fine_dining',
    spot: 'fd_table1',
    guests: (ev) => [String(ev.npc), ...String(ev.data.others ?? '').split(',').filter(Boolean)],
    arrival: (core, ev) => `Lumière 的包间里烛光摇曳。${npcName(String(ev.npc))}向你介绍了在座的客人。侍酒师正在为每个人斟酒。`,
    choices: () => [
      { id: 'listen', label: '多听少说，注意礼仪', hint: '稳妥' },
      { id: 'talk_business', label: '谈谈你的事业和计划' },
      { id: 'talk_casino', label: '聊起你在赌场的辉煌战绩' },
    ],
    attend: (core, ev, choice) => {
      const host = String(ev.npc);
      const guests = SOCIAL_EVENTS.private_dinner.guests!(ev);
      core.advance(150, 'talking');
      core.player.change('hunger', -75);
      const prestige = core.inventory.currentOutfit().prestige ?? 1;
      const dressPenalty = prestige < 3 ? { vulgarity: 0.6 } : { sophistication: 0.4 };
      for (const g of guests) core.social.applyDirect(g, { kind: 'attended_party', facets: { attention: 0.6, ...dressPenalty }, importance: 14, data: { event: '私人晚宴' } }, { silent: true });
      if (choice === 'talk_casino') {
        for (const g of guests) core.social.applyDirect(g, { kind: 'vulgar', facets: { vulgarity: 0.8, gambling: 0.5, wealthDisplay: 0.4 }, importance: 18 }, { silent: true });
        return '你讲起自己在 21 点桌上的大胜，有人礼貌地笑了笑。席间短暂地安静了一下。';
      }
      if (choice === 'talk_business') {
        const career = core.career.activeJobs()[0];
        const solid = career && (career.jobId === 'analyst' || career.level >= 2);
        for (const g of guests) core.social.applyDirect(g, { kind: 'chat', facets: solid ? { success: 0.4, sophistication: 0.3 } : { charm: 0.2 }, importance: 10 }, { silent: true });
        return solid ? '你谈到自己的职业规划，几位客人显得很感兴趣，有人留下了名片。' : '你努力介绍自己的工作，大家听得很客气。';
      }
      for (const g of guests) core.social.applyDirect(g, { kind: 'sophisticated', facets: { sophistication: 0.7 }, importance: 16 }, { silent: true });
      core.player.addSkill('social', 1.5, 80);
      core.state.player.flags.clubGuestUntil = core.today() + 14;
      return `晚宴结束时，${npcName(host)}低声说：「你今晚表现得很好。下次来子午线会所，报我的名字。」（获得两周的会所宾客资格）`;
    },
    miss: (core, ev) => {
      core.social.applyDirect(String(ev.npc), { kind: 'missed_party', facets: { unreliability: 0.7, rudeness: 0.5 }, importance: 30, data: { event: '私人晚宴' } });
    },
  },
  chess: {
    id: 'chess',
    name: '公园下棋',
    location: 'city',
    spot: 'park_chess',
    arrival: () => '周伯已经摆好了棋盘，正慢悠悠地喝着茶。',
    choices: () => [
      { id: 'play', label: '认真下一盘' },
      { id: 'talk', label: '边下边聊聊心事' },
    ],
    attend: (core, ev, choice) => {
      core.advance(90, 'talking');
      core.player.change('stress', -12);
      core.player.change('impulsivity', -8);
      if (choice === 'talk') {
        core.social.applyDirect('oldzhou', { kind: 'deep_talk', facets: { intimacy: 0.8, honesty: 0.3 }, importance: 24 });
        return '你们聊了很多。周伯说起他年轻时的事：「那时候我总觉得下一把就能翻身。」';
      }
      core.social.applyDirect('oldzhou', { kind: 'chat', facets: { attention: 0.8, charm: 0.3 }, importance: 12 });
      return core.rng.chance(0.3) ? '你竟然赢了一盘！周伯哈哈大笑：「不错，有长进。」' : '周伯又赢了。「你太急了，」他说，「好棋是等出来的。」';
    },
    miss: (core) => {
      core.social.applyDirect('oldzhou', { kind: 'missed_party', facets: { unreliability: 0.4 }, importance: 12, data: { event: '下棋' } });
    },
  },
  gig: {
    id: 'gig',
    name: '汤米的驻唱夜',
    location: 'bar',
    spot: 'bar_table2',
    arrival: () => '汤米抱着吉他坐在酒吧的小舞台上，台下坐了二十几个人。',
    choices: () => [
      { id: 'listen', label: '找个位置好好听' },
      { id: 'tip', label: '往他的琴盒里放 20 G' },
    ],
    attend: (core, ev, choice) => {
      core.advance(100, 'talking');
      core.player.change('stress', -10);
      core.player.change('social', 20);
      if (choice === 'tip' && core.economy.pay(G(20), 'entertainment', '给汤米的打赏', 'tommy').ok) {
        core.social.applyDirect('tommy', { kind: 'gift', facets: { generosity: 0.5, support: 0.4 }, importance: 18, data: { item: '打赏' } });
        return '汤米冲你眨了眨眼，唱下一首之前说：「这首献给我的朋友。」';
      }
      core.social.applyDirect('tommy', { kind: 'attended_party', facets: { attention: 0.8, support: 0.4 }, importance: 18, data: { event: '驻唱夜' } });
      return '演出结束后，汤米跑过来问你觉得怎么样，看得出他很紧张。';
    },
    miss: (core) => {
      core.social.applyDirect('tommy', { kind: 'missed_party', facets: { unreliability: 0.5 }, importance: 14, data: { event: '驻唱夜' } });
    },
  },
  basketball: {
    id: 'basketball',
    name: '周末打球',
    location: 'city',
    spot: 'court',
    arrival: () => '丹尼尔在球场上运着球：「你可算来了！三分球定输赢？」',
    choices: () => [
      { id: 'play', label: '打一场（消耗体力）' },
      { id: 'chat', label: '坐在场边聊天' },
    ],
    attend: (core, ev, choice) => {
      if (choice === 'play') {
        core.advance(80, 'exercising');
        core.player.addSkill('fitness', 1.5, 80);
        core.social.applyDirect('daniel', { kind: 'chat', facets: { attention: 1, charm: 0.4 }, importance: 16 });
        return '你们打得满头大汗。丹尼尔喘着气说：「就像高中那时候一样。」';
      }
      core.advance(50, 'talking');
      core.social.applyDirect('daniel', { kind: 'deep_talk', facets: { intimacy: 0.7 }, importance: 18 });
      return '你们坐在场边，聊起了以前的事，还有各自的打算。';
    },
    miss: (core) => {
      core.social.applyDirect('daniel', { kind: 'missed_party', facets: { unreliability: 0.5, neglect: 0.4 }, importance: 16, data: { event: '打球' } });
    },
  },
};

// ---------------------------------------------------------------- daily world events

export function inviteMessage(core: GameCore, def: string, npc: string, at: number, durationMin: number, body: string, data: Record<string, string | number | boolean> = {}, others: string[] = []): void {
  const sd = SOCIAL_EVENTS[def];
  const ev: ScheduledEvent = {
    id: `ev${++core.state.events.seq}`,
    def,
    at,
    until: at + durationMin,
    location: sd.location,
    npc,
    data: { ...data, others: others.join(',') },
    status: 'invited',
  };
  core.state.events.scheduled.push(ev);
  core.phone.send(npc, npcName(npc), `${body}\n地点：${LOCATIONS[sd.location]?.name ?? sd.location} · ${formatDateTime(at)}`, [
    { id: `accept:${ev.id}`, label: '我会去的' },
    { id: `decline:${ev.id}`, label: '抱歉，去不了' },
  ], ev.id);
}

const DAILY: DailyEventDef[] = [
  {
    id: 'birthday_invite',
    cooldownDays: 0,
    check: (core) => {
      const d = toDate(core.now());
      for (const [npc, [m, day]] of Object.entries(BIRTHDAYS)) {
        const target = fromDate(d.year, m, day, 0, 0);
        const daysUntil = Math.floor((target - core.now()) / MINUTES_PER_DAY);
        if (daysUntil < 2 || daysUntil > 5) continue;
        if (core.state.events.count[`bday:${npc}:${d.year}`]) continue;
        const r = core.social.rel(npc);
        if (!r.met || r.affection < 22 || r.status === 'estranged') continue;
        return { npc, at: target + hm(20), year: d.year };
      }
      return null;
    },
    chance: () => 1,
    fire: (core, p) => {
      const npc = String(p.npc);
      core.state.events.count[`bday:${npc}:${p.year}`] = 1;
      const lines: Record<string, string> = {
        daniel: '嘿！周五是我生日，晚上八点在 Rusty Anchor，就几个老朋友。你一定要来啊，不来我跟你急。',
        tommy: '我生日那天晚上在酒吧有个小派对，你来的话我请你喝特调！',
        eileen: '我生日那天想和几个朋友简单聚聚，在 Rusty Anchor。你有空吗？',
      };
      const others = (NPC_BY_ID[npc]?.circle ?? []).slice(0, 3);
      for (const o of [npc, ...others]) core.npcs.setOverrideAt(o, Number(p.at), 210, 'bar', o === npc ? 'bar_table1' : null, 'party', '生日聚会');
      inviteMessage(core, 'birthday', npc, Number(p.at), 210, lines[npc] ?? `我生日那天在 Rusty Anchor 办个小聚会，你要来吗？`, {}, others);
    },
  },
  {
    id: 'rent_reminder',
    cooldownDays: 0,
    check: (core) => {
      const day = core.today();
      const bill = core.economy.unpaidBills().find((b) => b.kind === 'rent' && b.dueDay - day === 1 && b.payee === 'margaret');
      if (!bill || core.phone.hasRef(`rentrem:${bill.id}`)) return null;
      return { bill: bill.id, amount: bill.amount };
    },
    chance: () => 1,
    fire: (core, p) => {
      const autopay = core.state.economy.autopay && core.economy.balance('bank') >= Number(p.amount);
      core.phone.send('margaret', '房东玛格丽特', autopay ? `提醒一下，明天是交房租的日子（${formatG(Number(p.amount))}）。你设了自动扣款的话就不用管了。` : `明天是交房租的最后期限，${formatG(Number(p.amount))}。别让我追着你要。`, undefined, `rentrem:${p.bill}`);
    },
  },
  {
    id: 'rent_escalation',
    cooldownDays: 0,
    check: (core) => {
      const day = core.today();
      const bill = core.economy.overdueBills().find((b) => b.kind === 'rent');
      if (!bill) return null;
      const late = day - bill.dueDay;
      const stage = late >= 18 ? 3 : late >= 10 ? 2 : late >= 3 ? 1 : late >= 1 ? 0 : -1;
      if (stage < 0 || core.phone.hasRef(`rentlate:${bill.id}:${stage}`)) return null;
      return { bill: bill.id, stage, late };
    },
    chance: () => 1,
    fire: (core, p) => {
      const stage = Number(p.stage);
      const isMaggie = core.housing.current().id === 'home_basic';
      const from = isMaggie ? 'margaret' : 'landlord';
      const name = isMaggie ? '房东玛格丽特' : '物业公司';
      const lines = [
        '房租已经逾期了，已经加收了滞纳金。请尽快付清。',
        '这已经是第二次提醒了。我也有房贷要还，请你理解。',
        '如果下周之前还不付清房租，我只能按合同走法律程序了。',
        '这是正式通知：七天内付清全部欠租，否则请搬离公寓。',
      ];
      core.phone.send(from, name, lines[stage], [{ id: 'open:bills', label: '查看账单' }], `rentlate:${p.bill}:${stage}`);
      if (isMaggie) core.social.applyDirect('margaret', { kind: 'rent_late', facets: { unreliability: 0.35 + stage * 0.15 }, importance: 16 + stage * 6 }, { source: 'witnessed', silent: true });
    },
  },
  {
    id: 'landlord_rent_raise',
    cooldownDays: 120,
    check: (core) => {
      const h = core.state.housing;
      if (h.tenure !== 'rent' || h.pendingRent || core.today() - h.leaseStartDay < 25) return null;
      if (toDate(core.now()).day < 10 || toDate(core.now()).day > 20) return null;
      return { pct: core.rng.int(4, 9) };
    },
    chance: () => 0.06,
    fire: (core, p) => {
      const newRent = core.housing.scheduleRentIncrease(Number(p.pct));
      const isMaggie = core.housing.current().id === 'home_basic';
      core.phone.send(isMaggie ? 'margaret' : 'landlord', isMaggie ? '房东玛格丽特' : '物业公司', `通知：由于房产税和维修成本上涨，从下个月起房租调整为 ${formatG(newRent)}（上涨 ${p.pct}%）。`);
      core.journal.add('money', `房东通知下个月房租上涨到 ${formatG(newRent)}。`, true);
    },
  },
  {
    id: 'weekend_highroller',
    cooldownDays: 6,
    check: (core) => (toDate(core.now()).weekday === 4 ? {} : null),
    chance: () => 0.55,
    fire: (core) => {
      core.state.events.cooldown['active:weekend_highroller'] = core.now() + 2 * MINUTES_PER_DAY;
      const tier = TIER_INDEX[core.state.casino.membership.tier];
      if (tier >= 2) {
        core.state.casino.invites.highLimit = Math.max(core.state.casino.invites.highLimit, core.today() + 2);
        core.phone.send('victor', '维克多（灰港大赌场）', '本周末高额投注区举办贵宾之夜，届时我为您保留了高额区的位置。期待您的光临。');
      } else {
        core.phone.send('casino', '灰港大赌场', '【周末贵宾之夜】本周五、周六晚，大厅加开赌桌，现场乐队演出。理性娱乐，量力而行。');
      }
    },
  },
  {
    id: 'vip_offer',
    cooldownDays: 21,
    check: (core) => {
      const m = core.state.casino.membership;
      if (TIER_INDEX[m.tier] < 1 || core.casino.recentHours(14) < 3) return null;
      return {};
    },
    chance: () => 0.35,
    fire: (core) => {
      const m = core.state.casino.membership;
      const comps = Math.max(G(50), Math.round(m.lifetimeTheo * 0.05));
      core.state.casino.comps += comps;
      core.phone.send('victor', '维克多（灰港大赌场）', `感谢您一直以来的支持。我已为您的会员账户增加了 ${formatG(comps)} 的餐饮积分，可在幸运七酒吧使用。如需安排，随时联系我。`);
      core.social.applyDirect('victor', { kind: 'chat', facets: { attention: 0.3 }, importance: 6 }, { silent: true });
    },
  },
  {
    id: 'friend_reconnect',
    cooldownDays: 30,
    check: (core) => {
      for (const id of ['kiki', 'tommy', 'marco', 'isabella']) {
        const r = core.social.rel(id);
        const b = core.social.belief(id);
        const est = b.wealth?.estimate ?? 0;
        const sinceContact = r.lastContact < 0 ? 99 : (core.now() - r.lastContact) / MINUTES_PER_DAY;
        if (r.met && sinceContact > 8 && est > G(80000) && NPC_BY_ID[id].traits.opportunism > 0.35) return { npc: id };
      }
      return null;
    },
    chance: () => 0.4,
    fire: (core, p) => {
      const id = String(p.npc);
      const lines: Record<string, string> = {
        kiki: '好久不见！听说你最近混得超好？周末要不要一起去 Thread & Needle 逛逛~我请你喝奶茶！',
        tommy: '嘿！好久没见你来酒吧了。听说你现在是大人物了？哈哈，有空来坐坐。',
        marco: '老朋友！最近怎么样？我这有一辆刚到的跑车，第一个就想到你了。',
        isabella: '亲爱的，新一季的高级成衣到了，我特意给你留了几件，有空来看看？',
      };
      core.phone.send(id, npcName(id), lines[id] ?? '好久不见，最近怎么样？');
      core.social.applyDirect(id, { kind: 'chat', facets: { attention: 0.2 }, importance: 4 }, { source: 'told', silent: true });
    },
  },
  {
    id: 'friend_asks_loan',
    cooldownDays: 20,
    check: (core) => {
      for (const id of ['tommy', 'kiki', 'daniel']) {
        const r = core.social.rel(id);
        const rt = core.state.npcs[id];
        const est = core.social.wealthEstimate(id) ?? 0;
        const needy = rt.money < G(400) || rt.flags.lastShock === core.today() - 1;
        if (r.met && r.affection > 15 && (est > G(60000) || needy) && !core.state.economy.receivables.some((x) => x.npc === id && x.status === 'open')) return { npc: id, needy };
      }
      return null;
    },
    chance: (core, p) => (p.needy ? 0.5 : 0.25),
    fire: (core, p) => {
      const id = String(p.npc);
      const rt = core.state.npcs[id];
      const amount = G(Math.max(3, Math.round((Number(rt.flags.lastShockAmount ?? 0) / 100 || core.rng.range(300, 1200)) / 100)) * 100);
      const lines: Record<string, string> = {
        daniel: `这事我真不好意思开口……我妈的医药费超出预算了，能先借我 ${formatG(amount)} 吗？月底一定还你。`,
        tommy: `兄弟，我看中了一把二手吉他，就差 ${formatG(amount)}……你能先借我吗？我演出拿到钱就还！`,
        kiki: `亲爱的~ 信用卡这个月有点爆了，能借我 ${formatG(amount)} 周转一下吗？发工资就还你！`,
      };
      core.phone.send(id, npcName(id), lines[id] ?? `能借我 ${formatG(amount)} 吗？`, [
        { id: `lend:${id}:${amount}:21`, label: `借给对方 ${formatG(amount)}` },
        { id: `refuse:${id}`, label: '委婉拒绝' },
      ]);
    },
  },
  {
    id: 'group_dinner_invite',
    cooldownDays: 16,
    check: (core) => {
      const est = core.social.wealthEstimate('daniel') ?? 0;
      const r = core.social.rel('daniel');
      if (!r.met || r.affection < 20) return null;
      const d = toDate(core.now());
      if (d.weekday !== 2) return null;
      return { rich: est > G(60000) };
    },
    chance: (core, p) => (p.rich ? 0.6 : 0.2),
    fire: (core, p) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 19) + 2 * MINUTES_PER_DAY;
      const bill = p.rich ? G(260) : G(150);
      core.npcs.setOverrideAt('daniel', at, 150, 'restaurant', 'rest_table2', 'eat', '聚餐');
      core.npcs.setOverrideAt('tommy', at, 150, 'restaurant', 'rest_table1', 'eat', '聚餐');
      inviteMessage(core, 'group_dinner', 'daniel', at, 150, p.rich ? '周五晚上老地方聚一下？Marlow\'s，汤米也来。听说你最近发达了，哈哈，今晚就看你的了！' : '周五晚上要不要去 Marlow\'s 吃饭？汤米也来。', { bill }, ['tommy']);
    },
  },
  {
    id: 'rich_dinner_invite',
    cooldownDays: 30,
    check: (core) => {
      for (const id of ['lillian', 'alexander']) {
        const r = core.social.rel(id);
        if (!r.met) continue;
        const est = core.social.wealthEstimate(id) ?? 0;
        const disp = core.social.disposition(id);
        if (est > G(350000) && disp > (id === 'alexander' ? 25 : 10)) return { npc: id };
      }
      return null;
    },
    chance: () => 0.45,
    fire: (core, p) => {
      const id = String(p.npc);
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 19, 30) + 3 * MINUTES_PER_DAY;
      const others = id === 'lillian' ? ['alexander', 'sophia'] : ['lillian', 'sophia'];
      for (const o of [id, ...others]) core.npcs.setOverrideAt(o, at, 160, 'fine_dining', o === id ? 'fd_table1' : null, 'eat', '私人晚宴');
      inviteMessage(core, 'private_dinner', id, at, 160, id === 'lillian' ? '亲爱的，周末我在 Lumière 有个小小的私人晚宴，都是些有意思的朋友。你一定要来。着装：正装。' : '下周我在 Lumière 安排了一次晚宴，几位朋友想认识你。请着正装。', {}, others);
    },
  },
  {
    id: 'chess_invite',
    cooldownDays: 9,
    check: (core) => {
      const r = core.social.rel('oldzhou');
      return r.met && r.familiarity >= 12 && r.affection >= 8 ? {} : null;
    },
    chance: () => 0.35,
    fire: (core) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 9) + MINUTES_PER_DAY;
      inviteMessage(core, 'chess', 'oldzhou', at, 150, '年轻人，明早九点公园老地方，来杀一盘？（周伯让艾琳帮他发的短信）');
    },
  },
  {
    id: 'gig_invite',
    cooldownDays: 12,
    check: (core) => {
      const r = core.social.rel('tommy');
      const d = toDate(core.now());
      return r.met && r.affection >= 10 && d.weekday === 3 ? {} : null;
    },
    chance: () => 0.5,
    fire: (core) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 21) + MINUTES_PER_DAY;
      inviteMessage(core, 'gig', 'tommy', at, 120, '明晚九点我在 Rusty Anchor 唱几首原创！来捧个场呗~');
    },
  },
  {
    id: 'basketball_invite',
    cooldownDays: 7,
    check: (core) => {
      const r = core.social.rel('daniel');
      const d = toDate(core.now());
      return r.met && r.affection >= 15 && d.weekday === 5 ? {} : null;
    },
    chance: () => 0.45,
    fire: (core) => {
      const d = toDate(core.now());
      const at = fromDate(d.year, d.month, d.day, 13) + MINUTES_PER_DAY;
      inviteMessage(core, 'basketball', 'daniel', at, 150, '明天下午一点球场见？好久没虐你了。');
    },
  },
  {
    id: 'friend_worried',
    cooldownDays: 14,
    check: (core) => {
      for (const id of ['eileen', 'daniel', 'oldzhou']) {
        const r = core.social.rel(id);
        if (!r.met || r.affection < 20) continue;
        const m = core.social.recall(id, ['big_loss', 'big_win', 'evicted', 'loan_default'], 7);
        if (m && !m.discussed) return { npc: id, kind: m.kind, mem: m.id };
      }
      return null;
    },
    chance: () => 0.55,
    fire: (core, p) => {
      const id = String(p.npc);
      const kind = String(p.kind);
      const mem = core.state.social.memories.find((m) => m.id === Number(p.mem));
      if (mem) mem.discussed = true;
      const via = mem?.source === 'rumor' && mem.via ? `我听${npcName(mem.via)}说` : '我听说';
      const lines: Record<string, Record<string, string>> = {
        eileen: {
          big_win: `${via}你在赌场赢了一大笔……我知道这不关我的事，但我爸当年也是从「赢了一大笔」开始的。照顾好自己。`,
          big_loss: `${via}你在赌场输了不少。你还好吗？要不要出来喝杯咖啡，不聊赌场，就聊聊天。`,
          evicted: '我听说你搬家了……是因为房租的事吗？如果需要帮忙，告诉我。',
          loan_default: '我听说你有些钱的麻烦。别一个人扛着。',
        },
        daniel: {
          big_win: `${via}你在赌场大赢了？行啊你！不过，别上头，见好就收。`,
          big_loss: `喂，${via}你在赌场输惨了？你到底在搞什么？出来，我们得谈谈。`,
          evicted: '你被赶出来了？！为什么不早跟我说？我家沙发随时给你睡。',
          loan_default: '你欠钱的事我听说了。说吧，到底欠了多少？',
        },
        oldzhou: {
          big_win: '孩子，我听说了。赢钱的时候，是最该回头的时候。',
          big_loss: '我知道那种感觉。来公园坐坐吧，陪老头子下盘棋。',
          evicted: '人这一辈子，谁没搬过几次家。来我这吃顿饭吧。',
          loan_default: '欠债要还，但人也要活。别做傻事。',
        },
      };
      const text = lines[id]?.[kind];
      if (!text) return;
      core.phone.send(id, npcName(id), text);
      core.social.applyDirect(id, { kind: 'chat', facets: { attention: 0.1 }, importance: 4 }, { source: 'told', silent: true, noMemory: true });
    },
  },
  {
    id: 'crisis_support',
    cooldownDays: 10,
    check: (core) => {
      const net = core.economy.netWorth();
      const crisis = net < 0 || core.housing.rentOverdue() || core.economy.balance('cash') + core.economy.balance('bank') < G(100);
      if (!crisis) return null;
      // who knows and cares?
      for (const id of ['ben', 'eileen', 'daniel', 'oldzhou', 'grace']) {
        const r = core.social.rel(id);
        const b = core.social.belief(id);
        const t = NPC_BY_ID[id].traits;
        const knowsTrouble = b.knowsDebt || (b.wealth && b.wealth.estimate < G(5000));
        if (r.met && knowsTrouble && r.affection * t.empathy * (0.5 + t.loyalty) > 12) return { npc: id };
      }
      return null;
    },
    chance: () => 0.6,
    fire: (core, p) => {
      const id = String(p.npc);
      const helped = core.social.recall(id, ['helped', 'treated_me', 'gift', 'lent_money']);
      const lines: Record<string, string> = {
        ben: '最近要是手头紧，晚上来店里吃饭吧，记账就行。别不好意思。',
        eileen: helped ? '你以前帮过我，现在轮到我了。我能借你 300 G，不急着还。' : '我能借你 300 G，不急着还。别跟我客气。',
        daniel: '听着，我没多少钱，但我能借你 500 G 应急。还有，晚上来我家吃饭。',
        oldzhou: '我这老头子攒了点钱，借你 200 G 先应应急。记住，别拿去赌。',
        grace: '我看到你的账户状况了。下班前来柜台找我，我们可以谈谈债务重组和延期还款的方案。',
      };
      const amounts: Record<string, Money> = { eileen: G(300), daniel: G(500), oldzhou: G(200) };
      const amt = amounts[id];
      core.phone.send(id, npcName(id), lines[id], amt ? [{ id: `accept_help:${id}:${amt}`, label: `接受 ${formatG(amt)}` }, { id: `decline_help:${id}`, label: '谢谢，不用了' }] : undefined);
    },
  },
  {
    id: 'opportunist_drift',
    cooldownDays: 20,
    check: (core) => {
      const net = core.economy.netWorth();
      for (const id of ['kiki', 'lillian', 'isabella']) {
        const r = core.social.rel(id);
        const est = core.social.wealthEstimate(id) ?? 0;
        if (r.met && est < G(15000) && net < G(15000) && NPC_BY_ID[id].traits.opportunism > 0.5 && r.affection < 45) return { npc: id };
      }
      return null;
    },
    chance: () => 0.35,
    fire: (core, p) => {
      const id = String(p.npc);
      const lines: Record<string, string> = {
        kiki: '（你给琪琪发的消息显示「已读」，但她没有回复。）',
        lillian: '（莉莉安的助理回复：夫人最近日程很满，暂时无法安排见面。）',
        isabella: '（伊莎贝拉的回复只有一个字：「忙」。）',
      };
      core.phone.send(id, npcName(id), lines[id]);
      core.social.applyDelta(id, { affection: -6, familiarity: -3 });
      core.journal.add('social', `${npcName(id)}似乎在疏远你。`);
    },
  },
  {
    id: 'casino_credit_cut',
    cooldownDays: 30,
    check: (core) => {
      const cs = core.state.casino;
      const defaulted = core.state.economy.loans.some((l) => l.status === 'default');
      return (cs.creditLine > 0 || cs.comps > 0) && (defaulted || core.economy.netWorth() < 0) ? {} : null;
    },
    chance: () => 0.7,
    fire: (core) => {
      core.state.casino.creditLine = 0;
      core.state.casino.comps = Math.round(core.state.casino.comps / 2);
      core.phone.send('victor', '维克多（灰港大赌场）', '根据风控部门的复核，我们暂停了您账户的信用额度服务，部分餐饮积分也已调整。希望您理解，这是公司的统一政策。');
    },
  },
  {
    id: 'sophia_advice',
    cooldownDays: 25,
    check: (core) => {
      const r = core.social.rel('sophia');
      if (!r.met || r.respect < 5) return null;
      return core.economy.balance('bank') > G(30000) && core.market.portfolioValue() === 0 ? {} : null;
    },
    chance: () => 0.3,
    fire: (core) => {
      core.phone.send('sophia', '索菲亚', '上次聊过之后，我想到你：存款放在活期账户里，每年会被通胀吃掉一点点。可以考虑把一部分长期不用的钱放进低成本的指数基金——记得先留好应急金。银行 App 里就能操作。');
    },
  },
  {
    id: 'finance_job_offer',
    cooldownDays: 40,
    check: (core) => {
      const p = core.state.player;
      const r = core.social.rel('sophia');
      if (core.career.job('analyst') || !r.met || r.respect < 20) return null;
      return p.skills.finance >= 32 ? {} : null;
    },
    chance: () => 0.5,
    fire: (core) => {
      core.phone.send('sophia', '索菲亚', '北门资本正在招初级分析师。以你对理财的理解，我觉得你可以试试。面试要穿正装，信用记录也很重要。如果你决定申请，在手机的招聘 App 里投递就行，我会帮你说句话。');
      core.state.player.flags.sophiaReferral = core.today();
    },
  },
  {
    id: 'kiki_gossip',
    cooldownDays: 8,
    check: (core) => (core.social.rel('kiki').met && core.social.rel('kiki').affection > 5 ? {} : null),
    chance: () => 0.25,
    fire: (core) => {
      const gossip = [
        '听说维克多上周亲自送一个大客户回家，那人一晚上在 VIP 厅输了二十万！',
        '你知道吗，惠特莫尔家的少爷好像在找新的投资人……',
        '雷蒙德又去子午线会所门口转悠了，哈哈哈，他是真想进去啊。',
        '马可又跟人借钱了，这个月第三次了。',
        '伊莎贝拉说，看一个人有没有钱，先看鞋。我今天特意换了新鞋！',
      ];
      core.phone.send('kiki', '琪琪', core.rng.pick(gossip));
    },
  },
  {
    id: 'market_news',
    cooldownDays: 0,
    check: (core) => {
      const shock = core.state.events.marketShock;
      if (!shock) return null;
      core.state.events.marketShock = 0;
      return core.market.portfolioValue() > 0 ? { shock } : null;
    },
    chance: () => 1,
    fire: (core, p) => {
      const s = Number(p.shock);
      core.phone.send('broker', '灰港证券', s < 0 ? `【市场快讯】今日市场大幅下跌约 ${Math.round(-s * 100)}%，您的持仓出现浮亏。投资有风险，请根据自身情况决策。` : `【市场快讯】今日市场显著上涨约 ${Math.round(s * 100)}%。`);
      if (core.social.rel('sophia').met) {
        core.phone.send('sophia', '索菲亚', s < 0 ? '市场今天跌得很厉害，我知道你可能有点慌。记住：恐慌时卖出是最常见的错误。' : '今天行情不错。别因为一天的上涨就加大仓位。');
      }
    },
  },
];

/**
 * Generates conditional, rate-limited world events each day and runs
 * accepted invitations.
 */
export class EventManager {
  pendingPrompt: EventPrompt | null = null;

  constructor(private core: GameCore) {}

  private get e() {
    return this.core.state.events;
  }

  isActive(id: string): boolean {
    return (this.e.cooldown[`active:${id}`] ?? 0) > this.core.now();
  }

  marketShock(s: number): void {
    this.e.marketShock = s;
  }

  /** Run the daily event pass (called at 08:00 and 18:00). */
  dailyPass(slot: 'morning' | 'evening'): void {
    const day = this.core.today();
    for (const def of DAILY) {
      const isMorningOnly = ['birthday_invite', 'rent_reminder', 'rent_escalation', 'landlord_rent_raise', 'weekend_highroller', 'market_news'].includes(def.id);
      if (slot === 'evening' && isMorningOnly) continue;
      const cd = this.e.cooldown[def.id] ?? -1;
      if (cd > day) continue;
      if (def.max !== undefined && (this.e.count[def.id] ?? 0) >= def.max) continue;
      const p = def.check(this.core);
      if (!p) continue;
      if (!this.core.rng.chance(def.chance(this.core, p))) continue;
      def.fire(this.core, p);
      this.e.count[def.id] = (this.e.count[def.id] ?? 0) + 1;
      if (def.cooldownDays > 0) this.e.cooldown[def.id] = day + def.cooldownDays;
    }
    this.e.lastDailyCheck = day;
  }

  /** Attendance and expiry of accepted invitations, called every minute. */
  tickMinute(now: number): void {
    for (const ev of this.e.scheduled) {
      if (ev.status === 'accepted' && now >= ev.at && now < ev.until && this.core.state.world.location === ev.location && !this.pendingPrompt) {
        const def = SOCIAL_EVENTS[ev.def];
        if (def.location === 'city' && def.spot) {
          // outdoor events require being near the spot
          continue;
        }
        this.offerPrompt(ev);
      } else if ((ev.status === 'accepted' || ev.status === 'invited') && now >= ev.until) {
        if (ev.status === 'accepted') {
          ev.status = 'missed';
          SOCIAL_EVENTS[ev.def].miss(this.core, ev);
          this.core.journal.add('social', `错过了${npcName(String(ev.npc))}的${SOCIAL_EVENTS[ev.def].name}。`, true);
        } else {
          ev.status = 'expired';
        }
      }
    }
    for (const ev of this.e.scheduled) {
      const def = SOCIAL_EVENTS[ev.def];
      if (ev.status === 'attended' && def?.after && !ev.data.done && now >= ev.until) {
        ev.data.done = true;
        def.after(this.core, ev);
      }
    }
    if (this.e.scheduled.length > 60) this.e.scheduled = this.e.scheduled.filter((x) => x.until > now - 30 * MINUTES_PER_DAY);
  }

  /** Outdoor events: the world scene calls this when the player reaches the spot. */
  nearSpot(spot: string): void {
    const now = this.core.now();
    for (const ev of this.e.scheduled) {
      const def = SOCIAL_EVENTS[ev.def];
      if (ev.status === 'accepted' && def.spot === spot && def.location === 'city' && now >= ev.at && now < ev.until && !this.pendingPrompt) this.offerPrompt(ev);
    }
  }

  private offerPrompt(ev: ScheduledEvent): void {
    const def = SOCIAL_EVENTS[ev.def];
    this.pendingPrompt = {
      eventId: ev.id,
      title: def.name,
      text: def.arrival(this.core, ev),
      choices: def.choices ? def.choices(this.core, ev) : [{ id: 'ok', label: '加入' }],
    };
    this.core.bus.emit('event:prompt', { prompt: this.pendingPrompt });
    this.core.touch();
  }

  resolvePrompt(choice: string): string {
    const p = this.pendingPrompt;
    if (!p) return '';
    this.pendingPrompt = null;
    const ev = this.e.scheduled.find((x) => x.id === p.eventId);
    if (!ev) return '';
    ev.status = 'attended';
    const text = SOCIAL_EVENTS[ev.def].attend(this.core, ev, choice);
    this.core.journal.add('social', `参加了${npcName(String(ev.npc))}的${SOCIAL_EVENTS[ev.def].name}：${text}`, true);
    this.core.touch();
    return text;
  }

  upcoming(): ScheduledEvent[] {
    const now = this.core.now();
    return this.e.scheduled.filter((x) => (x.status === 'accepted' || x.status === 'invited') && x.until > now).sort((a, b) => a.at - b.at);
  }

  /** Phone message action handlers. */
  handleAction(actionId: string, msg: PhoneMessage): { text: string; resolve?: boolean } {
    const [verb, a, b, c] = actionId.split(':');
    const core = this.core;
    switch (verb) {
      case 'accept': {
        const ev = this.e.scheduled.find((x) => x.id === a);
        if (!ev || ev.status !== 'invited') return { text: '这个邀请已经失效了' };
        // conflicting commitments
        const clash = this.e.scheduled.find((x) => x !== ev && x.status === 'accepted' && x.at < ev.until && ev.at < x.until);
        ev.status = 'accepted';
        core.social.applyDirect(String(ev.npc), { kind: 'chat', facets: { attention: 0.3 }, importance: 4 }, { source: 'told', silent: true, noMemory: true });
        return { text: clash ? `已接受。注意：这和${npcName(String(clash.npc))}的${SOCIAL_EVENTS[clash.def].name}时间冲突了。` : '已接受邀请，记得准时到场。' };
      }
      case 'decline': {
        const ev = this.e.scheduled.find((x) => x.id === a);
        if (!ev || ev.status !== 'invited') return { text: '这个邀请已经失效了' };
        ev.status = 'declined';
        core.social.applyDirect(String(ev.npc), { kind: 'declined_invite', facets: { neglect: 0.35 }, importance: 12, data: { event: SOCIAL_EVENTS[ev.def].name } }, { source: 'told' });
        return { text: '你婉拒了邀请。' };
      }
      case 'lend': {
        const npc = a;
        const amount = Number(b);
        const days = Number(c ?? 28);
        const r = core.economy.pay(amount, 'lend', `借给${npcName(npc)}`, npc, ['bank', 'cash']);
        if (!r.ok) return { text: `转账失败：${r.error}`, resolve: false };
        core.state.economy.receivables.push({ id: `R${core.state.economy.seq}`, npc, amount, lentDay: core.today(), dueDay: core.today() + days, repaid: 0, status: 'open' });
        core.state.npcs[npc].money += amount;
        core.social.applyDirect(npc, { kind: 'lent_money', facets: { generosity: 0.8, support: 0.7 }, importance: 34, data: { amount } }, { source: 'witnessed' });
        core.journal.add('social', `借给${npcName(npc)} ${formatG(amount)}，约定 ${days} 天内归还。`, true);
        return { text: `已转账 ${formatG(amount)} 给${npcName(npc)}。` };
      }
      case 'refuse': {
        const npc = a;
        core.social.applyDirect(npc, { kind: 'refused_help', facets: { stinginess: 0.6 }, importance: 20 }, { source: 'told' });
        return { text: '你拒绝了。' };
      }
      case 'accept_help': {
        const npc = a;
        const amount = Number(b);
        const rt = core.state.npcs[npc];
        const give = Math.min(amount, Math.max(0, rt.money));
        if (give <= 0) return { text: `${npcName(npc)}其实自己也拿不出钱了。` };
        rt.money -= give;
        core.economy.receive('cash', give, 'gift_received', `${npcName(npc)}借给你的钱`, npc);
        core.state.player.flags[`owes:${npc}`] = Number(core.state.player.flags[`owes:${npc}`] ?? 0) + give;
        core.social.applyDirect(npc, { kind: 'admit_trouble', facets: { honesty: 0.4, intimacy: 0.5 }, importance: 20 }, { source: 'told' });
        core.journal.add('social', `${npcName(npc)}在你困难时借给你 ${formatG(give)}。`, true);
        return { text: `收到了 ${formatG(give)}。你在心里记下了这份情。` };
      }
      case 'decline_help': {
        core.social.applyDirect(a, { kind: 'chat', facets: { attention: 0.3 }, importance: 5 }, { source: 'told', silent: true });
        return { text: '你谢绝了对方的好意。' };
      }
      case 'promote': {
        const r = core.career.promote(a);
        return { text: r.ok ? r.message : r.error };
      }
      case 'decline_promote': {
        const j = core.career.job(a);
        if (j) j.promotionsDeclined += 1;
        return { text: '你婉拒了升职。' };
      }
      case 'open':
        core.bus.emit('ui:open', { panel: a });
        return { text: '', resolve: false };
      case 'story':
        return core.stories.choose(a, b);
      case 'out':
        return core.outreach.act(a, b);
    }
    void msg;
    return { text: '' };
  }

  /** Informal loans: due dates and repayment by NPCs (based on their real finances & character). */
  processReceivables(): void {
    const day = this.core.today();
    for (const r of this.core.state.economy.receivables) {
      if (r.status !== 'open') continue;
      const rt = this.core.state.npcs[r.npc];
      const def = NPC_BY_ID[r.npc];
      const owed = r.amount - r.repaid;
      if (day >= r.dueDay - 3 && rt.money > owed + def.income * 0.2) {
        // honest people repay when they can
        if (this.core.rng.chance(0.35 + def.traits.honesty * 0.5)) {
          rt.money -= owed;
          r.repaid += owed;
          r.status = 'repaid';
          this.core.economy.receive('bank', owed, 'repaid_to_you', `${def.name}还款`, r.npc);
          this.core.phone.send(r.npc, def.name, `钱已经转给你了，${formatG(owed)}。谢谢你那时候帮我。`);
          this.core.social.applyDelta(r.npc, { trust: 3, affection: 2 });
          continue;
        }
      }
      if (day === r.dueDay + 7) {
        this.core.phone.send(r.npc, def.name, def.traits.honesty > 0.6 ? '对不起，那笔钱我还需要一点时间……我没有忘。' : '那个钱……再宽限几天吧，最近手头真的太紧了。');
      }
      if (day >= r.dueDay + 45) {
        r.status = 'written_off';
        this.core.journal.add('social', `${def.name}一直没有还你的 ${formatG(owed)}。`);
        this.core.social.remember({ npc: r.npc, kind: 'borrowed', about: 'player', importance: 25, valence: -10, source: 'self', reliability: 1, data: { amount: owed, unpaid: true } });
      }
    }
  }

  /** The player's debts to friends: if they ask and it's not repaid, the relationship suffers. */
  processPlayerDebts(): void {
    for (const [k, v] of Object.entries(this.core.state.player.flags)) {
      if (!k.startsWith('owes:') || !v) continue;
      const npc = k.slice(5);
      const flagDay = `owesAsked:${npc}`;
      const asked = Number(this.core.state.player.flags[flagDay] ?? -1);
      const since = this.core.today() - asked;
      if (asked < 0) {
        this.core.state.player.flags[flagDay] = this.core.today();
        continue;
      }
      if (since === 30) {
        this.core.phone.send(npc, npcName(npc), '那笔钱……你方便的时候还我就好，不急。');
      }
      if (since === 60) {
        this.core.social.applyDirect(npc, { kind: 'debt_unpaid', facets: { unreliability: 0.7 }, importance: 28 }, { source: 'witnessed' });
        this.core.state.player.flags[flagDay] = this.core.today() - 31;
      }
    }
  }

  /** Repay money borrowed from a friend (via dialogue). */
  repayFriend(npc: string): string {
    const owed = Number(this.core.state.player.flags[`owes:${npc}`] ?? 0);
    if (owed <= 0) return '你不欠对方钱';
    const r = this.core.economy.pay(owed, 'loan_repayment', `还给${npcName(npc)}`, npc);
    if (!r.ok) return r.error;
    this.core.state.npcs[npc].money += owed;
    delete this.core.state.player.flags[`owes:${npc}`];
    delete this.core.state.player.flags[`owesAsked:${npc}`];
    this.core.social.applyDirect(npc, { kind: 'repaid', facets: { reliability: 1, honesty: 0.4 }, importance: 28, data: { amount: owed } });
    return `你把 ${formatG(owed)} 还给了${npcName(npc)}。`;
  }

  /** Wealth class transitions are worth an event of their own. */
  wealthClassChanged(): string {
    return wealthClassOf(this.core.economy.netWorth()).name;
  }
}
