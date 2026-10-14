import { G, type Money } from '../core/money';
import type { PlayerStats, SkillId } from '../core/state';

export type ItemKind = 'food' | 'drink' | 'grocery' | 'outfit' | 'gift' | 'valuable' | 'vehicle' | 'book' | 'furniture' | 'misc';

export interface OutfitLook {
  top: string;
  topShade: string;
  bottom: string;
  shoes: string;
  accent?: string;
  /** visual style template */
  style: 'tee' | 'hoodie' | 'shirt' | 'suit' | 'dress' | 'gown' | 'jacket';
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  price: Money;
  desc: string;
  effects?: Partial<Record<keyof PlayerStats, number>>;
  /** minutes it takes to consume */
  useMinutes?: number;
  prestige?: number;
  look?: OutfitLook;
  giftTags?: string[];
  /** fraction of price recovered when sold (pawn/second hand) */
  resale?: number;
  vehicle?: { speed: number; prestige: number; upkeep: Money; tripCost: Money };
  skill?: { id: SkillId; amount: number; cap: number };
  comfort?: number;
  homePrestige?: number;
  /** for groceries: how many home meals it provides */
  meals?: number;
}

const food = (id: string, name: string, price: number, desc: string, effects: ItemDef['effects'], useMinutes = 15, giftTags?: string[]): ItemDef => ({
  id,
  name,
  kind: 'food',
  price: G(price),
  desc,
  effects,
  useMinutes,
  giftTags,
});

const drink = (id: string, name: string, price: number, desc: string, effects: ItemDef['effects'], useMinutes = 10, giftTags?: string[]): ItemDef => ({
  id,
  name,
  kind: 'drink',
  price: G(price),
  desc,
  effects,
  useMinutes,
  giftTags,
});

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  (
    [
      // convenience store
      food('instant_noodles', '杯面', 4, '便宜、快速，但吃多了会让人心情低落。', { hunger: -30, mood: -1 }, 10),
      food('rice_ball', '饭团', 3.5, '方便的小点心。', { hunger: -18 }, 5),
      food('sandwich', '便利店三明治', 7, '能顶一阵子。', { hunger: -35 }, 10),
      food('chocolate', '巧克力', 3, '一点甜味让人开心。', { hunger: -8, mood: 3 }, 3, ['sweet']),
      drink('water', '矿泉水', 1.5, '补充水分。', { energy: 2 }, 2),
      drink('canned_coffee', '罐装咖啡', 3, '提神，但会影响睡眠。', { energy: 8, sleep: 4, stress: 1 }, 3),
      drink('energy_drink', '能量饮料', 5, '短时间内精神大振，之后更累。', { energy: 18, sleep: 8, stress: 3, health: -1 }, 3),
      drink('beer_can', '罐装啤酒', 4, '下班后的一罐。', { mood: 4, stress: -4, drunk: 12 }, 10),
      { id: 'groceries_basic', name: '基础食材', kind: 'grocery', price: G(18), desc: '在家做饭用，可做 3 餐。', meals: 3, effects: { hunger: -45, mood: 2 }, useMinutes: 40 },
      { id: 'groceries_fresh', name: '新鲜食材', kind: 'grocery', price: G(32), desc: '新鲜蔬菜和肉，可做 3 餐，更健康。', meals: 3, effects: { hunger: -50, mood: 5, health: 2 }, useMinutes: 45 },
      { id: 'painkillers', name: '止痛药', kind: 'misc', price: G(8), desc: '缓解头痛和宿醉。', effects: { health: 4, stress: -3, drunk: -10 }, useMinutes: 2 },
      { id: 'strategy_card', name: '21点基本策略卡', kind: 'misc', price: G(5), desc: '赌场允许使用的策略卡。持有后可在21点桌查看基本策略建议。它不改变赔率，只帮你少犯错。' },
      { id: 'wine_bottle', name: '红酒（瓶装）', kind: 'gift', price: G(22), desc: '适合作为礼物。', giftTags: ['wine'] },
      { id: 'flowers', name: '花束', kind: 'gift', price: G(25), desc: '一束新鲜的花。', giftTags: ['flowers'] },
      { id: 'book_finance', name: '《个人理财入门》', kind: 'book', price: G(28), desc: '在家阅读可提升理财能力。', skill: { id: 'finance', amount: 8, cap: 40 }, useMinutes: 120, giftTags: ['book'] },
      { id: 'book_career', name: '《高效职场》', kind: 'book', price: G(24), desc: '在家阅读可提升工作能力。', skill: { id: 'work', amount: 7, cap: 40 }, useMinutes: 120, giftTags: ['book'] },
      { id: 'book_social', name: '《说话的艺术》', kind: 'book', price: G(22), desc: '在家阅读可提升社交能力。', skill: { id: 'social', amount: 7, cap: 40 }, useMinutes: 120, giftTags: ['book'] },
      { id: 'book_cards', name: '《赌场数学》', kind: 'book', price: G(30), desc: '讲解庄家优势与概率。读完你会更清楚：长期来看赌场总是赢家。', skill: { id: 'cards', amount: 10, cap: 50 }, useMinutes: 150, giftTags: ['book'] },

      // café
      drink('espresso', '意式浓缩', 4, '浓烈提神。', { energy: 12, sleep: 6, stress: 1 }, 5, ['coffee']),
      drink('latte', '拿铁', 5.5, '温暖顺滑。', { energy: 10, sleep: 5, mood: 3 }, 10, ['coffee']),
      food('croissant', '可颂', 4.5, '黄油香气。', { hunger: -15, mood: 2 }, 5, ['sweet']),
      food('bagel', '贝果三明治', 9, '扎实的一餐。', { hunger: -35, mood: 1 }, 10),
      food('cheesecake', '芝士蛋糕', 6, '甜蜜的小奢侈。', { hunger: -15, mood: 5 }, 8, ['sweet']),
      { id: 'coffee_beans', name: '精品咖啡豆', kind: 'gift', price: G(18), desc: '包装精美，适合送给咖啡爱好者。', giftTags: ['coffee'] },
      // not sold anywhere: a present from the landlady
      food('homemade_cookies', '玛格丽特的饼干', 0, '房东亲手烤的黄油饼干，装在铁盒里。', { hunger: -12, mood: 4 }, 5, ['sweet']),

      // restaurant
      food('lunch_set', '午市套餐', 18, '汤、主菜和饮料。', { hunger: -60, mood: 4 }, 30),
      food('pasta', '招牌意面', 24, 'Marlow 家的招牌。', { hunger: -55, mood: 6 }, 30),
      food('steak_dinner', '牛排晚餐', 48, '一顿像样的晚餐。', { hunger: -70, mood: 10, stress: -4 }, 45),
      drink('house_wine', '餐厅红酒（杯）', 12, '佐餐的一杯。', { mood: 6, stress: -6, drunk: 15 }, 15),
      food('dessert', '甜点拼盘', 9, '饭后甜点。', { hunger: -10, mood: 5 }, 10, ['sweet']),

      // bar
      drink('draft_beer', '生啤', 7, '冰凉的扎啤。', { mood: 5, stress: -6, drunk: 14 }, 15),
      drink('cocktail', '鸡尾酒', 13, '调酒师的手艺。', { mood: 7, stress: -7, drunk: 18 }, 15),
      drink('whiskey', '威士忌', 15, '烈酒，一饮而尽或慢慢品。', { mood: 6, stress: -9, drunk: 24 }, 15),
      drink('soda', '苏打水', 3, '不含酒精。', { energy: 2 }, 5),
      food('bar_snacks', '下酒小食', 8, '炸薯条和鸡翅。', { hunger: -22, mood: 2 }, 15),

      // casino bar
      drink('casino_cocktail', '赌场特调', 16, '「幸运七」特调。', { mood: 8, stress: -6, drunk: 18 }, 10),
      drink('champagne', '香槟（杯）', 28, '庆祝的味道。', { mood: 10, stress: -5, drunk: 16 }, 10),
      drink('mineral_water', '进口矿泉水', 4, '保持清醒。', { energy: 3, drunk: -4 }, 3),
      food('club_sandwich', '总汇三明治', 18, '赌场餐吧的经典。', { hunger: -40, mood: 2 }, 15),

      // fine dining & club
      food('tasting_menu', 'Lumière 品鉴菜单', 280, '七道菜的法式晚宴。', { hunger: -80, mood: 20, stress: -12 }, 120),
      drink('wine_pairing', '配餐酒', 160, '侍酒师精选。', { mood: 10, stress: -8, drunk: 22 }, 60),
      drink('club_scotch', '会所单一麦芽', 45, '只对会员与宾客供应。', { mood: 8, stress: -10, drunk: 20 }, 20),
      // the casino's members' floor
      food('sky_canapes', '冷盘与小食', 26, '天穹层会员休息室的自助餐台：生蚝、火腿和几样小点心。', { hunger: -35, mood: 4 }, 20),
      food('sky_hot', '热菜拼盘', 34, '主厨当天准备的几样热菜。', { hunger: -55, mood: 4 }, 25),
      food('sky_dessert', '甜品', 18, '马卡龙、水果和一小块蛋糕。', { hunger: -15, mood: 6 }, 10),
      drink('sky_tea', '伯爵茶', 12, '一壶热茶，适合在窗边坐一会儿。', { stress: -6, energy: 4 }, 15),
      drink('sky_cocktail', '天穹特调', 38, '金酒、接骨木花和柠檬，杯口一圈金箔。', { mood: 9, stress: -8, drunk: 18 }, 15),
      drink('sky_whisky', '三十年单一麦芽', 120, '一杯就是一顿饭钱。', { mood: 10, stress: -12, drunk: 22 }, 20),

      // the Grand Hotel's lobby lounge
      food('afternoon_tea', '英式下午茶', 88, '三层点心架：司康、黄瓜三明治和小蛋糕，配一壶红茶。', { hunger: -35, mood: 12, stress: -8 }, 60, ['sweet']),
      drink('darjeeling', '大吉岭红茶（壶）', 14, '骨瓷茶具，一壶可以续两次水。', { stress: -6, energy: 4 }, 20),
      drink('pour_over', '手冲单品咖啡', 16, '侍者在桌边现冲。', { energy: 10, sleep: 4, mood: 3 }, 10, ['coffee']),
      food('opera_cake', '歌剧院蛋糕', 18, '七层咖啡与巧克力，表面写着酒店的名字。', { hunger: -12, mood: 6 }, 8, ['sweet']),
      // the night market on the old pier (cash only)
      food('nm_noodles', '干炒牛河', 8, '大火炒出来的河粉，一大盘。', { hunger: -45, mood: 3 }, 15),
      food('nm_omelette', '蚵仔煎', 9, '鸡蛋、生蚝和番薯粉，边上煎得焦脆。', { hunger: -32, mood: 4 }, 12),
      food('nm_skewers', '烤串（十串）', 10, '羊肉、鸡翅和韭菜，撒满孜然。', { hunger: -30, mood: 4 }, 15),
      food('nm_fishballs', '咖喱鱼蛋', 5, '一串七颗，泡在咖喱汁里。', { hunger: -16, mood: 3 }, 6),
      food('nm_sweet_soup', '红豆沙', 4, '熬得绵绵的，放了陈皮。', { hunger: -10, mood: 4, stress: -2 }, 8, ['sweet']),
      drink('nm_milk_tea', '丝袜奶茶', 4, '茶味很浓，甜度自己加。', { energy: 6, mood: 2 }, 6),
      drink('nm_beer', '冰镇瓶装啤酒', 5, '从冰桶里捞出来的，瓶身全是水珠。', { mood: 4, stress: -5, drunk: 12 }, 12),
      { id: 'hair_clip', name: '珍珠发夹', kind: 'gift', price: G(15), desc: '夜市小摊上的仿珍珠发夹，做得挺精巧。', giftTags: ['beauty'] },
      { id: 'vinyl_record', name: '旧黑胶唱片', kind: 'gift', price: G(25), desc: '七十年代的爵士乐，封套有点旧，唱片没有划痕。', giftTags: ['music'] },
      // the pawn shop's second-hand shelf
      { id: 'guitar_used', name: '二手木吉他', kind: 'gift', price: G(320), desc: '琴颈上刻着前主人名字的缩写，音色还很亮。', giftTags: ['music'], resale: 0.4 },
      // the community kitchen (free)
      food('kitchen_meal', '食堂热饭', 0, '米饭、一勺炖菜和一碗例汤。管饱。', { hunger: -55, mood: 2 }, 20),
      // Whitestone Bay: the fishermen's diner, the fish market, the beach shack and the resort's restaurant
      food('isle_congee', '海鲜粥', 14, '早上第一锅，虾、蛤蜊和鱼片，撒一把葱。', { hunger: -38, mood: 3, health: 1 }, 15),
      food('isle_fish_rice', '炸鱼饭', 22, '当天的鱼裹面糊炸透，配一碗白饭和腌萝卜。', { hunger: -48, mood: 4 }, 15),
      food('isle_scallops', '蒜蓉蒸扇贝（六只）', 36, '粉丝垫底，蒜蓉堆得冒尖。', { hunger: -24, mood: 7 }, 15),
      food('isle_platter', '海鲜大拼盘', 88, '一大盘：螃蟹、濑尿虾、蛏子和一条清蒸鱼。够三个人吃。', { hunger: -60, mood: 10, social: 4 }, 30),
      { id: 'isle_fish', name: '新鲜海鱼', kind: 'grocery', price: G(28), desc: '渔船下午刚带回来的海鱼，带回家可以做 3 餐。', meals: 3, effects: { hunger: -50, mood: 6, health: 3 }, useMinutes: 45 },
      { id: 'isle_crab', name: '花蟹（两只）', kind: 'grocery', price: G(46), desc: '还在吐泡泡。带回家清蒸，可以做 2 餐。', meals: 2, effects: { hunger: -42, mood: 9, health: 2 }, useMinutes: 40 },
      drink('isle_coconut', '冰镇椰子', 9, '插一根吸管，椰子水很甜。', { energy: 4, mood: 3 }, 8),
      drink('isle_beer', '冰啤酒', 8, '海边小屋冰箱里的瓶装啤酒。', { mood: 4, stress: -4, drunk: 12 }, 12),
      food('isle_squid', '烤鱿鱼', 15, '整只鱿鱼刷上酱烤，切成圈。', { hunger: -24, mood: 4 }, 10),
      drink('isle_mojito', '莫吉托', 26, '青柠、薄荷和朗姆酒，杯沿插着一片青柠。', { mood: 6, stress: -4, drunk: 14 }, 15),
      food('isle_lobster', '芝士焗龙虾', 420, '整只本地龙虾，配黄油和白葡萄酒汁。', { hunger: -48, mood: 14, confidence: 3 }, 40),
      food('isle_tasting', '主厨海鲜套餐', 680, '六道菜，从生蚝到海胆，每道配一杯酒。', { hunger: -60, mood: 18, confidence: 4, drunk: 10 }, 90),
      drink('isle_champagne', '香槟（杯）', 120, '酒店酒窖里的年份香槟。', { mood: 6, drunk: 10 }, 15),

      // boutique gifts
      { id: 'perfume', name: '香水', kind: 'gift', price: G(160), desc: '精致的礼物。', giftTags: ['luxury', 'beauty'] },
      { id: 'cufflinks', name: '银质袖扣', kind: 'gift', price: G(900), desc: '讲究的礼物。', giftTags: ['luxury', 'formal'] },
      { id: 'concert_tickets', name: '爵士音乐会门票', kind: 'gift', price: G(120), desc: '两张周末音乐会门票。', giftTags: ['music'] },
      { id: 'champagne_bottle', name: '年份香槟（整瓶）', kind: 'gift', price: G(150), desc: '赌场会员精品店的香槟，装在丝绒盒里。', giftTags: ['wine', 'luxury'] },
      { id: 'praline_box', name: '手工巧克力礼盒', kind: 'gift', price: G(70), desc: '十二颗夹心巧克力，配一张手写卡片。', giftTags: ['sweet', 'luxury'] },
      { id: 'silk_scarf', name: '真丝方巾', kind: 'gift', price: G(230), desc: '印着灰港港口的地图。', giftTags: ['luxury', 'beauty'] },
      { id: 'basketball', name: '篮球', kind: 'gift', price: G(35), desc: '室外用篮球。', giftTags: ['sports'] },

      // valuables
      { id: 'watch_basic', name: '石英腕表', kind: 'valuable', price: G(120), desc: '普通但体面的手表。', prestige: 0.2, resale: 0.35 },
      { id: 'watch_luxury', name: 'Aurelius 机械名表', kind: 'valuable', price: G(12000), desc: '懂行的人一眼就能认出来。', prestige: 1, resale: 0.62 },
      { id: 'jewelry', name: '金饰', kind: 'valuable', price: G(2500), desc: '黄金首饰，保值性一般。', prestige: 0.4, resale: 0.55 },

      // vehicles
      { id: 'bicycle', name: '自行车', kind: 'vehicle', price: G(260), desc: '骑行出行，比步行快。', vehicle: { speed: 1.35, prestige: 0, upkeep: G(5), tripCost: 0 }, resale: 0.45 },
      { id: 'used_car', name: '二手掀背车', kind: 'vehicle', price: G(6800), desc: '开了很多年的老车，能跑。', vehicle: { speed: 1, prestige: 1, upkeep: G(160), tripCost: G(3) }, resale: 0.6 },
      { id: 'sedan', name: '新款轿车', kind: 'vehicle', price: G(32000), desc: '舒适可靠的家用车。', vehicle: { speed: 1, prestige: 2, upkeep: G(320), tripCost: G(4) }, resale: 0.7 },
      { id: 'sports_car', name: 'Vantor GT 跑车', kind: 'vehicle', price: G(145000), desc: '引擎声能让整条街回头。', vehicle: { speed: 1, prestige: 4, upkeep: G(1100), tripCost: G(9) }, resale: 0.68 },
      { id: 'luxury_car', name: 'Regalia 豪华轿车', kind: 'vehicle', price: G(380000), desc: '真正的身份象征。', vehicle: { speed: 1, prestige: 5, upkeep: G(2600), tripCost: G(12) }, resale: 0.66 },

      // furniture (ordered online, delivered home)
      { id: 'furn_bed_good', name: '记忆棉床垫', kind: 'furniture', price: G(680), desc: '睡眠恢复效率提升。', comfort: 0.12, homePrestige: 0.1 },
      { id: 'furn_bed_luxury', name: '手工定制大床', kind: 'furniture', price: G(5200), desc: '睡得像酒店一样。', comfort: 0.22, homePrestige: 0.4 },
      { id: 'furn_sofa', name: '布艺沙发', kind: 'furniture', price: G(540), desc: '在家放松更有效。', comfort: 0.05, homePrestige: 0.2 },
      { id: 'furn_tv', name: '大屏电视', kind: 'furniture', price: G(980), desc: '看节目可以减压。', comfort: 0.03, homePrestige: 0.2 },
      { id: 'furn_plants', name: '室内绿植', kind: 'furniture', price: G(120), desc: '让家更有生气。', comfort: 0.02, homePrestige: 0.1 },
      { id: 'furn_art', name: '当代艺术画作', kind: 'furniture', price: G(8800), desc: '客人会注意到它。', comfort: 0.01, homePrestige: 0.8 },
      { id: 'furn_treadmill', name: '跑步机', kind: 'furniture', price: G(1450), desc: '在家运动，缓解压力。', comfort: 0.02, homePrestige: 0.1 },
      { id: 'furn_piano', name: '立式钢琴', kind: 'furniture', price: G(6400), desc: '优雅的爱好。', comfort: 0.03, homePrestige: 0.6 },
    ] as ItemDef[]
  ).map((d) => [d.id, d]),
);

export const OUTFITS: Record<string, ItemDef> = {
  outfit_casual: {
    id: 'outfit_casual',
    name: '日常休闲装',
    kind: 'outfit',
    price: G(60),
    desc: 'T 恤和牛仔裤，普普通通。',
    prestige: 1,
    look: { top: '#4f7fbf', topShade: '#3a5f94', bottom: '#3b4a66', shoes: '#2a2a2e', style: 'tee' },
    resale: 0.1,
  },
  outfit_hoodie: {
    id: 'outfit_hoodie',
    name: '连帽运动装',
    kind: 'outfit',
    price: G(45),
    desc: '舒服，但不太正式。',
    prestige: 0,
    look: { top: '#7a8a96', topShade: '#5c6a75', bottom: '#2f3540', shoes: '#d8d8d8', style: 'hoodie' },
    resale: 0.1,
  },
  outfit_smart: {
    id: 'outfit_smart',
    name: '商务休闲装',
    kind: 'outfit',
    price: G(180),
    desc: '衬衫加卡其裤，得体。',
    prestige: 2,
    look: { top: '#e6e1d3', topShade: '#c4bfae', bottom: '#8a7556', shoes: '#4a3424', style: 'shirt' },
    resale: 0.15,
  },
  outfit_suit: {
    id: 'outfit_suit',
    name: '深色西装',
    kind: 'outfit',
    price: G(650),
    desc: '正式场合与金融行业的标准着装。',
    prestige: 3,
    look: { top: '#2b3448', topShade: '#1d2433', bottom: '#232b3b', shoes: '#141414', accent: '#c8c8d0', style: 'suit' },
    resale: 0.2,
  },
  outfit_evening: {
    id: 'outfit_evening',
    name: '晚宴礼服',
    kind: 'outfit',
    price: G(1800),
    desc: '出席晚宴与私人会所的着装。',
    prestige: 4,
    look: { top: '#5a1630', topShade: '#3f0e21', bottom: '#2a0a17', shoes: '#111111', accent: '#e0c27a', style: 'gown' },
    resale: 0.25,
  },
  outfit_designer: {
    id: 'outfit_designer',
    name: '设计师品牌套装',
    kind: 'outfit',
    price: G(4500),
    desc: '剪裁考究，懂行的人能看出价值。',
    prestige: 4,
    look: { top: '#e9e4dc', topShade: '#c9c2b6', bottom: '#1b1b1f', shoes: '#0d0d0d', accent: '#b8955a', style: 'jacket' },
    resale: 0.3,
  },
  outfit_haute: {
    id: 'outfit_haute',
    name: '高级定制',
    kind: 'outfit',
    price: G(18000),
    desc: '只为极少数人量身定制。',
    prestige: 5,
    look: { top: '#101018', topShade: '#07070c', bottom: '#0b0b12', shoes: '#050505', accent: '#e8d08a', style: 'suit' },
    resale: 0.35,
  },
};

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS[id] ?? OUTFITS[id];
}

export interface ShopDef {
  id: string;
  name: string;
  items: string[];
  /** which payment methods are accepted */
  accepts: ('cash' | 'card')[];
  greeting: string;
  /** a second-hand stall sells below the list price */
  priceFactor?: number;
}

export const SHOPS: Record<string, ShopDef> = {
  store: {
    id: 'store',
    name: 'QuickMart 便利店',
    items: ['instant_noodles', 'rice_ball', 'sandwich', 'chocolate', 'water', 'canned_coffee', 'energy_drink', 'beer_can', 'groceries_basic', 'groceries_fresh', 'painkillers', 'wine_bottle', 'flowers', 'strategy_card', 'book_finance', 'book_career', 'book_social', 'book_cards'],
    accepts: ['cash', 'card'],
    greeting: '欢迎光临 QuickMart！',
  },
  cafe: {
    id: 'cafe',
    name: 'Harbor Bean 咖啡馆',
    items: ['espresso', 'latte', 'croissant', 'bagel', 'cheesecake', 'coffee_beans'],
    accepts: ['cash', 'card'],
    greeting: '今天想喝点什么？',
  },
  restaurant: {
    id: 'restaurant',
    name: "Marlow's 小馆",
    items: ['lunch_set', 'pasta', 'steak_dinner', 'house_wine', 'dessert'],
    accepts: ['cash', 'card'],
    greeting: '请坐，这是菜单。',
  },
  bar: {
    id: 'bar',
    name: 'Rusty Anchor 酒吧',
    items: ['draft_beer', 'cocktail', 'whiskey', 'soda', 'bar_snacks'],
    accepts: ['cash', 'card'],
    greeting: '来点什么？',
  },
  casino_bar: {
    id: 'casino_bar',
    name: '幸运七酒吧',
    items: ['casino_cocktail', 'champagne', 'mineral_water', 'club_sandwich'],
    accepts: ['cash', 'card'],
    greeting: '欢迎来到幸运七。',
  },
  sky_lounge: {
    id: 'sky_lounge',
    name: '天穹层 · 会员休息室',
    items: ['sky_canapes', 'sky_hot', 'sky_dessert', 'sky_tea', 'mineral_water'],
    accepts: ['cash', 'card'],
    greeting: '自助餐台对天穹层的客人免费开放，请随意。',
  },
  sky_bar: {
    id: 'sky_bar',
    name: '天穹酒廊',
    items: ['sky_cocktail', 'champagne', 'sky_whisky', 'mineral_water'],
    accepts: ['cash', 'card'],
    greeting: '晚上好。窗边的位子还空着。',
  },
  fine_dining: {
    id: 'fine_dining',
    name: 'Lumière 法餐厅',
    items: ['tasting_menu', 'wine_pairing'],
    accepts: ['card'],
    greeting: '晚上好，欢迎光临 Lumière。',
  },
  club_bar: {
    id: 'club_bar',
    name: '子午线会所吧台',
    items: ['club_scotch', 'mineral_water'],
    accepts: ['card'],
    greeting: '先生/女士，需要什么？',
  },
  boutique: {
    id: 'boutique',
    name: 'Thread & Needle 服装店',
    items: ['outfit_hoodie', 'outfit_casual', 'outfit_smart', 'outfit_suit', 'outfit_evening', 'perfume', 'watch_basic', 'basketball', 'concert_tickets'],
    accepts: ['cash', 'card'],
    greeting: '随便看看，有喜欢的可以试穿。',
  },
  luxury: {
    id: 'luxury',
    name: 'Maison Aurèle 精品店',
    items: ['outfit_designer', 'outfit_haute', 'watch_luxury', 'jewelry', 'cufflinks', 'perfume'],
    accepts: ['card'],
    greeting: '欢迎光临 Maison Aurèle。',
  },
  motors: {
    id: 'motors',
    name: '灰港汽车行',
    items: ['bicycle', 'used_car', 'sedan', 'sports_car', 'luxury_car'],
    accepts: ['card'],
    greeting: '看车吗？今天有优惠。',
  },
  hotel_lounge: {
    id: 'hotel_lounge',
    name: '灰港大酒店 · 大堂吧',
    items: ['afternoon_tea', 'darjeeling', 'pour_over', 'opera_cake', 'champagne'],
    accepts: ['cash', 'card'],
    greeting: '下午好。靠窗的位子还空着。',
  },
  // the night market's stalls take cash only
  nm_wok: {
    id: 'nm_wok',
    name: '阿珍炒档',
    items: ['nm_noodles', 'nm_omelette', 'nm_beer'],
    accepts: ['cash'],
    greeting: '坐！炒河粉还是蚵仔煎？',
  },
  nm_grill: {
    id: 'nm_grill',
    name: '老马烤串',
    items: ['nm_skewers', 'nm_fishballs', 'nm_beer'],
    accepts: ['cash'],
    greeting: '刚烤好的，趁热。',
  },
  nm_sweets: {
    id: 'nm_sweets',
    name: '陈记糖水',
    items: ['nm_sweet_soup', 'nm_milk_tea'],
    accepts: ['cash'],
    greeting: '红豆沙今天熬了四个钟头。',
  },
  nm_books: {
    id: 'nm_books',
    name: '旧书摊',
    items: ['book_finance', 'book_career', 'book_social', 'book_cards'],
    accepts: ['cash'],
    greeting: '都是别人看过的，内容一个字没少。半价。',
    priceFactor: 0.5,
  },
  nm_trinkets: {
    id: 'nm_trinkets',
    name: '杂货小摊',
    items: ['hair_clip', 'vinyl_record', 'flowers'],
    accepts: ['cash'],
    greeting: '随便挑，看中了可以讲价——开玩笑的，不讲价。',
  },
  // Whitestone Bay
  isle_diner: {
    id: 'isle_diner',
    name: '老船长食堂',
    items: ['isle_congee', 'isle_fish_rice', 'isle_scallops', 'isle_platter', 'nm_beer'],
    accepts: ['cash'],
    greeting: '随便坐。鱼都是码头上买的，船一回来就送到后厨。',
  },
  isle_market: {
    id: 'isle_market',
    name: '白石湾鱼市',
    items: ['isle_fish', 'isle_crab'],
    accepts: ['cash'],
    greeting: '刚上岸的！要鱼还是要蟹？',
  },
  isle_shack: {
    id: 'isle_shack',
    name: '海滩小屋 SHACK',
    items: ['isle_coconut', 'isle_beer', 'isle_squid', 'isle_mojito'],
    accepts: ['cash', 'card'],
    greeting: '要冰的还是要更冰的？',
  },
  isle_restaurant: {
    id: 'isle_restaurant',
    name: '灯塔海景餐厅',
    items: ['isle_lobster', 'isle_tasting', 'isle_champagne'],
    accepts: ['card', 'cash'],
    greeting: '您好。龙虾是本地渔船捞的，每天现做。',
  },
  furniture: {
    id: 'furniture',
    name: '家居网上商城',
    items: ['furn_bed_good', 'furn_bed_luxury', 'furn_sofa', 'furn_tv', 'furn_plants', 'furn_art', 'furn_treadmill', 'furn_piano'],
    accepts: ['card'],
    greeting: '下单后次日送货上门。',
  },
};
