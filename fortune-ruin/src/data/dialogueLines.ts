import type { Traits } from './npcs';

/**
 * Parameterised reaction lines. The relationship model decides *what* an NPC
 * feels; these templates only decide *how they say it*. A line is picked by
 * matching the NPC's attitude profile (derived from traits + relationship).
 */
export type Attitude = 'enthusiast' | 'opportunist' | 'disapprover' | 'snob' | 'envious' | 'prudent' | 'caring' | 'neutral' | 'professional';

export function attitudeFor(t: Traits, affection: number, role?: string): Attitude[] {
  const out: Attitude[] = [];
  if (role === 'casino_host' || role === 'dealer' || role === 'security' || role === 'banker') out.push('professional');
  if (t.envy > 0.55 && affection < 30) out.push('envious');
  if (t.classConscious > 0.75) out.push('snob');
  if (t.gamblingView > 0.4) out.push('enthusiast');
  if (t.opportunism > 0.55) out.push('opportunist');
  if (t.gamblingView < -0.3 && t.empathy > 0.6 && affection > 20) out.push('caring');
  if (t.gamblingView < -0.3) out.push('disapprover');
  if (t.prudence > 0.8) out.push('prudent');
  if (t.empathy > 0.65 && affection > 25) out.push('caring');
  out.push('neutral');
  return out;
}

/** {src} = "我听丹尼尔说" / "我那天看见" etc., {amount}, {game}, {item}, {title}, {name} */
export const FACT_LINES: Record<string, Partial<Record<Attitude, string[]>>> = {
  big_win: {
    enthusiast: ['{src}你在{game}上赢了 {amount}！好家伙，今晚跟我一起去？', '{src}你赢了 {amount}？手感来了就别停！'],
    opportunist: ['{src}你最近手气超好？赢了 {amount}？那你得请客呀~', '哇，{src}你一晚上赢了 {amount}！你现在可是有钱人了。'],
    snob: ['{src}你在大厅的赌桌上……相当引人注目。', '在赌桌上赢钱，可算不上什么成就。'],
    envious: ['{src}你赢了 {amount}……运气真好啊。有的人就是走运。', '哦，赌神来了。'],
    caring: ['{src}你在赌场赢了 {amount}。我知道你可能很高兴……只是，别让它变成习惯，好吗？'],
    disapprover: ['{src}你在赌场赢了钱。你知道它迟早会拿回去的。', '我听说了赌场的事。……我不想多说。'],
    prudent: ['{src}你有一笔意外之财？建议先别动它，至少别再拿回赌桌上。'],
    professional: ['恭喜您最近的好成绩。', '听说您前几天手气很好。'],
    neutral: ['{src}你最近赢了一笔？', '嘿，听说你在赌场赢了 {amount}，真的假的？'],
  },
  big_loss: {
    enthusiast: ['{src}你输了 {amount}？哎，正常，明天就翻回来了！', '输了就输了，下次跟着我的系统走！'],
    opportunist: ['{src}你最近手头不太宽裕？', '哦……听说你最近不太顺。'],
    snob: ['我听说了一些……不太体面的传闻。', '我希望你知道自己在做什么。'],
    envious: ['{src}你输了 {amount}。……也好，人不能总是那么顺。'],
    caring: ['{src}你在赌场输了不少……你还好吗？想聊聊吗？', '我听说了。不管怎样，我都在。'],
    disapprover: ['{src}你在赌场输了 {amount}。我早就说过那个地方不是好去处。', '你输掉的不只是钱，你知道吗？'],
    prudent: ['{src}你最近亏了一大笔。要不要坐下来，把你的预算重新过一遍？'],
    professional: ['最近似乎不太顺利。需要的话，可以休息一阵子。'],
    neutral: ['{src}你在赌场输了 {amount}？', '听说你最近手气不好。'],
  },
  flashy_purchase: {
    opportunist: ['哇！{item}！你也太有品味了吧！', '{src}你买了{item}？下次带我一起去！'],
    snob: ['新买的{item}？……嗯。', '有些东西，不是买来就能拥有的。'],
    envious: ['{item}啊……真舍得。', '有钱真好。'],
    prudent: ['{item}？这么大一笔开销，你想清楚了吗？'],
    caring: ['{src}你买了{item}。你开心就好，只是……别勉强自己。'],
    neutral: ['{src}你买了{item}？挺厉害的。'],
  },
  promotion: {
    envious: ['恭喜……升职了啊。', '升职了？好吧，你一向会讨老板欢心。'],
    opportunist: ['升职了！以后多罩着我呀~'],
    prudent: ['恭喜升职！收入提高的时候，最适合提高储蓄率。'],
    snob: ['听说你升职了。不错。'],
    caring: ['恭喜你！你值得这个。'],
    neutral: ['{src}你升职了？恭喜！'],
  },
  fired: {
    caring: ['{src}你工作的事了……需要帮忙吗？', '丢了工作不是世界末日，你会找到更好的。'],
    opportunist: ['啊……那你现在怎么办？'],
    snob: ['……真遗憾。'],
    envious: ['{src}你被炒了？……唉，世事难料。'],
    prudent: ['先算一下你的应急金能撑几个月，然后马上开始找工作。'],
    neutral: ['{src}你丢了工作，是真的吗？'],
  },
  evicted: {
    caring: ['{src}你搬出公寓了……为什么不早点告诉我？', '如果需要地方落脚，跟我说。'],
    opportunist: ['哦……{src}你搬去码头那边了？'],
    snob: ['……'],
    prudent: ['欠租会影响你很久的信用记录。我们得想办法把它还清。'],
    neutral: ['{src}你被赶出公寓了？'],
  },
  moved: {
    opportunist: ['{src}你搬新家了？什么时候开派对呀！'],
    snob: ['{src}你搬到了新的住处。'],
    envious: ['新家很大吧……'],
    neutral: ['{src}你搬家了？恭喜！'],
  },
  lied: {
    caring: ['你上次跟我说的……不是真的，对吧？我宁愿你直接告诉我。'],
    disapprover: ['你骗了我。'],
    neutral: ['我不知道你说的话还能不能信。', '你上次说的，和我听到的不一样。'],
  },
  missed_party: {
    caring: ['那天你说会来的……没事，我只是有点失望。'],
    neutral: ['你那天没来。', '我们等了你很久。'],
  },
  refused_help: {
    caring: ['上次的事……我理解，你也有你的难处。'],
    neutral: ['上次我开口找你帮忙，你拒绝了。……算了。'],
  },
  lent_money: {
    caring: ['那次你借钱给我，我一直记着。谢谢你。'],
    neutral: ['你借给我的钱，我会还的。'],
  },
  outburst: {
    caring: ['你那天发火的样子吓到我了。你最近压力是不是太大了？'],
    neutral: ['你那天怎么了？', '你上次真的很过分。'],
  },
  angry_at_me: {
    caring: ['你上次冲我发火……我知道你不是故意的，但我很难过。'],
    neutral: ['你上次的态度，我还记着。'],
  },
  drunk_scene: {
    caring: ['你那天喝太多了，我很担心你。'],
    snob: ['在公共场合喝成那样……'],
    neutral: ['你那天喝得烂醉。'],
  },
  vip_upgrade: {
    professional: ['欢迎成为我们的 {tier} 会员。'],
    opportunist: ['{src}你成了赌场的 VIP？好厉害！'],
    disapprover: ['{src}你成了赌场的贵宾……这不是什么值得骄傲的事。'],
    neutral: ['{src}你在赌场成了会员？'],
  },
  helped: {
    caring: ['你上次帮我，我真的很感激。'],
    neutral: ['谢谢你之前帮了我。'],
  },
  debt_unpaid: {
    caring: ['那笔钱……我不是要催你，但我最近也挺难的。'],
    neutral: ['你欠我的钱什么时候还？', '借钱的事，你是不是忘了？'],
  },
  repaid: {
    neutral: ['谢谢你按时还钱，说到做到。'],
  },
  attended_party: {
    neutral: ['谢谢你那天能来，大家都很开心。'],
  },
  pawned: {
    caring: ['{src}你去了福来当铺……把{item}当了？手头要是紧，跟我说一声。', '{src}你进了当铺。别一个人硬撑。'],
    opportunist: ['{src}你把{item}当了？……哦。'],
    snob: ['当铺……我还以为只有老城区的人才去那种地方。'],
    envious: ['{src}你把{item}当掉了。……谁都有难的时候。'],
    prudent: ['当铺的综合费算下来一年超过一倍。能赎就早点赎回来。'],
    disapprover: ['{src}你去当铺了。是不是又是因为赌场？'],
    neutral: ['{src}你从当铺出来。还好吗？'],
  },
  volunteered: {
    caring: ['{src}你在食堂帮忙打饭。你人真好。', '食堂的阿姨说你干活很利索。下次叫上我。'],
    snob: ['{src}你在社区食堂做义工？……真是意外。'],
    opportunist: ['做义工啊？挺好的，挺好的。'],
    envious: ['{src}你去食堂帮忙了。……你还挺会做人的。'],
    neutral: ['{src}你在社区食堂帮忙？挺好的。'],
  },
  donated_kitchen: {
    caring: ['{src}你给食堂捐了钱。那里很需要。谢谢你。'],
    snob: ['捐给社区食堂？嗯，不错的姿态。'],
    opportunist: ['{src}你一出手就捐了 {amount}？大方！'],
    prudent: ['{src}你捐了 {amount}。量力而行就好。'],
    neutral: ['{src}你给食堂捐了 {amount}。了不起。'],
  },
  free_meal_rich: {
    caring: ['{src}你去食堂领免费的饭……你是不是遇到什么事了？'],
    snob: ['{src}你去领救济饭。我不明白你在想什么。'],
    envious: ['穿成那样去领免费的饭？真有你的。'],
    disapprover: ['那些饭是给吃不上饭的人的。', '{src}你在食堂排队领饭。你不缺那一顿吧？'],
    neutral: ['{src}你在社区食堂领饭？'],
  },
  outbid_me: {
    snob: ['上次那件{item}，你举牌举得很果断。拍卖会上的你，倒有几分气度。'],
    envious: ['那件{item}本来应该是我的。', '你上次在拍卖会上可真舍得。'],
    opportunist: ['下次拍卖会我们商量着来嘛，别互相抬价~'],
    prudent: ['你拍下的那件{item}，价格已经超过估价了。收藏要有耐心。'],
    neutral: ['上次的{item}，你出价出得真狠。'],
  },
  day_labor: {
    caring: ['{src}你在码头扛货？别把腰累坏了。'],
    snob: ['{src}你在码头做苦力……'],
    prudent: ['打零工也是正经收入。不过别耽误了找份长久的工作。'],
    neutral: ['{src}你在 7 号码头卸货？挺能吃苦啊。'],
  },
};

/** Comments on the player's visible state. */
export const STATE_LINES: Record<string, Partial<Record<Attitude, string[]>>> = {
  drunk: {
    caring: ['你喝了多少？来，喝点水。', '你今天喝太多了，我送你回去吧？'],
    snob: ['……你喝醉了。', '恕我直言，你现在的状态不太适合交谈。'],
    enthusiast: ['哈！今晚喝得很尽兴嘛！'],
    neutral: ['你喝多了吧？', '你身上全是酒味。'],
  },
  exhausted: {
    caring: ['你看起来好几天没睡了，快回去休息吧。'],
    neutral: ['你脸色很差。', '你看起来累坏了。'],
  },
  stressed: {
    caring: ['你看起来压力很大……有什么心事吗？'],
    neutral: ['你还好吗？看起来很紧绷。'],
  },
  sharp: {
    opportunist: ['哇，今天穿得好有气场！', '这身衣服太适合你了！'],
    snob: ['今天的着装很得体。'],
    neutral: ['今天穿得挺精神啊。'],
  },
  shabby_upscale: {
    snob: ['……你确定走对地方了吗？', '这里的着装要求，你可能需要了解一下。'],
    opportunist: ['你今天……挺随意的嘛。'],
    neutral: ['你穿这样来这儿啊？'],
  },
  hungry: {
    caring: ['你吃饭了吗？脸色不太好。'],
    neutral: ['你是不是饿了？'],
  },
  late_casino: {
    caring: ['这么晚了还在这里？', '天都快亮了，该回去了吧？'],
    professional: ['夜深了，需要我帮您叫车吗？'],
    enthusiast: ['夜还长着呢！'],
    neutral: ['这么晚还没走啊。'],
  },
};

/** Responses when the player talks about themselves. */
export const SHARE_REACTIONS: Record<string, Partial<Record<Attitude, string[]>>> = {
  brag: {
    opportunist: ['真的吗？！那你得带我见见世面！', '哇，你现在可是大人物了~'],
    snob: ['在这里谈论自己的财产，是很不体面的。', '……原来如此。'],
    enthusiast: ['这才对嘛！钱就是用来赢的！'],
    envious: ['……哦，是吗。', '了不起。'],
    disapprover: ['钱来得快，去得也快。', '你不需要用这些来证明自己。'],
    prudent: ['听起来不错。这些钱你打算怎么配置？'],
    caring: ['你开心我就开心，但别太得意忘形哦。'],
    neutral: ['挺好的。'],
  },
  admit_trouble: {
    caring: ['谢谢你愿意告诉我。我们一起想办法。', '需要帮忙就说，别一个人扛着。'],
    opportunist: ['啊……这样啊。', '那……你多保重。'],
    snob: ['这种事最好不要在公开场合讨论。'],
    prudent: ['先把所有负债列出来，按利率从高到低还。'],
    enthusiast: ['嘿，谁没低谷过？手气会回来的。'],
    neutral: ['会好起来的。'],
  },
  quit_gambling: {
    caring: ['真的吗？我真为你高兴。', '这是我今年听到最好的消息。'],
    disapprover: ['但愿你说到做到。'],
    enthusiast: ['什么？别啊！你走了谁陪我玩？'],
    professional: ['理解。如果您需要，赌场也提供自我限制服务。'],
    neutral: ['挺好的。'],
  },
  work_good: {
    prudent: ['稳定的收入是一切的基础。'],
    envious: ['……真好啊。'],
    caring: ['太好了！'],
    neutral: ['不错嘛。'],
  },
};

export const ADVICE_EXTRA: Record<string, { skill?: 'finance' | 'cards' | 'work' | 'social'; amount?: number; calm?: number }> = {
  sophia: { skill: 'finance', amount: 2.2 },
  grace: { skill: 'finance', amount: 1.2 },
  natasha: { skill: 'cards', amount: 2 },
  raymond: { skill: 'work', amount: 1 },
  isabella: { skill: 'social', amount: 0.8 },
  lillian: { skill: 'social', amount: 1 },
  oldzhou: { calm: 12 },
  eileen: { calm: 6 },
  daniel: { calm: 6 },
  victor: { skill: 'cards', amount: 0.6 },
  alexander: { skill: 'social', amount: 1.2 },
  ben: { calm: 5 },
  margaret: {},
  kiki: {},
  marco: {},
  tommy: { calm: 4 },
  jack: {},
};

export const GENERIC_SMALL: string[] = [
  '最近天气怪怪的，一会儿下雨一会儿出太阳。',
  '你听说了吗？码头那边要建新的游轮码头。',
  '灰港的夜景，看多少次都不会腻。',
  '物价又涨了，连杯咖啡都要五块多了。',
  '周末河边好像有集市。',
];
