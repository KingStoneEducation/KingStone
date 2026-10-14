import { G, type Money } from '../core/money';
import { hm } from '../core/calendar';
import type { RelDims, Relationship } from '../core/state';

/**
 * Personality traits drive how every NPC appraises events. Dialogue lines are
 * kept separate (voice) so the relationship model is independent of text.
 */
export interface Traits {
  /** how much wealth shapes their regard (0..1) */
  materialism: number;
  /** values pedigree and manners; looks down on new money */
  classConscious: number;
  honesty: number;
  /** weight of shared history when things go badly */
  loyalty: number;
  empathy: number;
  /** -1 strongly disapproves of gambling … +1 loves it */
  gamblingView: number;
  /** respects financial discipline */
  prudence: number;
  envy: number;
  /** seeks to gain from relationships */
  opportunism: number;
  /** tendency to pass information on */
  gossip: number;
  /** reads people and appearances accurately, notices lies */
  perceptive: number;
  temper: number;
  sociability: number;
  pride: number;
}

export interface CharacterLook {
  skin: number;
  hair: number;
  hairColor: string;
  top: string;
  topShade: string;
  bottom: string;
  shoes: string;
  accent?: string;
  style: 'tee' | 'hoodie' | 'shirt' | 'suit' | 'dress' | 'gown' | 'jacket' | 'apron' | 'vest' | 'uniform';
  glasses?: boolean;
  beard?: boolean;
  earrings?: boolean;
  hat?: 'beanie' | 'cap' | null;
  body: 'm' | 'f';
}

export interface ScheduleBlock {
  days: number[];
  from: number;
  to: number;
  /** null = at home / somewhere private */
  loc: string | null;
  spot?: string;
  act: string;
  chance?: number;
}

export interface Voice {
  greetStranger: string[];
  greetAcquaint: string[];
  greetWarm: string[];
  greetCold: string[];
  farewell: string[];
  small: string[];
  happy: string[];
  stressed: string[];
  work: string[];
  giftLove: string[];
  giftDislike: string[];
  /** reaction when the player brags about money */
  onBrag: string[];
  /** reaction when the player admits financial trouble */
  onTrouble: string[];
  /** when asked for advice */
  advice: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  nameEn: string;
  age: number;
  occupation: string;
  district: string;
  look: CharacterLook;
  traits: Traits;
  bio: string;
  goal: string;
  moneyView: string;
  gamblingAttitude: string;
  startMoney: Money;
  income: Money;
  startDebt: Money;
  schedule: ScheduleBlock[];
  circle: string[];
  initial: Partial<RelDims> & Partial<Pick<Relationship, 'met' | 'knowsName' | 'status'>>;
  giftLikes: string[];
  giftDislikes: string[];
  voice: Voice;
  role?: 'casino_host' | 'landlord' | 'boss' | 'banker' | 'security' | 'dealer' | 'friend';
}

const WD = [0, 1, 2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];

export const NPCS: NpcDef[] = [
  {
    id: 'eileen',
    name: '艾琳',
    nameEn: 'Eileen Hart',
    age: 26,
    occupation: 'Harbor Bean 咖啡馆咖啡师',
    district: '老城区',
    look: { skin: 1, hair: 4, hairColor: '#a24c2a', top: '#2f6b4f', topShade: '#22503b', bottom: '#3a3a46', shoes: '#4a2c20', accent: '#f2efe6', style: 'apron', body: 'f' },
    traits: { materialism: 0.1, classConscious: 0.05, honesty: 0.9, loyalty: 0.85, empathy: 0.8, gamblingView: -0.7, prudence: 0.7, envy: 0.15, opportunism: 0.05, gossip: 0.3, perceptive: 0.7, temper: 0.4, sociability: 0.6, pride: 0.5 },
    bio: '在老城区长大。十四岁那年，父亲把家里的积蓄输在了赌场，她从那以后就靠自己。',
    goal: '攒钱开一家属于自己的烘焙咖啡店。',
    moneyView: '钱够用就好，人比钱重要。',
    gamblingAttitude: '非常反感赌博，但不会因此看轻一个人——除非他骗她。',
    startMoney: G(5200),
    income: G(2300),
    startDebt: 0,
    schedule: [
      { days: WD, from: hm(6, 30), to: hm(15), loc: 'cafe', spot: 'cafe_counter', act: 'work' },
      { days: [0, 2], from: hm(16), to: hm(17, 30), loc: 'city', spot: 'riverwalk', act: 'exercise', chance: 0.8 },
      { days: [1, 3], from: hm(15, 30), to: hm(16, 30), loc: 'store', spot: 'store_aisle', act: 'shop', chance: 0.7 },
      { days: [4], from: hm(19, 30), to: hm(23, 30), loc: 'bar', spot: 'bar_table1', act: 'drink', chance: 0.8 },
      { days: [5], from: hm(8), to: hm(14), loc: 'cafe', spot: 'cafe_counter', act: 'work' },
      { days: [5], from: hm(15), to: hm(17, 30), loc: 'city', spot: 'park_bench1', act: 'leisure', chance: 0.6 },
      { days: [6], from: hm(10), to: hm(13), loc: 'city', spot: 'park_bench1', act: 'leisure', chance: 0.7 },
      { days: [6], from: hm(15), to: hm(17), loc: 'restaurant', spot: 'rest_table2', act: 'eat', chance: 0.4 },
      // Sunday lunch behind the serving line
      { days: [6], from: hm(11), to: hm(13, 30), loc: 'community_kitchen', spot: 'ck_line', act: 'volunteer', chance: 0.6 },
    ],
    circle: ['daniel', 'oldzhou', 'tommy', 'ben', 'margaret'],
    initial: { met: true, knowsName: true, affection: 14, trust: 10, respect: 8, familiarity: 24, status: 'acquaintance' },
    giftLikes: ['flowers', 'sweet', 'book', 'coffee'],
    giftDislikes: ['luxury'],
    role: 'friend',
    voice: {
      greetStranger: ['你好，要点单吗？', '嗨，第一次来？'],
      greetAcquaint: ['又见面啦，{name}。', '嗨，{name}，老样子？', '早，{name}。今天看起来还不错。'],
      greetWarm: ['{name}！正想着你呢。', '嘿，{name}，你来得正好，陪我聊两句。', '看到你真好，{name}。'],
      greetCold: ['……哦，是你。', '{name}。有事吗？', '嗯。'],
      farewell: ['回头见。', '照顾好自己。', '别太晚睡，{name}。'],
      small: ['早班最累的不是起床，是第一个客人还没醒就开始抱怨。', '我在试一个新的肉桂卷配方，哪天让你尝尝。', '周伯今天又赢了我一盘棋，他说我下棋太急。', '老城区的面包房要关门了，好可惜。'],
      happy: ['今天的营业额创了新高，老板说要给我加薪！', '我的存款终于过了一个小目标。'],
      stressed: ['最近有点累，房租又涨了。', '店里换了新机器，我还没摸透。'],
      work: ['咖啡讲究的是耐心，跟人一样。'],
      giftLove: ['哇……你怎么知道我喜欢这个？谢谢你。', '这个真的太好了，我会好好珍惜。'],
      giftDislike: ['这个太贵重了，我不能收……', '谢谢，不过你真的不用花这么多钱。'],
      onBrag: ['钱来得快，去得也快。你自己心里有数就好。', '恭喜……不过，是在赌场赢的吗？'],
      onTrouble: ['需要帮忙就说，别一个人硬撑。', '我没多少钱，但请你吃顿饭还是可以的。'],
      advice: ['我爸当年也说他「只是手气不好」。我只想说，别让桌子决定你是谁。', '把每天要花的钱写下来，你会吓一跳的。'],
    },
  },
  {
    id: 'victor',
    name: '维克多',
    nameEn: 'Victor Lang',
    age: 44,
    occupation: '灰港大赌场 VIP 客户经理',
    district: '市中心',
    look: { skin: 1, hair: 8, hairColor: '#4d4640', top: '#1c1c24', topShade: '#121218', bottom: '#15151b', shoes: '#0b0b0b', accent: '#b8202f', style: 'suit', body: 'm' },
    traits: { materialism: 0.9, classConscious: 0.4, honesty: 0.4, loyalty: 0.3, empathy: 0.25, gamblingView: 0.5, prudence: 0.6, envy: 0.2, opportunism: 0.85, gossip: 0.35, perceptive: 0.9, temper: 0.2, sociability: 0.7, pride: 0.6 },
    bio: '在赌场干了二十年，从荷官做到 VIP 经理。他记得每个大客户喝什么酒。',
    goal: '把灰港大赌场的 VIP 业务做成全城第一。',
    moneyView: '钱是衡量价值最诚实的尺子。',
    gamblingAttitude: '赌博是一门生意。他从不在自己的赌场下注。',
    startMoney: G(180000),
    income: G(16000),
    startDebt: 0,
    schedule: [
      { days: [1, 2, 3, 4, 5, 6], from: hm(15), to: hm(27), loc: 'casino', spot: 'vip_host', act: 'work' },
      { days: [0], from: hm(14), to: hm(18), loc: 'club', spot: 'club_lounge2', act: 'leisure', chance: 0.5 },
      // hosts the members' Saturday night upstairs
      { days: [5], from: hm(21), to: hm(25), loc: 'casino', spot: 'sky_host', act: 'work' },
    ],
    circle: ['natasha', 'jack', 'lillian', 'alexander', 'marco'],
    initial: { met: false, knowsName: false },
    giftLikes: ['wine', 'luxury', 'formal'],
    giftDislikes: ['sweet', 'sports'],
    role: 'casino_host',
    voice: {
      greetStranger: ['晚上好。第一次来灰港大赌场？', '欢迎。有什么需要随时找我。'],
      greetAcquaint: ['{name}，欢迎回来。', '晚上好，{name}。今晚手气如何？'],
      greetWarm: ['{name}！我们最尊贵的朋友之一。今晚想要什么安排？', '啊，{name}。您的位置我一直留着。'],
      greetCold: ['{name}。', '晚上好。', '有什么事吗？'],
      farewell: ['祝您今晚愉快。', '有需要随时打给我。', '慢走。'],
      small: ['真正的高手知道什么时候离桌。可惜这样的人不多。', '这周末 VIP 厅有一位从东岸来的客人，一晚上押了六位数。', '赌场里没有钟，这是行业的老规矩。'],
      happy: ['这个月 VIP 厅的营业额很漂亮。'],
      stressed: ['总部又在压业绩。'],
      work: ['我的工作是让重要的客人感到被重视。'],
      giftLove: ['您真有品味。我收下了。', '这瓶酒……您很懂行。'],
      giftDislike: ['您太客气了。', '心意我领了。'],
      onBrag: ['那您更应该来 VIP 厅看看。', '很好。有兴趣的话，我可以为您安排更高的限额。'],
      onTrouble: ['……我明白了。赌场的信用额度需要重新评估。', '保重。有时候休息一阵子也不错。'],
      advice: ['在我的位置上，我只能说：设好止损，然后遵守它。', '会员等级只决定您得到什么服务，不决定您的牌。'],
    },
  },
  {
    id: 'alexander',
    name: '亚历山大',
    nameEn: 'Alexander Whitmore',
    age: 31,
    occupation: '惠特莫尔航运家族继承人',
    district: '山丘富人区',
    look: { skin: 0, hair: 1, hairColor: '#d8b46a', top: '#2d3f5c', topShade: '#1f2c42', bottom: '#22314a', shoes: '#2a1a12', accent: '#e8e2d0', style: 'suit', body: 'm' },
    traits: { materialism: 0.5, classConscious: 0.95, honesty: 0.6, loyalty: 0.6, empathy: 0.3, gamblingView: 0.1, prudence: 0.5, envy: 0.1, opportunism: 0.2, gossip: 0.4, perceptive: 0.8, temper: 0.5, sociability: 0.5, pride: 0.95 },
    bio: '惠特莫尔家族在灰港经营航运已有五代。他从小在私立学校和游艇俱乐部长大。',
    goal: '证明自己配得上家族的名字，而不只是继承它。',
    moneyView: '钱谁都可以有。教养和名声却需要几代人。',
    gamblingAttitude: 'VIP 厅里的百家乐是绅士的消遣，在大厅里大呼小叫是另一回事。',
    startMoney: G(4200000),
    income: G(60000),
    startDebt: 0,
    schedule: [
      { days: ALL, from: hm(13), to: hm(17), loc: 'club', spot: 'club_lounge1', act: 'leisure' },
      { days: [2, 4, 5], from: hm(19, 30), to: hm(22, 30), loc: 'fine_dining', spot: 'fd_table1', act: 'eat' },
      { days: [5], from: hm(23), to: hm(26, 30), loc: 'casino', spot: 'vip_bac1', act: 'gamble', chance: 0.8 },
      { days: [6], from: hm(11), to: hm(13), loc: 'city', spot: 'hill_garden', act: 'leisure', chance: 0.7 },
      { days: [5], from: hm(21, 45), to: hm(23), loc: 'casino', spot: 'sky_bar1', act: 'drink', chance: 0.7 },
      { days: [6], from: hm(14, 45), to: hm(17), loc: 'hotel', spot: 'auc_seat3', act: 'shop', chance: 0.6 },
      // Saturday mornings on the family's boat at the marina
      { days: [5], from: hm(10), to: hm(12, 30), loc: 'city', spot: 'marina_whitmore', act: 'leisure', chance: 0.8 },
    ],
    circle: ['lillian', 'sophia', 'victor'],
    initial: { met: false, knowsName: false },
    giftLikes: ['wine', 'formal', 'music'],
    giftDislikes: ['sweet', 'sports', 'coffee'],
    voice: {
      greetStranger: ['……我们认识吗？', '抱歉，我在等人。'],
      greetAcquaint: ['{name}。', '又见面了，{name}。'],
      greetWarm: ['{name}，很高兴见到你。坐吧。', '啊，{name}。今晚的谈话总算有趣了。'],
      greetCold: ['……', '你今天怎么也在这里。', '恕我失陪。'],
      farewell: ['再会。', '代我向你的家人问好。', '失陪了。'],
      small: ['祖父常说，一个人的真正价值在他失去一切的时候才看得出来。', '子午线会所的会员名单，一百年来几乎没变过。', '你听过马勒吗？这个季节最适合听他的第五交响曲。'],
      happy: ['家族董事会终于批准了我的提案。'],
      stressed: ['父亲又在质疑我的判断。'],
      work: ['航运是一门耐心的生意。'],
      giftLove: ['品味不错。谢谢。', '这份礼物很得体。'],
      giftDislike: ['……我想你误会了我的喜好。', '谢谢，不过我不太需要这个。'],
      onBrag: ['钱谁都能赚到，或者赢到。重要的是你用它成为什么样的人。', '在这里谈论自己的财产，是很不体面的。'],
      onTrouble: ['……我很遗憾。', '这种事情最好不要在公开场合讨论。'],
      advice: ['先学会穿着得体，再学会何时沉默。', '真正的圈子不是用钱买的，是用时间换的。'],
    },
  },
  {
    id: 'sophia',
    name: '索菲亚',
    nameEn: 'Sophia Chen',
    age: 36,
    occupation: '北门资本高级投资顾问',
    district: '河畔区',
    look: { skin: 2, hair: 3, hairColor: '#1d1a1a', top: '#3d4250', topShade: '#2b2f39', bottom: '#2b2f39', shoes: '#111111', accent: '#d9d4c7', style: 'jacket', glasses: true, body: 'f' },
    traits: { materialism: 0.45, classConscious: 0.35, honesty: 0.8, loyalty: 0.6, empathy: 0.55, gamblingView: -0.4, prudence: 0.95, envy: 0.1, opportunism: 0.35, gossip: 0.2, perceptive: 0.85, temper: 0.3, sociability: 0.5, pride: 0.6 },
    bio: '从普通家庭出身，靠奖学金读完金融硕士，十年里从分析师做到高级顾问。',
    goal: '五年内成为北门资本最年轻的合伙人。',
    moneyView: '财富是纪律和时间的复利。',
    gamblingAttitude: '赌博是负期望值的消费，可以理解，但不值得尊重。',
    startMoney: G(420000),
    income: G(26000),
    startDebt: G(180000),
    schedule: [
      { days: WD, from: hm(7, 15), to: hm(7, 55), loc: 'cafe', spot: 'cafe_window', act: 'eat', chance: 0.6 },
      { days: WD, from: hm(8), to: hm(19), loc: 'finance_office', spot: 'fin_sophia', act: 'work' },
      { days: [1, 3], from: hm(19, 30), to: hm(21, 30), loc: 'fine_dining', spot: 'fd_table2', act: 'eat', chance: 0.4 },
      { days: [5], from: hm(8), to: hm(10), loc: 'city', spot: 'riverwalk', act: 'exercise', chance: 0.8 },
      { days: [6], from: hm(14), to: hm(17), loc: 'club', spot: 'club_lounge2', act: 'leisure', chance: 0.6 },
      // art as an asset class: she comes to look, rarely to buy
      { days: [6], from: hm(15), to: hm(17), loc: 'hotel', spot: 'auc_seat4', act: 'shop', chance: 0.35 },
      { days: [2], from: hm(19, 30), to: hm(20, 30), loc: 'hotel', spot: 'tea_chair1', act: 'eat', chance: 0.4 },
      // Sunday brunch at the resort
      { days: [6], from: hm(9, 30), to: hm(13, 45), loc: 'isle_resort', spot: 'isle_resort_t1', act: 'eat', chance: 0.5 },
    ],
    circle: ['alexander', 'grace', 'lillian'],
    initial: { met: false, knowsName: false },
    giftLikes: ['book', 'coffee', 'music'],
    giftDislikes: ['sweet'],
    voice: {
      greetStranger: ['你好。', '有什么可以帮你的吗？'],
      greetAcquaint: ['{name}，你好。', '嗨，{name}。最近还好吗？'],
      greetWarm: ['{name}！正好，我有本书想推荐给你。', '见到你真高兴，{name}。'],
      greetCold: ['{name}。', '我现在有点忙。'],
      farewell: ['保持联系。', '记得复盘你的预算。', '回头见。'],
      small: ['大多数人高估了一年能做到的事，低估了十年能做到的事。', '指数基金很无聊，但无聊往往意味着赚钱。', '今天市场波动有点大，客户电话一个接一个。'],
      happy: ['我负责的基金这个季度跑赢了基准。'],
      stressed: ['合伙人评审快到了，压力不小。'],
      work: ['我的客户最需要的不是收益，是不在恐慌时卖出的勇气。'],
      giftLove: ['这本书我一直想读！谢谢。', '你很细心。'],
      giftDislike: ['谢谢……不过我最近在控糖。'],
      onBrag: ['恭喜。不过一次性的收入要怎么配置，你想过吗？', '如果是赌场赢来的，我建议你把它当作意外之财，先别动。'],
      onTrouble: ['先列出所有负债和每月固定支出，我们一项一项看。', '别再借新的钱去还旧的债。'],
      advice: ['先留出三到六个月的生活费作为应急金，再谈投资。', '分散、低成本、长期。剩下的都是噪音。'],
    },
  },
  {
    id: 'daniel',
    name: '丹尼尔',
    nameEn: 'Daniel Brooks',
    age: 29,
    occupation: '灰港汽车行维修技师',
    district: '老城区',
    look: { skin: 3, hair: 0, hairColor: '#2b211b', top: '#6b4b2e', topShade: '#4e361f', bottom: '#2f3b52', shoes: '#3b2a1e', style: 'jacket', beard: true, body: 'm' },
    traits: { materialism: 0.2, classConscious: 0.1, honesty: 0.75, loyalty: 0.9, empathy: 0.7, gamblingView: 0, prudence: 0.35, envy: 0.35, opportunism: 0.15, gossip: 0.35, perceptive: 0.5, temper: 0.6, sociability: 0.85, pride: 0.55 },
    bio: '你中学时最好的朋友。修车手艺很好，嘴上不饶人，心却很软。母亲身体不好，他每月都寄钱回家。',
    goal: '有一天开一家自己的修车厂。',
    moneyView: '钱是用来过日子的，不是用来比的。',
    gamblingAttitude: '偶尔玩两把无所谓，但他见过太多人陷进去。',
    startMoney: G(2600),
    income: G(3800),
    startDebt: G(9000),
    schedule: [
      { days: WD, from: hm(8), to: hm(17, 30), loc: 'motors', spot: 'motors_bay', act: 'work' },
      { days: [1, 3], from: hm(18, 30), to: hm(21), loc: 'city', spot: 'court', act: 'exercise', chance: 0.7 },
      { days: [4, 5], from: hm(20), to: hm(24, 30), loc: 'bar', spot: 'bar_stool2', act: 'drink', chance: 0.85 },
      { days: [6], from: hm(13), to: hm(16), loc: 'city', spot: 'court', act: 'exercise', chance: 0.6 },
      { days: [5], from: hm(11), to: hm(13), loc: 'restaurant', spot: 'rest_table1', act: 'eat', chance: 0.4 },
      { days: [2], from: hm(19), to: hm(21, 30), loc: 'city', spot: 'nm_seat3', act: 'eat', chance: 0.6 },
    ],
    circle: ['eileen', 'tommy', 'kiki', 'marco'],
    initial: { met: true, knowsName: true, affection: 55, trust: 50, respect: 30, familiarity: 72, status: 'friend' },
    giftLikes: ['sports', 'wine', 'music'],
    giftDislikes: ['luxury', 'formal'],
    role: 'friend',
    voice: {
      greetStranger: ['嗯？'],
      greetAcquaint: ['哟，{name}。', '{name}，怎么样？'],
      greetWarm: ['兄弟！你可算露面了。', '{name}！今晚有空吗？去 Rusty Anchor 喝一杯。', '我就知道会在这儿碰到你。'],
      greetCold: ['……你还知道来找我？', '{name}。有事说事。', '哦，是你啊。'],
      farewell: ['走了，有事打电话。', '别玩太晚。', '下次我请。'],
      small: ['今天修了一辆 70 年代的老爷车，那发动机，真漂亮。', '我妈最近好多了，谢谢你上次问起。', '马可那家伙又在推销延保，客人都快被他说晕了。', '周末打球吗？上次你可输惨了。'],
      happy: ['老板说下个月让我带徒弟！', '我把车贷又还掉一大截。'],
      stressed: ['我妈的药费又涨了……', '这个月有点紧，不过能撑过去。'],
      work: ['修车跟做人一样，听声音就知道哪里出了问题。'],
      giftLove: ['哈！你还记得我喜欢这个。', '够意思！'],
      giftDislike: ['这玩意儿……我用不上吧。', '你干嘛买这么贵的东西给我？'],
      onBrag: ['行啊你！不过别得意忘形，钱来得太容易不是好事。', '真的假的？那今晚你请客！'],
      onTrouble: ['怎么搞的？……算了，先别想太多，有我呢。', '要多少？我手头不多，但能帮一点是一点。'],
      advice: ['想赢回来的时候，就是该走的时候。', '你还记得我们以前说要一起开店吗？'],
    },
  },
  {
    id: 'margaret',
    name: '玛格丽特',
    nameEn: 'Margaret Doyle',
    age: 58,
    occupation: '枫庭公寓房东',
    district: '老城区',
    look: { skin: 1, hair: 5, hairColor: '#b9b6b2', top: '#7a5c8a', topShade: '#5c4469', bottom: '#4a3d55', shoes: '#3a2a2a', style: 'dress', glasses: true, body: 'f' },
    traits: { materialism: 0.4, classConscious: 0.3, honesty: 0.8, loyalty: 0.5, empathy: 0.45, gamblingView: -0.6, prudence: 0.85, envy: 0.1, opportunism: 0.3, gossip: 0.75, perceptive: 0.65, temper: 0.55, sociability: 0.6, pride: 0.5 },
    bio: '丈夫去世后独自经营枫庭公寓。她记得每个租客什么时候交过房租、什么时候晚交过。',
    goal: '把公寓翻新，留给在外地的女儿。',
    moneyView: '准时交房租的人，才是靠得住的人。',
    gamblingAttitude: '「赌鬼」是她骂人最重的词。',
    startMoney: G(64000),
    income: G(9000),
    startDebt: 0,
    schedule: [
      { days: ALL, from: hm(7, 30), to: hm(10), loc: 'city', spot: 'maple_garden', act: 'leisure' },
      { days: ALL, from: hm(10, 30), to: hm(11, 30), loc: 'store', spot: 'store_aisle2', act: 'shop', chance: 0.5 },
      { days: [0, 2, 4], from: hm(14), to: hm(16), loc: 'cafe', spot: 'cafe_table2', act: 'leisure', chance: 0.5 },
      { days: ALL, from: hm(16, 30), to: hm(18), loc: 'city', spot: 'maple_garden', act: 'leisure', chance: 0.5 },
      // helps serve lunch at the community kitchen on Tuesdays
      { days: [1], from: hm(11), to: hm(13, 30), loc: 'community_kitchen', spot: 'ck_line', act: 'volunteer', chance: 0.7 },
    ],
    circle: ['oldzhou', 'eileen', 'ben'],
    initial: { met: true, knowsName: true, affection: 8, trust: 25, respect: 15, familiarity: 30, status: 'acquaintance' },
    giftLikes: ['flowers', 'sweet'],
    giftDislikes: ['wine'],
    role: 'landlord',
    voice: {
      greetStranger: ['你找谁？'],
      greetAcquaint: ['{name}，早。', '哦，{name}。走廊的灯我已经让人修了。'],
      greetWarm: ['{name}！来，尝尝我烤的饼干。', '你是这栋楼里最让我省心的租客。'],
      greetCold: ['{name}。房租的事你最好放在心上。', '嗯。'],
      farewell: ['晚上回来记得锁好大门。', '别忘了垃圾分类。', '去吧。'],
      small: ['三楼那户又在半夜放音乐，我已经警告过他了。', '我女儿下个月要回来看我。', '这栋楼是我丈夫一砖一瓦盖的。'],
      happy: ['水管终于换好了，花了不少钱，不过值。'],
      stressed: ['房产税又涨了，我也很难做。'],
      work: ['当房东不容易，什么人都要打交道。'],
      giftLove: ['哎呀，你这孩子，太客气了。', '真漂亮，我要摆在窗台上。'],
      giftDislike: ['我不喝酒，你拿回去吧。'],
      onBrag: ['有钱是好事。那你也不会拖欠房租了吧。', '钱多了更要存着，别乱花。'],
      onTrouble: ['……房租我可以宽限几天，但只有几天。', '年轻人谁没难过的时候，但规矩就是规矩。'],
      advice: ['每个月拿到钱，先把房租放一边。', '少去那种地方，你知道我说的是哪儿。'],
    },
  },
  {
    id: 'raymond',
    name: '雷蒙德',
    nameEn: 'Raymond Price',
    age: 47,
    occupation: '灰港物流运营主管（你的上司）',
    district: '河畔区',
    look: { skin: 2, hair: 7, hairColor: '#4a3f36', top: '#d7dde6', topShade: '#aeb6c3', bottom: '#3a3f4a', shoes: '#1b1b1b', accent: '#7a1e2b', style: 'shirt', body: 'm' },
    traits: { materialism: 0.6, classConscious: 0.6, honesty: 0.55, loyalty: 0.35, empathy: 0.3, gamblingView: -0.5, prudence: 0.7, envy: 0.45, opportunism: 0.5, gossip: 0.3, perceptive: 0.55, temper: 0.6, sociability: 0.4, pride: 0.7 },
    bio: '在灰港物流干了二十年。他最大的心愿是成为子午线会所的正式会员。',
    goal: '升任区域总监，并被子午线会所接纳。',
    moneyView: '体面的收入、体面的房子、体面的圈子。',
    gamblingAttitude: '员工赌博意味着风险：迟到、挪用、出事。',
    startMoney: G(85000),
    income: G(11500),
    startDebt: G(260000),
    schedule: [
      { days: WD, from: hm(8, 15), to: hm(18), loc: 'office', spot: 'office_boss', act: 'work' },
      { days: [4], from: hm(19), to: hm(21), loc: 'restaurant', spot: 'rest_table3', act: 'eat', chance: 0.6 },
      { days: [6], from: hm(15), to: hm(17), loc: 'club', spot: 'club_bar', act: 'leisure', chance: 0.25 },
    ],
    circle: ['kiki', 'ben'],
    initial: { met: true, knowsName: true, affection: 0, trust: 20, respect: 14, familiarity: 36, status: 'acquaintance' },
    giftLikes: ['wine', 'formal', 'luxury'],
    giftDislikes: ['sweet'],
    role: 'boss',
    voice: {
      greetStranger: ['有事吗？'],
      greetAcquaint: ['{name}。报表做完了吗？', '早，{name}。'],
      greetWarm: ['{name}，你最近表现很好，继续保持。', '啊，{name}。正好有个项目想交给你。'],
      greetCold: ['{name}，你最近的状态让我很担心。', '有话快说，我很忙。'],
      farewell: ['回去工作吧。', '别让我失望。', '明天准时。'],
      small: ['北区仓库的系统又出问题了。', '周末我约了几个客户去打高尔夫。', '子午线会所的推荐信……还差一封。'],
      happy: ['这个季度的指标完成了，总部很满意。'],
      stressed: ['总部要裁员百分之十，大家都小心点。'],
      work: ['迟到一次是意外，两次是习惯。'],
      giftLove: ['哦？这瓶不错，很有眼光。', '你很懂事。'],
      giftDislike: ['你不必这样。'],
      onBrag: ['……你哪来这么多钱？', '工作之外的事我不过问，但别影响上班。'],
      onTrouble: ['私人问题请不要带到工作中来。', '公司有员工援助计划，你可以去问问人事。'],
      advice: ['想升职，先让老板的日子好过。', '着装也是工作能力的一部分。'],
    },
  },
  {
    id: 'kiki',
    name: '琪琪',
    nameEn: 'Kiki Zhou',
    age: 24,
    occupation: '灰港物流行政专员（你的同事）',
    district: '老城区',
    look: { skin: 2, hair: 9, hairColor: '#5a3a2a', top: '#e27aa6', topShade: '#bf5f86', bottom: '#e27aa6', shoes: '#f1f1f1', style: 'dress', body: 'f' },
    traits: { materialism: 0.8, classConscious: 0.45, honesty: 0.45, loyalty: 0.4, empathy: 0.5, gamblingView: 0.4, prudence: 0.2, envy: 0.65, opportunism: 0.6, gossip: 0.95, perceptive: 0.5, temper: 0.4, sociability: 0.95, pride: 0.5 },
    bio: '公司里消息最灵通的人。工资一半花在衣服上，另一半花在社交上。',
    goal: '嫁给有钱人，或者自己变成有钱人——哪个先来都行。',
    moneyView: '钱就是用来让生活变好看的。',
    gamblingAttitude: '轮盘很刺激！只要不输太多。',
    startMoney: G(1800),
    income: G(3900),
    startDebt: G(4200),
    schedule: [
      { days: WD, from: hm(8, 50), to: hm(17, 15), loc: 'office', spot: 'office_desk2', act: 'work' },
      { days: [0, 1, 3], from: hm(17, 30), to: hm(19), loc: 'boutique', spot: 'boutique_rack', act: 'shop', chance: 0.35 },
      { days: [2], from: hm(20), to: hm(23), loc: 'casino', spot: 'roulette_watch', act: 'gamble', chance: 0.4 },
      { days: [4], from: hm(18, 30), to: hm(23, 30), loc: 'bar', spot: 'bar_table2', act: 'drink', chance: 0.7 },
      { days: [5], from: hm(14), to: hm(18), loc: 'boutique', spot: 'boutique_rack', act: 'shop', chance: 0.6 },
      { days: [5], from: hm(21), to: hm(25), loc: 'casino', spot: 'roulette_watch', act: 'gamble', chance: 0.5 },
      { days: [0], from: hm(19), to: hm(21), loc: 'city', spot: 'nm_seat4', act: 'eat', chance: 0.5 },
      // Sundays at the beach on Whitestone Bay, for the photos
      { days: [6], from: hm(9, 20), to: hm(16, 40), loc: 'isle', spot: 'isle_beach1', act: 'leisure', chance: 0.6 },
    ],
    circle: ['isabella', 'daniel', 'raymond', 'tommy'],
    initial: { met: true, knowsName: true, affection: 18, trust: 8, respect: 8, familiarity: 44, status: 'acquaintance' },
    giftLikes: ['luxury', 'beauty', 'sweet', 'flowers'],
    giftDislikes: ['book'],
    voice: {
      greetStranger: ['嗨~'],
      greetAcquaint: ['{name}！你听说了吗？', '嗨，{name}~'],
      greetWarm: ['{name}亲爱的！我有个超级八卦要告诉你！', '{name}！今晚一起去喝一杯嘛~'],
      greetCold: ['哦，{name}啊。', '……嗯。'],
      farewell: ['拜拜~', '有八卦记得告诉我！', '明天见啦。'],
      small: ['会计部的小张好像在和销售部的谁约会！', '我看中了一条裙子，等发工资就买。', '雷蒙德今天心情超差，别去惹他。', '你知道吗，听说赌场 VIP 厅里一晚上能输掉一套房。'],
      happy: ['我抢到了限量款包包！'],
      stressed: ['信用卡账单来了……我不想看。'],
      work: ['工作嘛，摸鱼也是一门学问。'],
      giftLove: ['天哪！我爱死这个了！', '你也太懂我了吧！'],
      giftDislike: ['……书？好吧，谢谢。'],
      onBrag: ['哇！真的假的？！你得请客！', '那你现在算是有钱人啦？'],
      onTrouble: ['啊……好惨。我可帮不了你，我自己也月光。', '没事啦，会好起来的。'],
      advice: ['衣服要穿好一点，别人才会认真对待你。', '想认识有钱人？去子午线会所门口站着！开玩笑的~'],
    },
  },
  {
    id: 'marco',
    name: '马可',
    nameEn: 'Marco Rossi',
    age: 39,
    occupation: '灰港汽车行销售员 / 赌场常客',
    district: '老城区',
    look: { skin: 3, hair: 6, hairColor: '#1e1612', top: '#a8323a', topShade: '#7f2329', bottom: '#2a2a30', shoes: '#4a2e1c', accent: '#d9b44a', style: 'shirt', beard: true, body: 'm' },
    traits: { materialism: 0.75, classConscious: 0.2, honesty: 0.4, loyalty: 0.5, empathy: 0.45, gamblingView: 0.95, prudence: 0.1, envy: 0.5, opportunism: 0.6, gossip: 0.6, perceptive: 0.4, temper: 0.7, sociability: 0.9, pride: 0.7 },
    bio: '能说会道的汽车销售。几乎每晚都在 21 点桌边，相信自己有一套「系统」。',
    goal: '赢一把大的，然后彻底收手。（他每个月都这么说）',
    moneyView: '钱不花就不是钱。',
    gamblingAttitude: '「今晚手感来了」——他的口头禅。',
    startMoney: G(6000),
    income: G(5600),
    startDebt: G(18000),
    schedule: [
      { days: [0, 1, 2, 3, 4, 5], from: hm(11), to: hm(19), loc: 'motors', spot: 'motors_floor', act: 'work' },
      { days: [0, 1, 2, 3, 4, 5], from: hm(21), to: hm(27), loc: 'casino', spot: 'bj_patron', act: 'gamble', chance: 0.75 },
      { days: [6], from: hm(20), to: hm(26), loc: 'casino', spot: 'bj_patron', act: 'gamble', chance: 0.6 },
      // Monday mornings after a weekend at the tables
      { days: [0], from: hm(9, 30), to: hm(10, 30), loc: 'pawn', spot: 'pawn_customer', act: 'shop', chance: 0.4 },
    ],
    circle: ['victor', 'daniel', 'tommy', 'natasha'],
    initial: { met: false, knowsName: false },
    giftLikes: ['wine', 'luxury', 'sports'],
    giftDislikes: ['book'],
    voice: {
      greetStranger: ['嘿朋友！手气怎么样？', '新面孔啊。来，坐我旁边，我带你赢。'],
      greetAcquaint: ['{name}！我的幸运星！', '哟，{name}，今晚一起杀两把？'],
      greetWarm: ['{name}，我的好兄弟！今晚我感觉要发！', '就等你了，{name}！'],
      greetCold: ['……别跟我说话，我在算牌。', '{name}，你挡着我的运了。'],
      farewell: ['祝你好运！', '下次见，别把我的位置坐了。', '走了走了，明天翻本。'],
      small: ['我跟你说，庄家连开三把小牌之后，一定要加注。', '这周我卖了两台车，提成全在这儿了。', '上个月我差点赢了一万，就差一张牌。'],
      happy: ['哈哈！今晚手风太顺了！', '看见没？系统起作用了！'],
      stressed: ['……没事，明天就能赢回来。', '老板又在催业绩，我得想办法。'],
      work: ['卖车就是卖梦想，朋友。'],
      giftLove: ['好东西！你够朋友！', '哇哦，这个我喜欢。'],
      giftDislike: ['书？我哪有时间看书。'],
      onBrag: ['我就说你有天赋！明晚继续！', '兄弟，手气来了挡不住！'],
      onTrouble: ['嘿，谁没输过？明晚一把就回来了。', '我认识一个人，可以借钱给你……利息嘛，好商量。'],
      advice: ['跟着庄家的节奏走。连输三把就翻倍！', '永远不要在赢的时候离开……不对，是输的时候……哎，反正你懂的。'],
    },
  },
  {
    id: 'lillian',
    name: '莉莉安',
    nameEn: 'Lillian Vance',
    age: 42,
    occupation: '社交名媛 / VIP 百家乐常客',
    district: '山丘富人区',
    look: { skin: 0, hair: 9, hairColor: '#e3c9a0', top: '#1f5a4a', topShade: '#153f34', bottom: '#153f34', shoes: '#0f0f0f', accent: '#e8d08a', style: 'gown', body: 'f' },
    traits: { materialism: 0.85, classConscious: 0.8, honesty: 0.35, loyalty: 0.3, empathy: 0.3, gamblingView: 0.6, prudence: 0.3, envy: 0.4, opportunism: 0.7, gossip: 0.85, perceptive: 0.8, temper: 0.35, sociability: 0.85, pride: 0.85 },
    bio: '丈夫生前是航运大亨，留给她一座庄园和一张永远不会被拒绝的名片。',
    goal: '始终站在灰港社交圈的中心。',
    moneyView: '钱是入场券，不是目的地。',
    gamblingAttitude: '在 VIP 厅押百家乐，是社交的一部分。',
    startMoney: G(2600000),
    income: G(40000),
    startDebt: 0,
    schedule: [
      { days: ALL, from: hm(12), to: hm(15), loc: 'luxury', spot: 'lux_display', act: 'shop', chance: 0.5 },
      { days: ALL, from: hm(15), to: hm(18), loc: 'club', spot: 'club_lounge3', act: 'leisure' },
      { days: [1, 2], from: hm(19, 30), to: hm(22), loc: 'fine_dining', spot: 'fd_table3', act: 'eat', chance: 0.7 },
      { days: [3, 4, 5], from: hm(21, 30), to: hm(26, 30), loc: 'casino', spot: 'vip_bac2', act: 'gamble', chance: 0.85 },
      { days: [5], from: hm(21), to: hm(23), loc: 'casino', spot: 'sky_lounge1', act: 'leisure', chance: 0.8 },
      // the Sunday sale at the Grand Hotel, and tea in its lounge on Thursdays
      { days: [6], from: hm(14, 30), to: hm(17), loc: 'hotel', spot: 'auc_seat1', act: 'shop', chance: 0.8 },
      { days: [3], from: hm(15), to: hm(17), loc: 'hotel', spot: 'tea_sofa', act: 'eat', chance: 0.6 },
      // Saturday lunch by the resort's pool
      { days: [5], from: hm(9, 15), to: hm(13, 40), loc: 'isle', spot: 'isle_pool1', act: 'leisure', chance: 0.6 },
    ],
    circle: ['alexander', 'victor', 'sophia', 'isabella'],
    initial: { met: false, knowsName: false },
    giftLikes: ['luxury', 'beauty', 'flowers', 'formal'],
    giftDislikes: ['sports', 'book', 'coffee'],
    voice: {
      greetStranger: ['哦？你是谁的朋友？', '……我们见过吗，亲爱的？'],
      greetAcquaint: ['{name}，亲爱的。', '你今天看起来不错，{name}。'],
      greetWarm: ['{name}！快过来，我正跟大家说起你呢。', '亲爱的{name}，周末的晚宴你一定要来。'],
      greetCold: ['……抱歉，我在等朋友。', '{name}。真意外。'],
      farewell: ['回头见，亲爱的。', '别让我等太久。', '再会~'],
      small: ['你知道吗，惠特莫尔家那位少爷，最近在找人投资他的新航线。', '下个月的慈善晚宴，我负责宾客名单。', '这件外套？去年在巴黎买的，旧东西了。'],
      happy: ['昨晚在 VIP 厅，庄家连开七把，太精彩了。'],
      stressed: ['有些人真是不懂规矩。'],
      work: ['社交是一份全职工作，亲爱的。'],
      giftLove: ['哦~你真懂女人。', '真漂亮，我会戴着它参加晚宴。'],
      giftDislike: ['……这个，我会转送给我的管家。'],
      onBrag: ['那我们得找个机会好好庆祝一下。', '有意思……你应该认识一些人。'],
      onTrouble: ['……哦，真遗憾。我突然想起来还有个约。', '亲爱的，这种事别在这里说。'],
      advice: ['在灰港，人们记住的不是你有多少钱，而是你和谁一起出现。', '永远不要让别人看出你在乎。'],
    },
  },
  {
    id: 'oldzhou',
    name: '周伯',
    nameEn: 'Old Zhou',
    age: 67,
    occupation: '退休码头工人',
    district: '老城区',
    look: { skin: 2, hair: 7, hairColor: '#d6d3cc', top: '#5a6b58', topShade: '#45533f', bottom: '#46423c', shoes: '#2c2620', style: 'jacket', body: 'm' },
    traits: { materialism: 0.05, classConscious: 0.05, honesty: 0.85, loyalty: 0.8, empathy: 0.9, gamblingView: -0.8, prudence: 0.8, envy: 0, opportunism: 0, gossip: 0.4, perceptive: 0.85, temper: 0.2, sociability: 0.6, pride: 0.3 },
    bio: '在码头扛了四十年货。三十多年前曾在赌场输光了房子和婚姻，从此再也没碰过牌。',
    goal: '每天下一盘好棋，看着老城区的孩子们长大。',
    moneyView: '钱是身外之物，债是身内之物。',
    gamblingAttitude: '他偶尔会去赌场门口站一站，提醒自己。',
    startMoney: G(14000),
    income: G(1600),
    startDebt: 0,
    schedule: [
      { days: ALL, from: hm(8), to: hm(11, 30), loc: 'city', spot: 'park_chess', act: 'leisure' },
      { days: ALL, from: hm(12), to: hm(13), loc: 'restaurant', spot: 'rest_table1', act: 'eat', chance: 0.3 },
      { days: ALL, from: hm(14), to: hm(17), loc: 'cafe', spot: 'cafe_table1', act: 'leisure', chance: 0.6 },
      { days: [5], from: hm(21), to: hm(22, 30), loc: 'casino', spot: 'casino_lobby_watch', act: 'watch', chance: 0.25 },
      // the old crew chief still turns up at Pier 7 at dawn, eats at the community kitchen, and sits at the night market
      { days: [0, 1, 2, 3, 4, 5], from: hm(6), to: hm(7, 45), loc: 'city', spot: 'pier7', act: 'leisure', chance: 0.6 },
      { days: [0, 2, 4], from: hm(12), to: hm(13), loc: 'community_kitchen', spot: 'ck_table1', act: 'eat', chance: 0.6 },
      { days: [1, 3, 5, 6], from: hm(19), to: hm(21, 30), loc: 'city', spot: 'nm_seat1', act: 'eat', chance: 0.55 },
      // Wednesdays across the bay with the fishermen he used to sail with
      { days: [2], from: hm(6, 50), to: hm(13, 45), loc: 'isle', spot: 'isle_chess', act: 'leisure', chance: 0.6 },
    ],
    circle: ['eileen', 'margaret', 'ben'],
    initial: { met: true, knowsName: false, familiarity: 10, affection: 5, trust: 5, respect: 5 },
    giftLikes: ['book', 'coffee', 'sweet'],
    giftDislikes: ['luxury', 'wine'],
    voice: {
      greetStranger: ['年轻人，会下棋吗？', '坐吧，站着累。'],
      greetAcquaint: ['{name}来啦。', '嗯，{name}，坐。'],
      greetWarm: ['{name}！来来来，今天让你三步。', '我就猜你今天会来。'],
      greetCold: ['……你身上有赌场的烟味。', '{name}，坐吧。'],
      farewell: ['去吧，路上小心。', '记住我说的话。', '明天还来吗？'],
      small: ['下棋和过日子一样，最怕的就是想一步登天。', '我年轻的时候，这条河上全是货船。', '艾琳那孩子，心善，就是太要强。'],
      happy: ['今天赢了老李三盘，痛快！'],
      stressed: ['膝盖又疼了，要下雨了。'],
      work: ['我扛了四十年货，没欠过谁一分钱。……后来欠过，也还清了。'],
      giftLove: ['哎呀，你有心了。', '好，好，我收下。'],
      giftDislike: ['这么贵的东西，我一个老头子用不上。'],
      onBrag: ['赢钱的感觉，我知道。那是最危险的时候。', '孩子，赌场送你的每一分钱，都是借给你的。'],
      onTrouble: ['……坐下，慢慢说。天塌不下来。', '我当年比你惨多了。能回头，就不算晚。'],
      advice: ['赌场的灯永远亮着，因为它们不想让你知道天黑了。', '一个人什么时候最穷？不是没钱的时候，是只剩下钱的时候。'],
    },
  },
  {
    id: 'natasha',
    name: '娜塔莎',
    nameEn: 'Natasha Ivanova',
    age: 33,
    occupation: '灰港大赌场资深荷官',
    district: '市中心',
    look: { skin: 0, hair: 5, hairColor: '#2a1d18', top: '#1a1a1f', topShade: '#101014', bottom: '#18181d', shoes: '#0c0c0c', accent: '#f0f0f0', style: 'vest', body: 'f' },
    traits: { materialism: 0.35, classConscious: 0.2, honesty: 0.75, loyalty: 0.5, empathy: 0.5, gamblingView: 0, prudence: 0.7, envy: 0.15, opportunism: 0.2, gossip: 0.25, perceptive: 0.95, temper: 0.3, sociability: 0.45, pride: 0.55 },
    bio: '发牌十年，手法干净利落。她见过太多人在她的桌上赢了又输回去。',
    goal: '攒够钱回去读完她的心理学学位。',
    moneyView: '桌上的钱不是钱，是筹码。这就是问题所在。',
    gamblingAttitude: '这是她的工作。她只希望客人记得什么时候该离开。',
    startMoney: G(32000),
    income: G(5200),
    startDebt: 0,
    schedule: [
      { days: [1, 2, 3, 4, 5], from: hm(17, 30), to: hm(26, 30), loc: 'casino', spot: 'dealer_bj1', act: 'work' },
      { days: [6], from: hm(11), to: hm(13), loc: 'cafe', spot: 'cafe_window', act: 'leisure', chance: 0.6 },
      { days: [0], from: hm(20), to: hm(23), loc: 'bar', spot: 'bar_stool3', act: 'drink', chance: 0.5 },
    ],
    circle: ['victor', 'jack', 'marco', 'tommy'],
    initial: { met: false, knowsName: false },
    giftLikes: ['music', 'coffee', 'book'],
    giftDislikes: ['luxury'],
    role: 'dealer',
    voice: {
      greetStranger: ['晚上好，请下注。', '欢迎入座。'],
      greetAcquaint: ['{name}，晚上好。', '又见面了。请下注。'],
      greetWarm: ['{name}。今天别玩太久，好吗？', '嗨，{name}。很高兴看到你……在桌子这边也好，那边也好。'],
      greetCold: ['请下注。', '……'],
      farewell: ['祝您好运。', '早点休息。', '下次见。'],
      small: ['六副牌，庄家软 17 停牌，3 赔 2。规则都写在桌上。', '你知道吗？赢钱的人说话会变快，输钱的人会开始摸筹码。', '我们荷官的手只做一件事：按规则发牌。'],
      happy: ['我申请的夜校课程通过了。'],
      stressed: ['昨晚有个客人对我大吼，说我「故意」发烂牌。'],
      work: ['我不在乎谁赢谁输。我只在乎牌发得对。'],
      giftLove: ['……谢谢。不过别让主管看到。', '你记得我喜欢这个。'],
      giftDislike: ['抱歉，赌场规定我们不能收客人贵重的礼物。'],
      onBrag: ['恭喜。现在是离开的好时机。', '赢的时候走，才叫赢。'],
      onTrouble: ['……停下来吧。这张桌子不会还你什么。', '赌场有自我限制计划，你可以申请。'],
      advice: ['把今晚能输的钱放在左口袋，输完就走。永远别碰右口袋。', '在这里没有「该赢了」这回事。每一手牌都是新的。'],
    },
  },
  {
    id: 'jack',
    name: '杰克',
    nameEn: 'Jack Mercer',
    age: 35,
    occupation: '灰港大赌场安保主管',
    district: '老城区',
    look: { skin: 4, hair: 7, hairColor: '#141010', top: '#121216', topShade: '#0a0a0d', bottom: '#121216', shoes: '#060606', accent: '#2a2a2f', style: 'suit', body: 'm' },
    traits: { materialism: 0.3, classConscious: 0.2, honesty: 0.8, loyalty: 0.6, empathy: 0.3, gamblingView: 0, prudence: 0.6, envy: 0.1, opportunism: 0.1, gossip: 0.15, perceptive: 0.8, temper: 0.65, sociability: 0.25, pride: 0.6 },
    bio: '退伍后进入赌场安保部门。他的耳机里整晚都是监控室的声音。',
    goal: '让赌场里一晚上都不出事。',
    moneyView: '钱让人变得不理智。',
    gamblingAttitude: '他不关心谁赢谁输，只关心有没有人作弊、闹事。',
    startMoney: G(26000),
    income: G(5800),
    startDebt: G(12000),
    schedule: [
      { days: [1, 2, 3, 4, 5, 6], from: hm(19), to: hm(28), loc: 'casino', spot: 'security_post', act: 'work' },
      { days: [0], from: hm(18), to: hm(20), loc: 'city', spot: 'court', act: 'exercise', chance: 0.5 },
    ],
    circle: ['victor', 'natasha'],
    initial: { met: false, knowsName: false },
    giftLikes: ['sports', 'coffee'],
    giftDislikes: ['luxury', 'wine'],
    role: 'security',
    voice: {
      greetStranger: ['请配合安检。', '先生/女士，有什么需要？'],
      greetAcquaint: ['{name}。', '嗯。'],
      greetWarm: ['{name}，今晚一切顺利？', '你是少数不给我添麻烦的客人。'],
      greetCold: ['我在看着你。', '别惹事。'],
      farewell: ['注意安全。', '嗯。', '走好。'],
      small: ['每张桌子上面都有三个摄像头。', '昨晚有人想在轮盘上动手脚，三分钟就被请出去了。'],
      happy: ['这周零事故。'],
      stressed: ['周末人太多，人手不够。'],
      work: ['规矩就是规矩。'],
      giftLove: ['……谢了。', '咖啡？好，正需要。'],
      giftDislike: ['我不能收这个。你知道这看起来像什么吗？'],
      onBrag: ['……嗯。别在大厅里炫耀，容易招来麻烦。'],
      onTrouble: ['如果有人逼你还债，告诉我。', '别做傻事。'],
      advice: ['在这里，冷静的人最安全。'],
    },
  },
  {
    id: 'grace',
    name: '格蕾丝',
    nameEn: 'Grace Okafor',
    age: 30,
    occupation: '灰港储蓄信托银行信贷专员',
    district: '市中心',
    look: { skin: 5, hair: 6, hairColor: '#141010', top: '#2e5e8c', topShade: '#224569', bottom: '#2a2f3a', shoes: '#1a1a1a', accent: '#f2f2f2', style: 'jacket', body: 'f' },
    traits: { materialism: 0.3, classConscious: 0.2, honesty: 0.85, loyalty: 0.55, empathy: 0.75, gamblingView: -0.5, prudence: 0.9, envy: 0.1, opportunism: 0.1, gossip: 0.15, perceptive: 0.75, temper: 0.25, sociability: 0.55, pride: 0.4 },
    bio: '每天审批几十份贷款申请。她相信信用是一个人对未来的承诺。',
    goal: '在银行推动一个面向年轻人的理财教育项目。',
    moneyView: '负债本身不可怕，可怕的是看不清自己的负债。',
    gamblingAttitude: '她见过太多因为赌博而违约的申请人。',
    startMoney: G(38000),
    income: G(6800),
    startDebt: G(22000),
    schedule: [
      { days: WD, from: hm(8, 45), to: hm(17, 15), loc: 'bank', spot: 'bank_loan_desk', act: 'work' },
      { days: [5], from: hm(9), to: hm(13), loc: 'bank', spot: 'bank_loan_desk', act: 'work' },
      { days: [2], from: hm(18), to: hm(20), loc: 'restaurant', spot: 'rest_table2', act: 'eat', chance: 0.5 },
      { days: [6], from: hm(10), to: hm(12), loc: 'city', spot: 'park_bench2', act: 'leisure', chance: 0.5 },
    ],
    circle: ['sophia', 'ben', 'eileen'],
    initial: { met: false, knowsName: false },
    giftLikes: ['book', 'flowers', 'coffee'],
    giftDislikes: ['luxury'],
    role: 'banker',
    voice: {
      greetStranger: ['您好，请问办理什么业务？', '欢迎光临灰港储蓄信托。'],
      greetAcquaint: ['{name}，您好。', '又见面了，{name}。'],
      greetWarm: ['{name}！最近财务状况还好吗？', '嗨，{name}，正想提醒你下周的还款日。'],
      greetCold: ['{name}。关于您的逾期账款……', '您好。'],
      farewell: ['祝您愉快。', '有问题随时来柜台。', '记得按时还款哦。'],
      small: ['利率委员会下个月开会，可能会调整房贷利率。', '我们新推出了自动储蓄计划，每月自动转账，很适合年轻人。', '信用分数就像一个人的名声，建立很慢，毁掉很快。'],
      happy: ['我的理财课程提案通过了！'],
      stressed: ['这个月的违约率又上升了。'],
      work: ['我审批的不是钱，是一个人的还款能力。'],
      giftLove: ['谢谢，你太体贴了。', '我会放在办公桌上的。'],
      giftDislike: ['抱歉，银行规定我们不能收客户的贵重礼品。'],
      onBrag: ['恭喜！要不要考虑把一部分存入定期？', '一次性收入记得留出税和应急金。'],
      onTrouble: ['我们可以谈谈重组还款计划。', '别借高利贷，真的。先来找我。'],
      advice: ['先还利率最高的债。', '每个月自动存一笔钱，存了就当它不存在。'],
    },
  },
  {
    id: 'tommy',
    name: '汤米',
    nameEn: 'Tommy Reyes',
    age: 22,
    occupation: 'Rusty Anchor 酒吧调酒师 / 街头吉他手',
    district: '老城区',
    look: { skin: 3, hair: 6, hairColor: '#2a1c14', top: '#3b2b22', topShade: '#2a1f19', bottom: '#22262e', shoes: '#2b2b2b', accent: '#e9e4da', style: 'vest', body: 'm' },
    traits: { materialism: 0.55, classConscious: 0.2, honesty: 0.6, loyalty: 0.6, empathy: 0.6, gamblingView: 0.3, prudence: 0.25, envy: 0.6, opportunism: 0.4, gossip: 0.7, perceptive: 0.55, temper: 0.3, sociability: 0.9, pride: 0.4 },
    bio: '白天在广场弹吉他，晚上在酒吧调酒。梦想是录一张自己的专辑。',
    goal: '攒钱买一把好琴，录出第一张专辑。',
    moneyView: '有钱人的生活看起来真轻松啊。',
    gamblingAttitude: '偶尔去轮盘碰碰运气，输了就当交学费。',
    startMoney: G(900),
    income: G(2600),
    startDebt: G(1500),
    schedule: [
      { days: [2, 3, 4, 5, 6], from: hm(17), to: hm(26), loc: 'bar', spot: 'bar_counter', act: 'work' },
      { days: WD, from: hm(13), to: hm(16), loc: 'city', spot: 'plaza_busk', act: 'busk', chance: 0.5 },
      { days: [5, 6], from: hm(12), to: hm(15), loc: 'cafe', spot: 'cafe_table3', act: 'leisure', chance: 0.4 },
      // his nights off: playing for the night market crowd
      { days: [0, 1], from: hm(19, 30), to: hm(23), loc: 'city', spot: 'nm_busk', act: 'busk', chance: 0.7 },
      // Monday afternoons playing for the beach shack on the island
      { days: [0], from: hm(12, 15), to: hm(16, 45), loc: 'isle', spot: 'isle_busk', act: 'busk', chance: 0.5 },
    ],
    circle: ['daniel', 'eileen', 'kiki', 'marco', 'natasha'],
    initial: { met: false, knowsName: false },
    giftLikes: ['music', 'wine', 'sweet'],
    giftDislikes: ['formal'],
    voice: {
      greetStranger: ['嘿，来点什么？', '欢迎来到 Rusty Anchor！'],
      greetAcquaint: ['{name}！老规矩？', '嘿，{name}。'],
      greetWarm: ['{name}！我新写了一首歌，你得听听。', '我的好哥们来了！今晚第一杯我请。'],
      greetCold: ['哦……{name}。', '要点什么。'],
      farewell: ['慢走！', '下次带朋友来。', '晚安~'],
      small: ['今天在广场有个小孩给了我十块钱，说喜欢我的歌。', '丹尼尔又在吧台跟人争论哪支球队会夺冠。', '你知道那个开跑车的家伙吗？一晚上给了我两百小费。'],
      happy: ['有个录音棚愿意给我打折！'],
      stressed: ['琴弦又断了，这个月真倒霉。'],
      work: ['调酒的诀窍是听客人说话。'],
      giftLove: ['兄弟！你太好了！', '这个我要了！'],
      giftDislike: ['呃……这个太正式了，不太适合我。'],
      onBrag: ['哇，真羡慕。我什么时候也能这样就好了。', '那你得给我介绍几个有钱的朋友，我去他们派对上演出！'],
      onTrouble: ['唉……来，这杯算我的。', '要不你来酒吧帮忙？乔老板一直在招人。'],
      advice: ['做自己喜欢的事，钱慢慢会来的……大概吧。'],
    },
  },
  {
    id: 'isabella',
    name: '伊莎贝拉',
    nameEn: 'Isabella Moreau',
    age: 28,
    occupation: 'Thread & Needle 服装店造型师',
    district: '市中心',
    look: { skin: 1, hair: 3, hairColor: '#141010', top: '#c8a24a', topShade: '#a1802f', bottom: '#1a1a1a', shoes: '#7a1e2b', accent: '#f4efe6', style: 'jacket', body: 'f' },
    traits: { materialism: 0.75, classConscious: 0.6, honesty: 0.55, loyalty: 0.45, empathy: 0.4, gamblingView: 0.2, prudence: 0.4, envy: 0.5, opportunism: 0.55, gossip: 0.7, perceptive: 0.9, temper: 0.4, sociability: 0.75, pride: 0.75 },
    bio: '能一眼看出一套衣服的价格和穿衣人的底气。她在为自己的品牌攒钱。',
    goal: '在富人区开一家自己的设计工作室。',
    moneyView: '人靠衣装。这不是虚荣，是现实。',
    gamblingAttitude: '无所谓，只要别穿着拖鞋去赌场。',
    startMoney: G(12000),
    income: G(4200),
    startDebt: G(3000),
    schedule: [
      { days: [0, 1, 2, 3, 4, 5], from: hm(10), to: hm(19), loc: 'boutique', spot: 'boutique_counter', act: 'work' },
      { days: [4, 5], from: hm(21), to: hm(25), loc: 'bar', spot: 'bar_table2', act: 'drink', chance: 0.5 },
      { days: [6], from: hm(14), to: hm(17), loc: 'luxury', spot: 'lux_browse', act: 'shop', chance: 0.5 },
      { days: [5], from: hm(15), to: hm(16, 30), loc: 'hotel', spot: 'tea_chair2', act: 'eat', chance: 0.4 },
    ],
    circle: ['kiki', 'lillian', 'tommy'],
    initial: { met: false, knowsName: false },
    giftLikes: ['beauty', 'luxury', 'flowers', 'sweet'],
    giftDislikes: ['sports', 'book'],
    voice: {
      greetStranger: ['欢迎光临。需要帮您搭配吗？', '……你这身，嗯，很有「生活气息」。'],
      greetAcquaint: ['{name}，又来看衣服？', '嗨，{name}。'],
      greetWarm: ['{name}！新到的秋季系列简直为你量身定做的。', '亲爱的{name}，你今天这身我给满分。'],
      greetCold: ['……需要什么自己看吧。', '{name}。'],
      farewell: ['下次再来！', '记得，鞋子决定一切。', '拜~'],
      small: ['这周来了一位客人，一口气买了六套西装。', '莉莉安夫人的晚礼服都是从我这儿订的。', '你知道吗？看一个人有没有钱，先看鞋，再看表。'],
      happy: ['有个设计比赛选中了我的作品！'],
      stressed: ['业绩考核……这个月差一点。'],
      work: ['我卖的不是衣服，是别人看你的眼光。'],
      giftLove: ['哇，你的品味进步了！', '这个太美了！'],
      giftDislike: ['……我会找个地方放它的。'],
      onBrag: ['那你得来升级一下衣橱了！', '有钱就要让人看出来，懂吗？'],
      onTrouble: ['哎……那你先穿旧衣服吧，搭配好了也能看。'],
      advice: ['一套好西装是最划算的投资。', '去富人区之前，先换身衣服。'],
    },
  },
  {
    id: 'ben',
    name: '本杰明',
    nameEn: 'Benjamin Hale',
    age: 52,
    occupation: "Marlow's 小馆老板",
    district: '老城区',
    look: { skin: 1, hair: 0, hairColor: '#7a5a3a', top: '#f2f0ea', topShade: '#cfcac0', bottom: '#3a3a40', shoes: '#2a2a2a', accent: '#a33b2e', style: 'apron', beard: true, body: 'm' },
    traits: { materialism: 0.25, classConscious: 0.15, honesty: 0.8, loyalty: 0.75, empathy: 0.8, gamblingView: -0.2, prudence: 0.6, envy: 0.1, opportunism: 0.15, gossip: 0.5, perceptive: 0.6, temper: 0.3, sociability: 0.75, pride: 0.45 },
    bio: '接手父亲的小馆二十年，菜单几乎没变。他会给付不起饭钱的老客人记账。',
    goal: '把小馆传给值得信赖的人。',
    moneyView: '一家店能开下去，靠的是回头客，不是暴利。',
    gamblingAttitude: '他不赌，但也不说教。',
    startMoney: G(48000),
    income: G(8000),
    startDebt: G(30000),
    schedule: [
      { days: [1, 2, 3, 4, 5, 6], from: hm(10, 30), to: hm(23), loc: 'restaurant', spot: 'rest_host', act: 'work' },
      { days: [0], from: hm(9), to: hm(11), loc: 'store', spot: 'store_aisle', act: 'shop', chance: 0.5 },
      { days: [0], from: hm(14), to: hm(17), loc: 'city', spot: 'park_bench2', act: 'leisure', chance: 0.5 },
      // the restaurant is closed on Monday: he drives the week's food over to the kitchen
      { days: [0], from: hm(16, 30), to: hm(17, 30), loc: 'community_kitchen', spot: 'ck_line', act: 'volunteer', chance: 0.8 },
    ],
    circle: ['eileen', 'margaret', 'oldzhou', 'raymond', 'grace'],
    initial: { met: false, knowsName: false },
    giftLikes: ['wine', 'book', 'music'],
    giftDislikes: [],
    role: 'boss',
    voice: {
      greetStranger: ['欢迎！几位？', '随便坐。'],
      greetAcquaint: ['{name}，今天吃点什么？', '哦，{name}来了。'],
      greetWarm: ['{name}！我给你留了最后一份炖牛肉。', '老朋友来了！坐，坐。'],
      greetCold: ['……{name}。', '吃饭吗？'],
      farewell: ['吃饱了吗？慢走。', '下次再来。', '路上小心。'],
      small: ['这道炖牛肉的配方是我祖母的，七十年没变过。', '最近菜价涨得厉害，我还是没舍得提价。', '周伯每周二都来吃一碗汤，风雨无阻。'],
      happy: ['今晚满座！'],
      stressed: ['房东又要涨租金了……'],
      work: ['开餐馆，最重要的是让人想回来。'],
      giftLove: ['好酒！今晚打烊后我们喝一杯。', '你太客气了。'],
      giftDislike: ['……心意我收下了。'],
      onBrag: ['有钱了也别忘了常回来吃饭。'],
      onTrouble: ['这顿算我的，以后有钱再说。', '人总有低谷。来，先吃饱。'],
      advice: ['做生意也好，过日子也好，细水长流。'],
    },
  },
];

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export function npcDef(id: string): NpcDef {
  const d = NPC_BY_ID[id];
  if (!d) throw new Error(`unknown NPC ${id}`);
  return d;
}

/** Initial NPC↔NPC affinities (symmetric). */
export const INITIAL_TIES: [string, string, number][] = [
  ['eileen', 'daniel', 55],
  ['eileen', 'oldzhou', 70],
  ['eileen', 'tommy', 45],
  ['eileen', 'ben', 50],
  ['eileen', 'margaret', 30],
  ['victor', 'natasha', 35],
  ['victor', 'jack', 40],
  ['victor', 'lillian', 50],
  ['victor', 'alexander', 45],
  ['victor', 'marco', 25],
  ['alexander', 'lillian', 40],
  ['alexander', 'sophia', 45],
  ['sophia', 'grace', 40],
  ['sophia', 'lillian', 20],
  ['daniel', 'tommy', 60],
  ['daniel', 'kiki', 30],
  ['daniel', 'marco', 35],
  ['margaret', 'oldzhou', 55],
  ['margaret', 'ben', 40],
  ['raymond', 'kiki', 15],
  ['raymond', 'ben', 30],
  ['kiki', 'isabella', 65],
  ['kiki', 'tommy', 35],
  ['marco', 'tommy', 40],
  ['marco', 'natasha', 20],
  ['lillian', 'isabella', 45],
  ['oldzhou', 'ben', 50],
  ['natasha', 'jack', 45],
  ['natasha', 'tommy', 30],
  ['grace', 'ben', 35],
  ['grace', 'eileen', 30],
  ['tommy', 'isabella', 25],
];
