import { G, type Money } from '../core/money';

/** Who the player character is interested in (chosen at character creation). */
export type Interest = 'men' | 'women' | 'all' | 'none';

export const INTERESTS: [Interest, string][] = [
  ['women', '女性'],
  ['men', '男性'],
  ['all', '不限'],
  ['none', '暂不考虑'],
];

/** Where a date can happen and what the evening costs (the one who asked pays). */
export const DATE_VENUES: Record<string, { what: string; cost: Money; spot: string | null }> = {
  cafe: { what: '在 Harbor Bean 喝咖啡', cost: G(14), spot: 'cafe_window' },
  bar: { what: '在 Rusty Anchor 喝一杯', cost: G(45), spot: 'bar_table2' },
  restaurant: { what: "在 Marlow's 吃晚饭", cost: G(85), spot: 'rest_table2' },
  fine_dining: { what: '在 Lumière 吃法餐', cost: G(620), spot: 'fd_table2' },
  club: { what: '在子午线会所的露台喝酒', cost: G(240), spot: 'club_lounge2' },
};

export interface RomanceDef {
  /** the pronouns of people they can fall for */
  likes: ('he' | 'she' | 'they')[];
  /** preferred date venues, first is the favourite */
  venues: string[];
  askYes: string[];
  askNo: string[];
  confessYes: string;
  confessNo: string;
  /** when they end it */
  leave: string;
  /** after a long silence */
  distant: string;
  /** an occasional good-morning message */
  morning: string[];
}

/**
 * The adults in Greyhaven who might fall for the player. Hosts, dealers,
 * security, the landlady and the boss keep it professional.
 */
export const ROMANCE: Record<string, RomanceDef> = {
  eileen: {
    likes: ['he', 'they'],
    venues: ['restaurant', 'bar'],
    askYes: ['……好啊。不过我请你别带我去赌场。', '明天晚上？我下班就过去。'],
    askNo: ['你是个很好的人，但我现在只想把你当朋友。', '抱歉……我还没准备好。'],
    confessYes: '我还以为要等你开口等到明年。……我也喜欢你。',
    confessNo: '和你在一起很开心，可是我需要再想想。别生气，好吗？',
    leave: '我们分开吧。我爸那样的日子，我不想再过一遍。',
    distant: '你最近都不回消息……我们是不是该好好谈谈？',
    morning: ['早！今天第一杯拿铁拉了个心形，可惜你没看到。', '起床了没？外面下小雨，记得带伞。'],
  },
  alexander: {
    likes: ['she', 'he', 'they'],
    venues: ['fine_dining', 'club'],
    askYes: ['有意思。Lumière 明晚有空位，我让他们留张靠窗的桌子。', '我很少被人约。好，明天晚上。'],
    askNo: ['你很有趣，但我们的世界不太一样。', '抱歉，最近家里在安排一些……事情。'],
    confessYes: '我身边的人大多想要点什么。你不一样。……好，我们试试。',
    confessNo: '我需要时间。别误会，这不是拒绝。',
    leave: '我想我们到此为止吧。不是你的问题——好吧，也许有一点。',
    distant: '你这段时间去哪了？我不习惯被冷落。',
    morning: ['游艇俱乐部今天风很好。下次带你出海。'],
  },
  sophia: {
    likes: ['he', 'they'],
    venues: ['fine_dining', 'restaurant'],
    askYes: ['我一般不和客户吃饭……不过你不算客户。明晚七点半。', '好。我会订位置。'],
    askNo: ['我很欣赏你，但我分得清工作和生活。', '现在不是好时机，我手上有三个大项目。'],
    confessYes: '我做了一张表，把所有理由都列了出来。最后一栏写的是：我喜欢你。',
    confessNo: '我需要更多数据。……我是认真的，再给我一点时间。',
    leave: '我们的方向不一样。与其等到更糟，不如现在止损。',
    distant: '你最近很忙？我不喜欢猜。',
    morning: ['早安。今天市场开盘不错，你也是。'],
  },
  daniel: {
    likes: ['she', 'he', 'they'],
    venues: ['bar', 'restaurant'],
    askYes: ['……你是说那种约会？行啊。明晚老地方，我请——不对，你约的，你请。', '我等这句话等了好几年了。明天晚上见。'],
    askNo: ['我们是哥们儿啊。别搞得这么奇怪。', '我……还是当朋友吧。别往心里去。'],
    confessYes: '你知道我从中学就……算了，这种话我说不好。我也是。',
    confessNo: '再给我点时间，我脑子有点乱。',
    leave: '我受不了了。你每次都说下次不去赌场，每次都去。我们分开吧。',
    distant: '喂，你人呢？发消息也不回，我还以为你出事了。',
    morning: ['早。车行今天来了辆老爷车，你绝对喜欢。'],
  },
  kiki: {
    likes: ['he', 'she'],
    venues: ['bar', 'restaurant', 'cafe'],
    askYes: ['哇真的假的？！好呀好呀，明晚！我要穿新买的裙子～', '你终于开口啦！明天晚上见～'],
    askNo: ['诶……我们还是当好同事吧！', '不好意思啦，我最近在和别人聊。'],
    confessYes: '我早就跟伊莎贝拉说过你喜欢我！……好啦，我也喜欢你。',
    confessNo: '太突然了啦！让我想想嘛。',
    leave: '我觉得我们不太合适……你也不会怪我吧？',
    distant: '你是不是把我忘了？已读不回很伤人的！',
    morning: ['早安～今天也要开开心心！', '老板今天心情好像不错，可以摸鱼了（不是）'],
  },
  isabella: {
    likes: ['she', 'they'],
    venues: ['fine_dining', 'bar'],
    askYes: ['穿得体面点。明晚七点半。', '我很挑剔的。不过可以，明天晚上。'],
    askNo: ['你的心意我收到了。但不是现在。', '我们更适合当朋友。'],
    confessYes: '我一直在等你开口。看来我眼光没错。',
    confessNo: '我需要确定这不是一时冲动。',
    leave: '我们走到头了。我不喜欢拖泥带水。',
    distant: '最近见不到你。我不太习惯等人。',
    morning: ['新一季的面料到了，有一块颜色很像你。'],
  },
  grace: {
    likes: ['he', 'she', 'they'],
    venues: ['restaurant', 'cafe'],
    askYes: ['……好。明天晚上，我下班以后。', '我很少约会。但我想试试。'],
    askNo: ['谢谢你。不过我更希望我们保持现在这样。', '抱歉，我觉得不太合适。'],
    confessYes: '我相信承诺。你说出口了，我也愿意。',
    confessNo: '我需要更确定一点。别急，好吗？',
    leave: '我需要一个我能信任的人。对不起。',
    distant: '你很久没联系我了。我需要知道你还在不在意。',
    morning: ['早。今天柜台人很多，晚上想见你。'],
  },
  tommy: {
    likes: ['he', 'she', 'they'],
    venues: ['bar', 'cafe'],
    askYes: ['我休息那天？好啊，我给你弹首新写的歌。', '哈，你认真的？那就明晚。'],
    askNo: ['我现在一心只想着录专辑……抱歉。', '我们还是朋友吧，好吗？'],
    confessYes: '我那首新歌其实是写给你的。你没听出来吧？',
    confessNo: '让我想想……我怕搞砸。',
    leave: '我觉得我们想要的东西不一样。对不起。',
    distant: '这几天没见你来酒吧。你还好吗？',
    morning: ['昨晚写到三点，副歌终于顺了。想第一个弹给你听。'],
  },
  lillian: {
    likes: ['he'],
    venues: ['fine_dining', 'club'],
    askYes: ['亲爱的，你很大胆。我喜欢。明晚，Lumière。', '好啊。别让我失望。'],
    askNo: ['你很可爱。但我习惯了另一种生活。', '谢谢你的邀请。不过不必了。'],
    confessYes: '我以为我这个年纪不会再听到这种话了。……好。',
    confessNo: '让我想想。我不年轻了，不想再犯错。',
    leave: '我想我们都清楚，这段关系该结束了。',
    distant: '我不喜欢被冷落，亲爱的。',
    morning: ['庄园的玫瑰开了。你该来看看。'],
  },
};
