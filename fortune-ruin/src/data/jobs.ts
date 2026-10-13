import { G, type Money } from '../core/money';
import type { SkillId } from '../core/state';
import { hm } from '../core/calendar';

export interface JobLevel {
  title: string;
  payMult: number;
  shiftsRequired: number;
  perfRequired: number;
}

export interface JobDef {
  id: string;
  title: string;
  employer: string;
  location: string;
  /** spot id of the work station inside the location */
  station: string;
  days: number[];
  start: number;
  end: number;
  payType: 'hourly' | 'salary';
  /** hourly wage or monthly salary */
  rate: Money;
  payEveryDays: number;
  tipsPerHour?: Money;
  stressPerHour: number;
  energyPerHour: number;
  hungerPerHour: number;
  skill: SkillId;
  requirements: { skills?: Partial<Record<SkillId, number>>; minOutfit?: number; minTrust?: number; minCredit?: number };
  levels: JobLevel[];
  boss: string | null;
  bossName: string;
  coworkers: string[];
  desc: string;
  /** flexible gig: can work any hours within the window */
  flexible?: boolean;
  /** an employee of the casino may not gamble there */
  casinoEmployee?: boolean;
}

const WEEKDAYS = [0, 1, 2, 3, 4];

export const JOBS: Record<string, JobDef> = {
  office_clerk: {
    id: 'office_clerk',
    title: '行政文员',
    employer: '灰港物流 Harbor Logistics',
    location: 'office',
    station: 'desk_player',
    days: WEEKDAYS,
    start: hm(9),
    end: hm(17),
    payType: 'salary',
    rate: G(4400),
    payEveryDays: 14,
    stressPerHour: 1.6,
    energyPerHour: 3.2,
    hungerPerHour: 0,
    skill: 'work',
    requirements: {},
    levels: [
      { title: '行政文员', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '高级文员', payMult: 1.25, shiftsRequired: 24, perfRequired: 62 },
      { title: '运营主管', payMult: 1.65, shiftsRequired: 60, perfRequired: 70 },
      { title: '运营经理', payMult: 2.2, shiftsRequired: 120, perfRequired: 76 },
    ],
    boss: 'raymond',
    bossName: '雷蒙德',
    coworkers: ['kiki'],
    desc: '工作日 9:00–17:00。稳定、平淡，月薪 4,400 G，每两周发一次。',
  },
  barista: {
    id: 'barista',
    title: '咖啡师（兼职）',
    employer: 'Harbor Bean 咖啡馆',
    location: 'cafe',
    station: 'cafe_counter2',
    days: [0, 1, 2, 3, 4, 5],
    start: hm(7),
    end: hm(12),
    payType: 'hourly',
    rate: G(15),
    payEveryDays: 7,
    tipsPerHour: G(3),
    stressPerHour: 1.2,
    energyPerHour: 4,
    hungerPerHour: 0,
    skill: 'service',
    requirements: {},
    levels: [
      { title: '咖啡师（兼职）', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '资深咖啡师', payMult: 1.2, shiftsRequired: 30, perfRequired: 65 },
    ],
    boss: null,
    bossName: '店主朴太太',
    coworkers: ['eileen'],
    desc: '周一至周六 7:00–12:00，时薪 15 G + 小费，每周结算。',
  },
  waiter: {
    id: 'waiter',
    title: '餐厅服务员',
    employer: "Marlow's 小馆",
    location: 'restaurant',
    station: 'rest_pass',
    days: [1, 2, 3, 4, 5, 6],
    start: hm(17),
    end: hm(23),
    payType: 'hourly',
    rate: G(16),
    payEveryDays: 7,
    tipsPerHour: G(7),
    stressPerHour: 1.8,
    energyPerHour: 5,
    hungerPerHour: 0,
    skill: 'service',
    requirements: {},
    levels: [
      { title: '餐厅服务员', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '领班', payMult: 1.3, shiftsRequired: 36, perfRequired: 68 },
    ],
    boss: 'ben',
    bossName: '本杰明',
    coworkers: [],
    desc: '周二至周日 17:00–23:00，时薪 16 G + 小费，每周结算。',
  },
  bartender: {
    id: 'bartender',
    title: '酒吧助理调酒师',
    employer: 'Rusty Anchor 酒吧',
    location: 'bar',
    station: 'bar_back',
    days: [3, 4, 5, 6],
    start: hm(19),
    end: hm(26),
    payType: 'hourly',
    rate: G(15),
    payEveryDays: 7,
    tipsPerHour: G(10),
    stressPerHour: 1.5,
    energyPerHour: 4.5,
    hungerPerHour: 0,
    skill: 'service',
    requirements: { skills: { social: 15 } },
    levels: [
      { title: '助理调酒师', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '调酒师', payMult: 1.35, shiftsRequired: 30, perfRequired: 66 },
    ],
    boss: null,
    bossName: '老板乔',
    coworkers: ['tommy'],
    desc: '周四至周日 19:00–次日 2:00，时薪 15 G + 小费。夜班会打乱作息。',
  },
  dealer: {
    id: 'dealer',
    title: '见习荷官',
    employer: '灰港大赌场',
    location: 'casino',
    station: 'dealer_staff',
    days: [2, 3, 4, 5, 6],
    start: hm(18),
    end: hm(26),
    payType: 'hourly',
    rate: G(24),
    payEveryDays: 14,
    tipsPerHour: G(4),
    stressPerHour: 2,
    energyPerHour: 4.2,
    hungerPerHour: 0,
    skill: 'cards',
    requirements: { skills: { cards: 25 }, minTrust: 0, minOutfit: 2 },
    levels: [
      { title: '见习荷官', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '荷官', payMult: 1.25, shiftsRequired: 30, perfRequired: 65 },
      { title: '赌区主管', payMult: 1.7, shiftsRequired: 90, perfRequired: 74 },
    ],
    boss: 'natasha',
    bossName: '娜塔莎',
    coworkers: ['natasha'],
    desc: '周三至周日 18:00–次日 2:00。赌场员工禁止在本赌场下注。',
    casinoEmployee: true,
  },
  analyst: {
    id: 'analyst',
    title: '投资分析师',
    employer: '北门资本 Northgate Capital',
    location: 'finance_office',
    station: 'desk_analyst',
    days: WEEKDAYS,
    start: hm(8, 30),
    end: hm(18, 30),
    payType: 'salary',
    rate: G(9800),
    payEveryDays: 14,
    stressPerHour: 2.6,
    energyPerHour: 3.6,
    hungerPerHour: 0,
    skill: 'finance',
    requirements: { skills: { finance: 40, work: 20 }, minOutfit: 3, minTrust: 10, minCredit: 640 },
    levels: [
      { title: '投资分析师', payMult: 1, shiftsRequired: 0, perfRequired: 0 },
      { title: '高级分析师', payMult: 1.4, shiftsRequired: 40, perfRequired: 70 },
      { title: '投资经理', payMult: 2, shiftsRequired: 100, perfRequired: 76 },
      { title: '合伙人', payMult: 3.2, shiftsRequired: 200, perfRequired: 82 },
    ],
    boss: 'sophia',
    bossName: '索菲亚',
    coworkers: ['sophia'],
    desc: '工作日 8:30–18:30，月薪 9,800 G 起。需要理财能力、得体着装和良好的信用记录。',
  },
  courier: {
    id: 'courier',
    title: '灰港闪送骑手',
    employer: '灰港闪送 App',
    location: 'city',
    station: '',
    days: [0, 1, 2, 3, 4, 5, 6],
    start: hm(8),
    end: hm(21),
    payType: 'hourly',
    rate: G(12),
    payEveryDays: 1,
    tipsPerHour: G(1.5),
    stressPerHour: 1.4,
    energyPerHour: 7,
    hungerPerHour: 3,
    skill: 'fitness',
    requirements: {},
    levels: [{ title: '闪送骑手', payMult: 1, shiftsRequired: 0, perfRequired: 0 }],
    boss: null,
    bossName: '平台',
    coworkers: [],
    desc: '每天 8:00–21:00 随时接单（手机上开工）。按小时计酬，次日到账，很累。',
    flexible: true,
  },
};
