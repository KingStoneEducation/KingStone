import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import type { JobState, PhoneAction, Stake, StoryState } from '../core/state';
import { NPC_BY_ID } from '../data/npcs';

/**
 * Storylines that unfold over weeks. Each arc is a small state machine:
 * stages advance once a day or when the player answers a phone message, and
 * what happens next depends on those answers, on the NPCs' real finances
 * and characters, and on chance. Arcs are saved with the game.
 */

export interface StoryCtx {
  core: GameCore;
  st: StoryState;
  day: number;
}

export interface StageDef {
  /** one line for the journal's "in progress" list */
  status?: (c: StoryCtx) => string;
  /** runs when the stage begins */
  enter?: (c: StoryCtx) => void;
  /** checked once a day: the next stage, 'end:<ending>', or null to stay */
  daily?: (c: StoryCtx) => string | null;
  /** the player's answer to this stage's message */
  choose?: (c: StoryCtx, choice: string) => { text: string; next?: string; keep?: boolean };
  /** what someone in the story says about it when you talk to them in person, if anything */
  talk?: (c: StoryCtx, npc: string) => string | null;
}

export interface ArcDef {
  id: string;
  title: string;
  cooldownDays: number;
  /** only once per game */
  once?: boolean;
  /** data for a new storyline if it could start today */
  trigger: (core: GameCore) => Record<string, number | string | boolean> | null;
  chance: number;
  start: (data: Record<string, number | string | boolean>) => string;
  stages: Record<string, StageDef>;
  /** journal summary per ending; `important` endings are highlighted */
  endings: Record<string, { important: boolean; text: (c: StoryCtx) => string; apply?: (c: StoryCtx) => void }>;
}

const name = (id: string) => NPC_BY_ID[id]?.name ?? id;
const knows = (core: GameCore, id: string) => core.state.social.rel[id]?.met ?? false;
const act = (arc: string, stage: string, choice: string, label: string): PhoneAction => ({ id: `story:${arc}:${stage}.${choice}`, label });
const round100 = (m: Money) => Math.round(m / G(100)) * G(100);

/** The chance a heart-to-heart gets through to someone (trust and history matter; a fellow gambler is not convincing). */
function persuasion(core: GameCore, npc: string, bonus = 0): number {
  const r = core.social.rel(npc);
  const hypocrite = core.casino.recentHours(7) > 12 ? 0.3 : 0;
  return Math.max(0.05, Math.min(0.9, 0.2 + r.affection / 150 + r.trust / 200 + bonus - hypocrite));
}

// ---------------------------------------------------------------- Marco's gambling debt

const MARCO_DEBT: ArcDef = {
  id: 'marco_debt',
  title: '马可的赌债',
  cooldownDays: 45,
  trigger: (core) => {
    const rt = core.state.npcs.marco;
    if (!rt?.flags.inCrisis) return null;
    if (knows(core, 'marco')) return { via: 'marco' };
    if (knows(core, 'daniel')) return { via: 'daniel' };
    return null;
  },
  chance: 0.5,
  start: (d) => (d.via === 'marco' ? 'ask' : 'rumor'),
  stages: {
    rumor: {
      status: () => '丹尼尔说马可欠了赌债，有人找到车行去了。',
      enter: ({ core }) => {
        core.phone.send('daniel', name('daniel'), '你认识我们车行的马可吧？他在赌场欠了一屁股债，今天有两个人来店里找他……我真替他担心。', [
          act('marco_debt', 'rumor', 'call', '给马可打个电话'),
          act('marco_debt', 'rumor', 'ignore', '这不关我的事'),
        ]);
        core.social.remember({ npc: 'daniel', kind: 'npc_hardship', about: 'marco', importance: 20, valence: -30, source: 'witnessed', reliability: 0.9, data: { amount: 0 } });
      },
      choose: ({ core }, choice) => {
        if (choice === 'call') {
          const r = core.social.rel('marco');
          r.met = true;
          r.knowsName = true;
          return { text: '你拨通了马可的电话。', next: 'ask' };
        }
        return { text: '你没有回复。', next: 'spiral' };
      },
      daily: ({ day, st }) => (day - st.since >= 4 ? 'spiral' : null),
    },
    ask: {
      status: ({ st }) => `马可开口向你借 ${formatG(Number(st.data.amount))}。`,
      enter: ({ core, st }) => {
        const rt = core.state.npcs.marco;
        const amount = round100(Math.max(G(800), Math.min(G(3000), rt.debt * 0.25)));
        st.data.amount = amount;
        core.phone.send('marco', name('marco'), `兄弟……我最近手气太背了，欠了一些人钱，他们催得很紧。能不能先借我 ${formatG(amount)}？下个月发提成就还你，我保证。`, [
          act('marco_debt', 'ask', 'lend', `借给他 ${formatG(amount)}`),
          act('marco_debt', 'ask', 'talk', '劝他别再赌了'),
          act('marco_debt', 'ask', 'refuse', '拒绝'),
        ]);
      },
      choose: (c, choice) => {
        const { core, st } = c;
        if (choice === 'lend') {
          const amount = Number(st.data.amount);
          const r = core.economy.pay(amount, 'lend', `借给${name('marco')}`, 'marco', ['bank', 'cash']);
          if (!r.ok) return { text: `转账失败：${r.error}`, keep: true };
          core.state.economy.receivables.push({ id: `R${core.state.economy.seq}`, npc: 'marco', amount, lentDay: c.day, dueDay: c.day + 28, repaid: 0, status: 'open' });
          core.state.npcs.marco.money += amount;
          core.social.applyDirect('marco', { kind: 'lent_money', facets: { generosity: 0.8, support: 0.7 }, importance: 34, data: { amount } }, { source: 'witnessed' });
          core.journal.add('social', `借给马可 ${formatG(amount)}，约定 28 天内归还。`, true);
          return { text: `已转账 ${formatG(amount)} 给马可。`, next: 'lent' };
        }
        if (choice === 'talk') {
          st.data.talked = true;
          if (core.rng.chance(persuasion(core, 'marco'))) {
            core.social.applyDelta('marco', { trust: 4, affection: 2 });
            return { text: '你们聊了很久。马可沉默了一会儿，说他会认真想想。', next: 'recovery' };
          }
          core.social.applyDelta('marco', { affection: -3 });
          return { text: '「你懂什么？我只是运气不好。」马可挂了电话。', next: 'spiral' };
        }
        core.social.applyDirect('marco', { kind: 'refused_help', facets: { stinginess: 0.6 }, importance: 20 }, { source: 'told' });
        return { text: '你拒绝了。', next: 'spiral' };
      },
      daily: ({ core, day, st }) => {
        if (day - st.since < 4) return null;
        core.social.applyDirect('marco', { kind: 'ignored', facets: { neglect: 0.5 }, importance: 14 }, { source: 'inferred', silent: true });
        return 'spiral';
      },
    },
    lent: {
      status: ({ st }) => `你借给马可 ${formatG(Number(st.data.amount))}，约定 28 天内归还。`,
      daily: ({ core, day, st }) => {
        if (day - st.since < 6) return null;
        // the "system" always needs one more night
        const p = 0.35 + NPC_BY_ID.marco.traits.gamblingView * 0.25 - (st.data.talked ? 0.3 : 0);
        if (core.rng.chance(p)) {
          const rt = core.state.npcs.marco;
          const lost = Math.min(rt.money, round100(Number(st.data.amount) * 0.9));
          rt.money -= lost;
          core.social.npcEvent('marco', 'npc_big_loss', { amount: lost });
          return 'relapse';
        }
        return 'steady';
      },
    },
    steady: {
      status: () => '马可卖了车还掉一部分债，答应慢慢还你的钱。',
      enter: ({ core }) => {
        const rt = core.state.npcs.marco;
        rt.debt = Math.round(rt.debt * 0.6);
        core.phone.send('marco', name('marco'), '我把那辆二手跑车卖了，先把最急的债还上了。这次真的谢谢你。');
      },
      daily: ({ core, day, st }) => {
        const r = core.state.economy.receivables.filter((x) => x.npc === 'marco').pop();
        if (r?.status === 'repaid') return 'end:repaid';
        if (r?.status === 'written_off') return 'end:unpaid';
        return day - st.since > 80 ? 'end:unpaid' : null;
      },
    },
    relapse: {
      status: () => '听说马可把借来的钱又输掉了。',
      enter: ({ core }) => {
        const from = knows(core, 'daniel') ? 'daniel' : 'marco';
        core.phone.send(
          from,
          name(from),
          from === 'daniel' ? '马可又去赌场了……听说把借来的钱也搭进去了。昨天又有人到车行找他。' : '……对不起。我本来想翻本的。钱没了。',
        );
      },
      daily: ({ day, st }) => (day - st.since >= 2 ? 'sharks' : null),
    },
    spiral: {
      status: () => '没人帮忙，马可去借了高利贷。',
      enter: ({ core }) => {
        // nobody helped, so he went to the people who always lend
        const rt = core.state.npcs.marco;
        rt.debt += G(2500);
        rt.flags.sharks = true;
      },
      daily: ({ day, st }) => (day - st.since >= 3 ? 'sharks' : null),
    },
    sharks: {
      status: () => '追债的人找上了门，丹尼尔在等你的回复。',
      enter: ({ core, st }) => {
        const rt = core.state.npcs.marco;
        const help = round100(Math.max(G(500), Math.min(G(2000), rt.debt * 0.4)));
        st.data.help = help;
        const from = knows(core, 'daniel') ? 'daniel' : 'marco';
        const body =
          from === 'daniel'
            ? '两个陌生人一直在车行门口等马可，他已经两天没敢来上班了。我们几个凑了点钱也不够……你能帮帮他吗？'
            : '他们找到车行来了……我不知道还能找谁。';
        core.phone.send(from, name(from), body, [
          act('marco_debt', 'sharks', 'pay', `帮他还一部分（${formatG(help)}）`),
          act('marco_debt', 'sharks', 'talk', '约马可出来谈谈'),
          act('marco_debt', 'sharks', 'out', '别管了'),
        ]);
      },
      choose: ({ core, st }, choice) => {
        if (choice === 'pay') {
          const help = Number(st.data.help);
          const r = core.economy.pay(help, 'gift_given', '替马可还债', 'marco', ['bank', 'cash']);
          if (!r.ok) return { text: `转账失败：${r.error}`, keep: true };
          const rt = core.state.npcs.marco;
          rt.debt = Math.max(0, rt.debt - help);
          rt.flags.sharks = false;
          core.social.applyDirect('marco', { kind: 'helped_friend', facets: { kindness: 0.8, generosity: 0.8, support: 0.9 }, importance: 40, data: { amount: help } }, { source: 'witnessed' });
          if (knows(core, 'daniel')) core.social.applyDirect('daniel', { kind: 'helped_friend', facets: { kindness: 0.8 }, importance: 30, data: { amount: help } }, { source: 'told' });
          st.data.paid = help;
          return { text: `你替马可还了 ${formatG(help)}。`, next: 'recovery' };
        }
        if (choice === 'talk') {
          st.data.talked = true;
          if (core.rng.chance(persuasion(core, 'marco', 0.15))) return { text: '在码头边的长椅上，马可第一次承认自己停不下来。', next: 'recovery' };
          return { text: '马可没有来赴约。', next: 'fallout' };
        }
        return { text: '你决定不插手。', next: 'fallout' };
      },
      daily: ({ day, st }) => (day - st.since >= 3 ? 'fallout' : null),
    },
    recovery: {
      status: ({ st, day }) => `马可答应一个月不进赌场（还剩 ${Math.max(0, 30 - (day - st.since))} 天）。`,
      enter: ({ core, day }) => {
        const rt = core.state.npcs.marco;
        rt.flags.noGambleUntil = day + 30;
        core.phone.send('marco', name('marco'), '……你说得对。我报名了周三晚上的互助小组。这一个月我不会再踏进赌场一步。');
        core.journal.add('social', '马可答应一个月不去赌场。', true);
      },
      daily: ({ day, st }) => (day - st.since >= 30 ? 'end:recovered' : null),
    },
    fallout: {
      status: () => '马可被停职了，车也被拖走抵债。',
      enter: ({ core, day, st }) => {
        const rt = core.state.npcs.marco;
        rt.mood = Math.max(-100, rt.mood - 25);
        rt.flags.suspendedUntil = day + 14;
        core.phone.send('marco', name('marco'), st.data.talked ? '……算了。我自己的事自己扛。' : '车被拖走抵债了，车行让我停职两周。……我没事。');
      },
      daily: ({ day, st }) => (day - st.since >= 14 ? 'end:fallout' : null),
    },
  },
  endings: {
    repaid: { important: true, text: () => '马可把欠你的钱还清了。他说这次真的学到了教训——至少暂时是这样。', apply: ({ core }) => core.social.applyDelta('marco', { trust: 5, affection: 4 }) },
    unpaid: { important: true, text: () => '马可一直没还你的钱。你们之间多了一层说不清的东西。', apply: ({ core }) => core.social.applyDelta('marco', { trust: -4 }) },
    recovered: {
      important: true,
      text: ({ st }) => `一个月过去了，马可没有再去赌场。他的气色好了很多${st.data.paid ? '，还说那笔钱他一定会还你' : ''}。`,
      apply: ({ core }) => {
        const rt = core.state.npcs.marco;
        rt.mood = Math.min(100, rt.mood + 20);
        rt.debt = Math.round(rt.debt * 0.8);
        core.social.applyDelta('marco', { trust: 6, affection: 6, respect: 4 });
        core.phone.send('marco', name('marco'), '整整三十天了。说出来你可能不信，我现在晚上能睡着觉了。改天请你吃饭！');
      },
    },
    fallout: {
      important: true,
      text: () => '马可的债越滚越大，车被拖走、工作也停了两周。灰港的夜里少了一个在赌桌前大笑的人。',
    },
  },
};

// ---------------------------------------------------------------- Daniel's breakfast stall

/** The stall's starting capital (Daniel's savings plus the player's money). */
const STALL_CAPITAL = G(20000);

function stallStake(core: GameCore): Stake | undefined {
  return core.state.economy.stakes.find((x) => x.id === 'daniel_stall' && x.status === 'active');
}

/** Equity → the player's stake value. */
function revalue(core: GameCore, st: StoryState): void {
  const stake = stallStake(core);
  if (stake) stake.value = Math.max(0, Math.round((Number(st.data.equity) * stake.share) / 100) * 100);
}

const DANIEL_STALL: ArcDef = {
  id: 'daniel_stall',
  title: '丹尼尔的早餐铺',
  cooldownDays: 9999,
  once: true,
  trigger: (core) => {
    if (core.today() < 7 || !knows(core, 'daniel')) return null;
    if (core.social.rel('daniel').affection < 20) return null;
    if (core.economy.balance('bank') + core.economy.balance('cash') < G(8000)) return null;
    return {};
  },
  chance: 0.15,
  start: () => 'pitch',
  stages: {
    pitch: {
      status: () => '丹尼尔想开一家早餐铺，问你要不要入股。',
      enter: ({ core }) => {
        core.phone.send(
          'daniel',
          name('daniel'),
          '我一直想把码头边那个旧报亭盘下来，改成早餐铺——煎饼、豆浆、给早班的码头工人。预算两万，我自己凑了一万五。你愿意投 5,000 G 占两成五吗？赚了按比例分红，亏了……就当陪我做了一次梦。',
          [act('daniel_stall', 'pitch', 'full', '投 5,000 G（占 25%）'), act('daniel_stall', 'pitch', 'small', '投 2,000 G（占 10%）'), act('daniel_stall', 'pitch', 'no', '这次就不参与了')],
        );
      },
      choose: ({ core, st, day }, choice) => {
        if (choice === 'no') {
          core.social.applyDelta('daniel', { affection: 1 });
          return { text: '「没事，我理解。开张了记得来吃早饭！」', next: 'end:declined' };
        }
        const amount = choice === 'full' ? G(5000) : G(2000);
        const share = choice === 'full' ? 0.25 : 0.1;
        const r = core.economy.pay(amount, 'investment_buy', '入股丹尼尔的早餐铺', 'daniel', ['bank', 'cash']);
        if (!r.ok) return { text: `转账失败：${r.error}`, keep: true };
        core.state.economy.stakes.push({ id: 'daniel_stall', name: '丹尼尔的早餐铺', npc: 'daniel', invested: amount, value: amount, share, since: day, received: 0, status: 'active' });
        // how good the idea really is: nobody knows yet, not even Daniel
        st.data.quality = Math.round(core.rng.range(0.2, 0.8) * 100) / 100;
        st.data.equity = STALL_CAPITAL;
        st.data.week = 0;
        st.data.undistributed = 0;
        core.social.applyDirect('daniel', { kind: 'supported_dream', facets: { generosity: 0.6, support: 0.9, kindness: 0.4 }, importance: 35, data: { amount } }, { source: 'witnessed' });
        core.journal.add('money', `入股丹尼尔的早餐铺：投入 ${formatG(amount)}，占 ${Math.round(share * 100)}%。`, true);
        return { text: `你转给丹尼尔 ${formatG(amount)}。他在电话那头半天没说出话来。`, next: 'building' };
      },
      daily: ({ day, st }) => (day - st.since >= 7 ? 'end:declined' : null),
    },
    building: {
      status: () => '早餐铺正在装修，很快就开张。',
      daily: ({ day, st }) => (day - st.since >= 10 ? 'open' : null),
    },
    open: {
      status: ({ core, st }) => `早餐铺营业中（第 ${Number(st.data.week) + 1} 周），你的股份估值 ${formatG(stallStake(core)?.value ?? 0)}。`,
      enter: ({ core, st }) => {
        if (!st.data.opened) {
          st.data.opened = true;
          core.phone.send('daniel', name('daniel'), '早餐铺今天正式开张了！每天早上 6 点到 10 点，就在码头那边。豆浆管够，你来了不收钱。');
        }
      },
      daily: (c) => {
        const { core, st, day } = c;
        if ((day - st.since) % 7 !== 6) return null;
        // a week of business: the idea's quality decides the trend, luck the noise
        const q = Number(st.data.quality);
        const weekly = Math.round((STALL_CAPITAL * core.rng.normal((q - 0.55) * 0.08, 0.035)) / 100) * 100;
        st.data.week = Number(st.data.week) + 1;
        st.data.equity = Number(st.data.equity) + weekly;
        st.data.month = Number(st.data.month ?? 0) + weekly;
        const stake = stallStake(core);
        // every four weeks half of the month's net profit is paid out to the owners
        if (stake && Number(st.data.week) % 4 === 0) {
          const profit = Number(st.data.month);
          st.data.month = 0;
          const total = profit > 0 ? Math.round((profit * 0.5) / 100) * 100 : 0;
          const payout = Math.round((total * stake.share) / 100) * 100;
          if (payout > 0) {
            st.data.equity = Number(st.data.equity) - total;
            core.economy.receive('bank', payout, 'dividend', '早餐铺分红', 'daniel');
            core.state.npcs.daniel.money += total - payout;
            stake.received += payout;
            core.phone.send('daniel', name('daniel'), `这个月的分红：${formatG(payout)}，已经转到你账上了。码头的大哥们都说我的豆浆最正宗！`);
          } else {
            core.phone.send('daniel', name('daniel'), '这个月没赚到钱……不过客人越来越多了，再给我点时间。');
          }
        }
        revalue(core, st);
        const tooLow = Number(st.data.equity) < STALL_CAPITAL * 0.6;
        const verdict = Number(st.data.week) >= 12 ? (Number(st.data.equity) >= STALL_CAPITAL ? 'end:thriving' : Number(st.data.equity) >= STALL_CAPITAL * 0.75 ? 'end:modest' : 'trouble') : tooLow ? 'trouble' : null;
        // there is only so much rescuing a business can take
        if (verdict === 'trouble' && Number(st.data.asked ?? 0) >= 2) return 'closing';
        return verdict;
      },
    },
    trouble: {
      status: () => '早餐铺遇到了困难，丹尼尔问你能不能追加投资。',
      enter: ({ core, st }) => {
        st.data.asked = Number(st.data.asked ?? 0) + 1;
        core.phone.send(
          'daniel',
          name('daniel'),
          st.data.asked === 1 ? '生意没我想的那么好做……房东要涨租，豆浆机也坏了。我还需要 2,000 G 撑过这个月。你还愿意再帮我一次吗？' : '……还是不行。再给我一次机会，2,000 G，最后一次。',
          [act('daniel_stall', 'trouble', 'more', '再投 2,000 G'), act('daniel_stall', 'trouble', 'no', '不再追加')],
        );
      },
      choose: ({ core, st }, choice) => {
        if (choice === 'more') {
          const r = core.economy.pay(G(2000), 'investment_buy', '追加投资早餐铺', 'daniel', ['bank', 'cash']);
          if (!r.ok) return { text: `转账失败：${r.error}`, keep: true };
          const stake = stallStake(core);
          if (stake) stake.invested += G(2000);
          // the money only buys the business more time; it changes the odds a little
          st.data.equity = Number(st.data.equity) + Math.round(G(2000) / (stake?.share ?? 0.25));
          st.data.quality = Math.min(0.9, Number(st.data.quality) + 0.08);
          revalue(core, st);
          core.social.applyDelta('daniel', { trust: 4, affection: 3 });
          return { text: '你又转了 2,000 G。丹尼尔说他会把每一分钱都用在刀刃上。', next: 'open' };
        }
        if (Number(st.data.quality) >= 0.45 && st.data.asked === 1) return { text: '丹尼尔说他会想别的办法。', next: 'open' };
        return { text: '你没有再追加。', next: 'closing' };
      },
      daily: ({ day, st }) => (day - st.since >= 5 ? 'closing' : null),
    },
    closing: {
      status: () => '早餐铺正在清算。',
      enter: ({ core, st }) => {
        const stake = stallStake(core);
        const back = stake ? Math.round((Math.max(0, Number(st.data.equity)) * 0.3 * stake.share) / 100) * 100 : 0;
        st.data.back = back;
        if (stake) {
          if (back > 0) core.economy.receive('bank', back, 'investment_sell', '早餐铺清算退款', 'daniel');
          stake.received += back;
          stake.value = 0;
          stake.status = 'closed';
        }
        core.phone.send('daniel', name('daniel'), back > 0 ? `……早餐铺关门了。设备卖了一点钱，按比例退给你 ${formatG(back)}。对不起，让你跟着我赔钱了。` : '……早餐铺关门了。对不起，让你跟着我赔钱了。');
      },
      daily: () => 'end:closed',
    },
  },
  endings: {
    declined: { important: false, text: () => '你没有参与丹尼尔的早餐铺。' },
    thriving: {
      important: true,
      text: ({ st }) => `丹尼尔的早餐铺站稳了脚跟。他用盈利买回了你的股份：你拿回 ${formatG(Number(st.data.buyback ?? 0))}。`,
      apply: (c) => buyBack(c, 1.15),
    },
    modest: {
      important: true,
      text: ({ st }) => `早餐铺勉强站住了。丹尼尔按估值买回了你的股份：${formatG(Number(st.data.buyback ?? 0))}。`,
      apply: (c) => buyBack(c, 1),
    },
    closed: {
      important: true,
      text: () => '丹尼尔的早餐铺没能撑下去。你的投资大部分打了水漂，但他说，谢谢你曾经相信他。',
      apply: ({ core }) => core.social.applyDelta('daniel', { affection: 3, trust: 2 }),
    },
  },
};

/** Daniel buys the player's stake back at its value (× a thank-you premium when it went well). */
function buyBack({ core, st }: StoryCtx, premium: number): void {
  const stake = stallStake(core);
  if (!stake) return;
  const price = Math.round((stake.value * premium) / 100) * 100;
  if (price > 0) core.economy.receive('bank', price, 'investment_sell', '丹尼尔买回早餐铺股份', 'daniel');
  stake.received += price;
  stake.value = 0;
  stake.status = 'sold';
  st.data.buyback = price;
  core.social.applyDelta('daniel', { affection: 6, trust: 6, respect: 3 });
}

// ---------------------------------------------------------------- Maple Court changes hands

/** The two buyers Margaret has for Maple Court: the highest bid, and a family who would keep the tenants on. */
const MAPLE_BUYERS: Record<'company' | 'family', { name: string; raise: number }> = {
  company: { name: '港湾置业', raise: 30 },
  family: { name: '新房东林先生', raise: 5 },
};

/** What Margaret asks of the tenant who lives in 3B, against what it would fetch on the market. */
export const SITTING_TENANT = 0.9;

function mapleTenant(core: GameCore): boolean {
  const h = core.state.housing;
  return h.homeId === 'home_basic' && h.tenure === 'rent';
}

/** Whether Margaret takes less from a buyer who keeps the tenants on depends on the tenant you have been. */
export function mapleGoodwill(core: GameCore): number {
  const r = core.social.rel('margaret');
  const late = core.social.memoriesOf('margaret').filter((m) => m.kind === 'rent_late').length;
  const months = Math.floor((core.today() - core.state.housing.leaseStartDay) / 30);
  return Math.max(0.05, Math.min(0.85, 0.15 + r.affection / 120 + r.trust / 160 + months * 0.03 - late * 0.12));
}

/** The sale goes through: the building has a new owner, and (if you still live in 3B) a new rent. */
function sellMaple({ core, st }: StoryCtx, buyer: 'company' | 'family'): void {
  const b = MAPLE_BUYERS[buyer];
  core.state.housing.mapleSoldTo = b.name;
  if (mapleTenant(core)) {
    const rent = core.housing.scheduleRentIncrease(b.raise);
    st.data.newRent = rent;
    core.phone.send(
      'landlord',
      b.name,
      buyer === 'company'
        ? `您好，枫庭公寓已由港湾置业接手。根据市场行情，3B 的月租从下个月起调整为 ${formatG(rent)}。原租约照常有效；如不续租，押金在退房时退还。`
        : `你好，我是新房东林先生，住一楼。玛格丽特阿姨交代过，楼里的规矩都照旧。房租从下个月起是 ${formatG(rent)}，有什么事敲一楼的门就行。`,
    );
  }
  core.phone.send('margaret', name('margaret'), '手续都办完了。这些年谢谢你。以后在路上碰见，还是叫我玛格丽特就好。');
}

const MAPLE_SALE: ArcDef = {
  id: 'maple_sale',
  title: '枫庭公寓易主',
  cooldownDays: 9999,
  once: true,
  trigger: (core) => {
    const h = core.state.housing;
    if (!mapleTenant(core) || h.mapleSoldTo || core.today() < 20 || core.today() - h.leaseStartDay < 30) return null;
    if (!knows(core, 'margaret') || core.housing.rentOverdue() || h.evictionNoticeDay !== null) return null;
    return {};
  },
  chance: 0.04,
  start: () => 'notice',
  stages: {
    notice: {
      status: () => '玛格丽特打算卖掉枫庭公寓，还没决定卖给谁。',
      enter: ({ core }) => {
        core.phone.send(
          'margaret',
          name('margaret'),
          '有件事得先跟你说。这栋楼我一个人管了十几年，实在管不动了，打算把枫庭卖掉。出价最高的是港湾置业，可他们接手以后要翻新，按市价重新定租金，3B 大概要涨三成。还有一户姓林的人家想买，自己住一楼，其余的照旧租出去，就是出价低一些。我还没拿定主意。',
          [act('maple_sale', 'notice', 'buy', '问她能不能把 3B 卖给我'), act('maple_sale', 'notice', 'family', '请她考虑林家'), act('maple_sale', 'notice', 'fine', '谢谢你告诉我')],
        );
      },
      choose: ({ core, st }, choice) => {
        if (choice === 'buy') return { text: '你问玛格丽特，3B 能不能直接卖给你。', next: 'offer' };
        if (choice === 'family') {
          if (core.rng.chance(mapleGoodwill(core))) {
            st.data.buyer = 'family';
            core.social.applyDelta('margaret', { respect: 2 });
            return { text: '玛格丽特沉默了一会儿：「……你说得对。少卖一点就少卖一点吧，我也不想看你们被赶走。」', next: 'pending' };
          }
          st.data.buyer = 'company';
          return { text: '「我也想啊。可差的那些钱，是我后半辈子的养老钱。」', next: 'pending' };
        }
        st.data.buyer = 'company';
        return { text: '玛格丽特说，手续办完之前一切照旧。', next: 'pending' };
      },
      // no answer: she takes the best offer
      daily: ({ day, st }) => {
        if (day - st.since < 7) return null;
        st.data.buyer = 'company';
        return 'pending';
      },
      talk: (_c, npc) => (npc === 'margaret' ? '这栋楼的事……我还在想。卖给谁都舍不得。' : null),
    },
    offer: {
      status: ({ st }) => `玛格丽特愿意以 ${formatG(Number(st.data.price))} 把 3B 卖给你。`,
      enter: ({ core, st }) => {
        const late = core.social.memoriesOf('margaret').some((m) => m.kind === 'rent_late');
        const price = round100(core.housing.marketValue('home_basic') * SITTING_TENANT);
        st.data.price = price;
        core.phone.send(
          'margaret',
          name('margaret'),
          `你要是真想买，3B 我按 ${formatG(price)} 卖给你，比挂出去的价低一成——${late ? '谁让你是住在里面的人呢' : '就当谢谢你这些年按时交租'}。全款也好、贷款也好，十天之内给我个准话。`,
          [act('maple_sale', 'offer', 'cash', `全款买下（${formatG(price)}，另付 2% 税费）`), act('maple_sale', 'offer', 'loan', '首付两成，向银行申请房贷'), act('maple_sale', 'offer', 'no', '还是算了')],
        );
      },
      choose: ({ core, st }, choice) => {
        if (choice !== 'no' && !mapleTenant(core)) {
          st.data.buyer = 'company';
          return { text: '你已经不住在 3B 了，玛格丽特把它和楼里其余的房子一起卖了。', next: 'pending' };
        }
        if (choice === 'no') {
          st.data.buyer = 'company';
          return { text: '你跟玛格丽特说，还是不买了。', next: 'pending' };
        }
        const r = core.housing.buy('home_basic', choice === 'loan', { price: Number(st.data.price), seller: 'margaret' });
        if (!r.ok) return { text: `没能买下：${r.error}`, keep: true };
        return { text: r.message, next: 'end:bought' };
      },
      daily: ({ core, day, st }) => {
        if (day - st.since < 10 && mapleTenant(core)) return null;
        st.data.buyer = 'company';
        return 'pending';
      },
      talk: ({ st }, npc) => (npc === 'margaret' ? `3B 的事你想好了吗？${formatG(Number(st.data.price))}，我不会再低了。` : null),
    },
    pending: {
      status: ({ st }) => (st.data.buyer === 'family' ? '枫庭公寓要卖给林家了，房租只会涨一点。' : '枫庭公寓要卖给港湾置业了，手续办完后 3B 的房租要涨三成。'),
      daily: ({ day, st }) => (day - st.started >= 21 ? `end:${st.data.buyer === 'family' ? 'family' : 'company'}` : null),
      talk: ({ st }, npc) => (npc !== 'margaret' ? null : st.data.buyer === 'family' ? '林家人很客气，说楼里的规矩都照旧。我也就放心了。' : '港湾置业的人来量过房子了……对不起啊。'),
    },
  },
  endings: {
    bought: {
      important: true,
      text: ({ st }) => `你从玛格丽特手里买下了枫庭公寓 3B（${formatG(Number(st.data.price))}）。楼里其余的房子卖给了港湾置业，3B 从此是你自己的了。`,
      apply: ({ core }) => {
        core.state.housing.mapleSoldTo = MAPLE_BUYERS.company.name;
        core.social.applyDirect('margaret', { kind: 'bought_flat', facets: { reliability: 0.5, success: 0.4 }, importance: 26, data: { home: '枫庭公寓 3B' } });
      },
    },
    company: {
      important: true,
      text: ({ st }) => `玛格丽特把枫庭公寓卖给了港湾置业。${st.data.newRent ? `从下个月起，3B 的房租涨到 ${formatG(Number(st.data.newRent))}。` : ''}`,
      apply: (c) => sellMaple(c, 'company'),
    },
    family: {
      important: true,
      text: ({ st }) => `玛格丽特把枫庭公寓卖给了林家，新房东留下了所有老租客。${st.data.newRent ? `3B 的房租只涨到 ${formatG(Number(st.data.newRent))}。` : ''}`,
      apply: (c) => sellMaple(c, 'family'),
    },
  },
};

// ---------------------------------------------------------------- the merger review at Harbor Logistics

/** Days from Raymond's ask to the review: the attendance and performance in between are what count. */
export const REVIEW_DAYS = 14;

function officeJob(core: GameCore): JobState | undefined {
  const j = core.career.job('office_clerk');
  return j && j.status === 'active' ? j : undefined;
}

/** Whom the player ended up standing with: Raymond, the man from head office, both (and so neither), or nobody. */
function officeSide(st: StoryState): 'raymond' | 'west' | 'double' | 'neutral' {
  if (st.data.west) return st.data.side === 'raymond' ? 'double' : 'west';
  return st.data.side === 'raymond' ? 'raymond' : 'neutral';
}

/** The review: the department's numbers (in which the player's own record counts) against what was said about Raymond. */
function reviewVerdict({ core, st }: StoryCtx, j: JobState): string {
  const lates = j.lates - Number(st.data.lates0);
  const absences = j.absences - Number(st.data.absences0);
  const clean = lates === 0 && absences === 0;
  const work = (j.performance - 65) / 100 + (clean ? 0.08 : -0.06 * (lates + 2 * absences));
  const side = officeSide(st);
  const p = Math.max(0.1, Math.min(0.9, 0.5 + (side === 'raymond' ? work * 1.5 + 0.05 : side === 'neutral' ? work * 0.5 : -0.2)));
  st.data.final = side;
  st.data.clean = clean;
  st.data.chance = Math.round(p * 100);
  return core.rng.chance(p) ? 'end:raymond' : 'end:west';
}

/** Raymond finds out (from Kiki) what the player told head office about him. */
function raymondLearns(core: GameCore, double: boolean): void {
  core.social.applyDirect('raymond', { kind: 'sided_against_me', facets: { betrayal: double ? 1 : 0.8 }, importance: double ? 44 : 36 }, { source: 'told' });
}

const OFFICE_REVIEW: ArcDef = {
  id: 'office_review',
  title: '部门合并',
  cooldownDays: 9999,
  once: true,
  trigger: (core) => {
    const j = officeJob(core);
    if (!j || j.shifts < 12 || core.today() < 14) return null;
    if (!knows(core, 'raymond') || !knows(core, 'kiki')) return null;
    return {};
  },
  chance: 0.03,
  start: () => 'rumor',
  stages: {
    rumor: {
      status: () => '琪琪说部门要合并，雷蒙德和总部派来的韦斯特在争新部门的总监。',
      enter: ({ core }) => {
        core.phone.send('kiki', name('kiki'), '听说了吗？总部要把我们部门和仓储部合并，新部门的总监在雷蒙德和总部派来的韦斯特之间选，两周后总部来人评审。韦斯特这几天挨个请人喝咖啡……你小心点，站错队可不是闹着玩的。');
      },
      daily: ({ core, day, st }) => (!officeJob(core) ? 'end:left' : day - st.since >= 1 ? 'raymond' : null),
      talk: (_c, npc) => (npc === 'kiki' ? '韦斯特今天又请财务部的人吃午饭了。我跟你说，这里面水深着呢。' : null),
    },
    raymond: {
      status: () => '雷蒙德问你能不能在评审前帮他一把。',
      enter: ({ core, st }) => {
        const j = officeJob(core);
        st.data.lates0 = j?.lates ?? 0;
        st.data.absences0 = j?.absences ?? 0;
        st.data.reviewDay = st.since + REVIEW_DAYS;
        core.phone.send(
          'raymond',
          name('raymond'),
          `总部 ${REVIEW_DAYS} 天后来评审，定合并以后的部门由谁带。他们只看数字：出勤、效率、有没有出错。这两周我需要部门的表现漂漂亮亮的，尤其是你们几个——我能指望你吗？`,
          [act('office_review', 'raymond', 'back', '放心，我会全力以赴'), act('office_review', 'raymond', 'duty', '我会做好分内的事')],
        );
      },
      choose: ({ core, st }, choice) => {
        if (choice === 'back') {
          st.data.side = 'raymond';
          core.social.applyDirect('raymond', { kind: 'pledged_support', facets: { support: 0.6, reliability: 0.3 }, importance: 16 });
          return { text: '雷蒙德回了一个字：「好。」' };
        }
        st.data.side = 'neutral';
        return { text: '「……行，分内的事做好也够了。」' };
      },
      daily: ({ core, day, st }) => (!officeJob(core) ? 'end:left' : day - st.since >= 2 ? 'west' : null),
      talk: (_c, npc) => (npc === 'raymond' ? '这两周别给我出岔子。总部的人盯着呢。' : null),
    },
    west: {
      status: () => '总部的韦斯特找你，想让你在评审谈话时讲讲雷蒙德的问题。',
      enter: ({ core }) => {
        core.phone.send(
          'west',
          '韦斯特（总部）',
          '你好，我是总部的韦斯特。合并以后我需要了解这个部门的人。评审的时候总部会单独找几个员工谈话，问问部门现在的问题——你只要实话实说，讲讲雷蒙德的管理有哪些问题就行。帮过我的人，我不会忘记。',
          [act('office_review', 'west', 'join', '好，谈话时我会说'), act('office_review', 'west', 'no', '我不掺和这些')],
        );
      },
      choose: ({ st }, choice) => {
        if (choice === 'join') {
          st.data.west = true;
          return { text: '「很好。我会记住的。」' };
        }
        return { text: '韦斯特没有再回复。' };
      },
      daily: ({ core, day, st }) => (!officeJob(core) ? 'end:left' : day - st.since >= 2 ? 'review' : null),
      talk: (_c, npc) => (npc === 'kiki' ? '韦斯特是不是也找过你了？……放心，我嘴很严的。' : null),
    },
    review: {
      status: ({ core, st, day }) => `总部评审还有 ${Math.max(0, Number(st.data.reviewDay) - day)} 天，这两周的出勤和表现都算数（目前表现 ${officeJob(core)?.performance ?? 0}/100）。`,
      daily: (c) => {
        const j = officeJob(c.core);
        if (!j) return 'end:left';
        return c.day < Number(c.st.data.reviewDay) ? null : reviewVerdict(c, j);
      },
      talk: ({ core, st }, npc) => {
        const j = officeJob(core);
        if (!j) return null;
        const slipped = j.lates > Number(st.data.lates0) || j.absences > Number(st.data.absences0);
        if (npc === 'raymond') return slipped ? '这种时候你还迟到缺勤？总部的人可都看在眼里。' : '还有几天总部就来了。这两周你做得不错。';
        if (npc === 'kiki') return st.data.west ? '韦斯特这几天心情很好。你知道为什么吗？' : '雷蒙德这两周每天第一个到公司，最后一个走。';
        return null;
      },
    },
  },
  endings: {
    raymond: {
      important: true,
      text: ({ st }) => {
        const side = st.data.final;
        if (side === 'raymond') return st.data.clean ? '总部选了雷蒙德做新部门的总监。他批给你 1,500 G 的奖金，还说下一次升职不会让你等那么久。' : '总部选了雷蒙德做新部门的总监。他给你批了 500 G 的奖金——这两周的迟到和缺勤，他也都记着。';
        if (side === 'west' || side === 'double') return '总部还是选了雷蒙德。琪琪悄悄告诉你：谈话时谁说了什么，雷蒙德全都知道了。';
        return '总部选了雷蒙德做新部门的总监。';
      },
      apply: ({ core, st }) => {
        const j = officeJob(core);
        const side = st.data.final;
        if (side === 'raymond') {
          const bonus = st.data.clean ? G(1500) : G(500);
          core.economy.receive('bank', bonus, 'bonus', '部门合并评审奖金', 'harbor_logistics');
          if (st.data.clean && j) j.fastTrack = 'raymond';
          core.social.applyDirect('raymond', { kind: 'stood_by_me', facets: { support: 0.8, reliability: 0.5 }, importance: 30 });
          core.social.applyDelta('raymond', { trust: 4, affection: 3 });
        } else if (side === 'west' || side === 'double') {
          raymondLearns(core, side === 'double');
          if (j) j.performance = Math.max(0, j.performance - 8);
        } else core.social.applyDelta('raymond', { affection: 2 });
        core.state.npcs.raymond.mood = Math.min(100, core.state.npcs.raymond.mood + 20);
      },
    },
    west: {
      important: true,
      text: ({ st }) => {
        const side = st.data.final;
        if (side === 'west' || side === 'double') return '总部选了韦斯特。他让人给你发了 2,000 G 的奖金，说下一次升职他会替你说话。雷蒙德还是你的直属上司，可他已经不怎么跟你说话了。';
        if (side === 'raymond') return '总部选了韦斯特，雷蒙德只管原来那一摊。那天下班，他请你喝了一杯，什么也没多说。';
        return '总部选了韦斯特做新部门的总监，雷蒙德只管原来那一摊。';
      },
      apply: ({ core, st }) => {
        const j = officeJob(core);
        const side = st.data.final;
        if (side === 'west' || side === 'double') {
          core.economy.receive('bank', G(2000), 'bonus', '部门合并评审奖金（韦斯特）', 'harbor_logistics');
          if (j) j.fastTrack = 'west';
          raymondLearns(core, side === 'double');
        } else if (side === 'raymond') {
          core.social.applyDirect('raymond', { kind: 'stood_by_me', facets: { support: 0.8, reliability: 0.5 }, importance: 30 });
          core.social.applyDelta('raymond', { affection: 5, trust: 4 });
        }
        core.state.npcs.raymond.mood = Math.max(-100, core.state.npcs.raymond.mood - 25);
      },
    },
    left: { important: false, text: () => '你离开了灰港物流，部门合并的事与你无关了。' },
  },
};

// ---------------------------------------------------------------- Old Zhou's story

/** The player has walked into the casino since a moment in time (a visit that began after it). */
export function casinoSince(core: GameCore, at: number): boolean {
  const cs = core.state.casino;
  return (cs.session !== null && cs.session.start > at) || cs.stats.sessions.some((x) => x.start > at);
}

const OLDZHOU_STORY: ArcDef = {
  id: 'oldzhou_story',
  title: '周伯的旧事',
  cooldownDays: 60,
  trigger: (core) => {
    if (!knows(core, 'oldzhou') || core.state.casino.bannedUntil > core.now()) return null;
    const heavy = core.casino.recentHours(7) >= 10 || core.casino.netLast(7) <= -G(3000);
    return heavy && core.social.rel('oldzhou').affection >= 0 ? {} : null;
  },
  chance: 0.3,
  start: () => 'tea',
  stages: {
    tea: {
      status: () => '周伯听说你常去赌场，想请你喝茶。',
      enter: ({ core }) => {
        core.phone.send('oldzhou', name('oldzhou'), '年轻人，码头上的人说你这阵子天天往赌场跑。有空到公园棋桌这边坐坐，我请你喝茶，跟你讲个老头子的故事。', [
          act('oldzhou_story', 'tea', 'listen', '去听听他想说什么'),
          act('oldzhou_story', 'tea', 'fine', '我心里有数'),
        ]);
      },
      choose: ({ core }, choice) => {
        if (choice === 'fine') {
          core.social.applyDelta('oldzhou', { affection: -2 });
          return { text: '「……那你保重。」', next: 'end:dismissed' };
        }
        return { text: '你回他说，这就过去。', next: 'story' };
      },
      daily: ({ day, st }) => (day - st.since >= 5 ? 'end:dismissed' : null),
      talk: (_c, npc) => (npc === 'oldzhou' ? '来啦？我给你发的消息看了没有？' : null),
    },
    story: {
      status: () => '周伯讲了他三十年前的事，想让你答应他一件事。',
      enter: ({ core }) => {
        core.phone.send(
          'oldzhou',
          name('oldzhou'),
          '三十二年前，我也觉得自己有一套。第一年赢了一辆摩托，第二年把房子押了进去，第三年你周婶带着孩子回了娘家。我在码头又扛了二十年货，才把债还清。孩子结婚那天，没有请我。……我不是要教训你，就想请你答应我一件事：这个礼拜，一次也别进那扇门。要是觉得一个礼拜不够，就去找赌场签一份自我限制，让他们替你拦着。',
          [act('oldzhou_story', 'story', 'week', '好，这个礼拜我不去'), act('oldzhou_story', 'story', 'limit', '我去找赌场签自我限制'), act('oldzhou_story', 'story', 'no', '我做不到')],
        );
      },
      choose: ({ core }, choice) => {
        if (choice === 'no') {
          core.social.applyDelta('oldzhou', { affection: -3, trust: -2 });
          return { text: '「……我知道。我当年也是这么说的。」', next: 'end:refused' };
        }
        core.social.applyDirect('oldzhou', { kind: 'promised_casino', facets: { honesty: 0.3, reliability: 0.3 }, importance: 14 });
        if (choice === 'limit') return { text: '你说你会去找赌场的客户经理签自我限制。', next: 'limit' };
        return { text: '「好。一个礼拜，我记着。」', next: 'week' };
      },
      daily: ({ day, st }) => (day - st.since >= 5 ? 'end:dismissed' : null),
      talk: (_c, npc) => (npc === 'oldzhou' ? '我的事，你都听到了。我不逼你，你自己想。' : null),
    },
    limit: {
      status: ({ st, day }) => `你答应周伯去找赌场签自我限制（客户经理维克多那里可以办，还有 ${Math.max(0, 3 - (day - st.since))} 天）。`,
      // not signed within three days: then it is the week's promise after all
      daily: ({ core, day, st }) => (core.state.casino.bannedUntil > core.now() ? 'end:excluded' : day - st.since >= 3 ? 'week' : null),
      talk: (_c, npc) => (npc === 'oldzhou' ? '签了没有？签了我请你吃饭。' : null),
    },
    week: {
      status: ({ st, day }) => `你答应周伯这个礼拜不进赌场（还剩 ${Math.max(0, 7 - (day - st.since))} 天）。`,
      enter: ({ core, st }) => {
        st.data.at = core.now();
      },
      daily: ({ core, day, st }) => {
        if (core.state.casino.bannedUntil > core.now()) return 'end:excluded';
        if (casinoSince(core, Number(st.data.at))) return 'end:broken';
        return day - st.since >= 7 ? 'end:kept' : null;
      },
      talk: ({ st, day }, npc) => (npc === 'oldzhou' ? `还有 ${Math.max(1, 7 - (day - st.since))} 天。手痒吧？痒就来下棋。` : null),
    },
  },
  endings: {
    kept: {
      important: true,
      text: () => '整整一个礼拜，你没有去赌场。周伯在棋桌边泡了一壶好茶，说三十年前要是有人这样拉他一把就好了。',
      apply: ({ core }) => {
        core.social.applyDirect('oldzhou', { kind: 'kept_promise', facets: { reliability: 0.8, honesty: 0.4 }, importance: 26 });
        core.social.applyDelta('oldzhou', { affection: 6, trust: 8, respect: 4 });
        core.player.addMoodBuff('oldzhou_tea', 8, 3 * 1440, '周伯的一壶茶');
        core.phone.send('oldzhou', name('oldzhou'), '一个礼拜。好样的。明天上午棋桌见，我让你三步。');
      },
    },
    excluded: {
      important: true,
      text: () => '你在赌场签了自我限制。周伯听说以后，在棋桌边坐了很久，然后请你吃了一碗面。',
      apply: ({ core }) => {
        core.social.applyDirect('oldzhou', { kind: 'kept_promise', facets: { reliability: 0.9, honesty: 0.5 }, importance: 32 });
        core.social.applyDelta('oldzhou', { affection: 10, trust: 10, respect: 6 });
        core.player.addMoodBuff('oldzhou_tea', 10, 5 * 1440, '周伯请的那碗面');
        core.phone.send('oldzhou', name('oldzhou'), '我听说了。这比什么都难。有空来下棋，面我请。');
      },
    },
    broken: {
      important: true,
      text: () => '你答应周伯一个礼拜不去赌场，还是去了。他什么也没说，只是下棋的时候不再叫你了。',
      apply: ({ core }) => {
        core.social.applyDirect('oldzhou', { kind: 'broke_promise', facets: { unreliability: 0.7, deceit: 0.3 }, importance: 30 }, { source: 'told' });
        core.social.applyDelta('oldzhou', { trust: -8, affection: -4 });
      },
    },
    refused: { important: false, text: () => '周伯想让你答应他一个礼拜不去赌场，你没有答应。' },
    dismissed: { important: false, text: () => '周伯请你去喝茶，你没有去。' },
  },
};

export const ARCS: Record<string, ArcDef> = { marco_debt: MARCO_DEBT, daniel_stall: DANIEL_STALL, maple_sale: MAPLE_SALE, office_review: OFFICE_REVIEW, oldzhou_story: OLDZHOU_STORY };

export class StorySystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.stories;
  }

  active(arc: string): StoryState | undefined {
    return this.s.active.find((x) => x.arc === arc);
  }

  /** Running storylines for the journal. */
  summaries(): { arc: string; title: string; status: string; days: number }[] {
    const day = this.core.today();
    return this.s.active.map((st) => {
      const def = ARCS[st.arc];
      const status = def?.stages[st.stage]?.status?.({ core: this.core, st, day }) ?? '';
      return { arc: st.arc, title: def?.title ?? st.arc, status, days: day - st.started };
    });
  }

  /** What this person says in passing about a storyline they are part of (at most one). */
  talk(npc: string): string | null {
    const day = this.core.today();
    for (const st of this.s.active) {
      const line = ARCS[st.arc]?.stages[st.stage]?.talk?.({ core: this.core, st, day }, npc);
      if (line) return line;
    }
    return null;
  }

  /** Once a day: advance running storylines, then perhaps begin a new one. */
  dailyPass(): void {
    const day = this.core.today();
    for (const st of [...this.s.active]) {
      const def = ARCS[st.arc];
      const stage = def?.stages[st.stage];
      if (!def || !stage) {
        this.s.active = this.s.active.filter((x) => x !== st);
        continue;
      }
      const next = stage.daily?.({ core: this.core, st, day }) ?? null;
      if (next) this.goto(st, next);
    }
    for (const def of Object.values(ARCS)) {
      if (this.active(def.id)) continue;
      if (def.once && this.s.done.some((d) => d.arc === def.id)) continue;
      const last = this.s.ended[def.id];
      if (last !== undefined && day - last < def.cooldownDays) continue;
      const data = def.trigger(this.core);
      if (!data || !this.core.rng.chance(def.chance)) continue;
      this.begin(def.id, data);
    }
  }

  begin(arc: string, data: Record<string, number | string | boolean> = {}): StoryState {
    const def = ARCS[arc];
    const day = this.core.today();
    const st: StoryState = { arc, stage: '', since: day, started: day, data: { ...data } };
    this.s.active.push(st);
    this.goto(st, def.start(data));
    return st;
  }

  private goto(st: StoryState, next: string): void {
    const def = ARCS[st.arc];
    const day = this.core.today();
    if (next.startsWith('end:')) {
      const ending = next.slice(4);
      const e = def.endings[ending];
      const ctx = { core: this.core, st, day };
      e?.apply?.(ctx);
      this.core.journal.add('event', `【${def.title}】${e ? e.text(ctx) : ending}`, e?.important ?? false);
      this.s.active = this.s.active.filter((x) => x !== st);
      this.s.done.push({ arc: st.arc, ending, day });
      if (this.s.done.length > 60) this.s.done.shift();
      this.s.ended[st.arc] = day;
      this.core.touch();
      return;
    }
    st.stage = next;
    st.since = day;
    def.stages[next]?.enter?.({ core: this.core, st, day });
    this.core.touch();
  }

  /** A phone answer: `story:<arc>:<stage>.<choice>`. Answers to a stage that has passed do nothing. */
  choose(arc: string, stageChoice: string): { text: string; resolve?: boolean } {
    const st = this.active(arc);
    const [stage, choice] = stageChoice.split('.');
    if (!st || st.stage !== stage) return { text: '这件事已经过去了。' };
    const def = ARCS[arc];
    const r = def.stages[stage]?.choose?.({ core: this.core, st, day: this.core.today() }, choice);
    if (!r) return { text: '' };
    if (r.next) this.goto(st, r.next);
    this.core.touch();
    return { text: r.text, resolve: r.keep ? false : undefined };
  }
}
