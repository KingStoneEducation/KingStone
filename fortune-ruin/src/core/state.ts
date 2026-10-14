import type { Money } from './money';
import type { RngState } from './rng';
import type { BlackjackState } from '../casino/BlackjackEngine';
import type { BaccaratState } from '../casino/BaccaratEngine';
import type { RouletteState } from '../casino/RouletteEngine';
import type { PokerState } from '../casino/PokerEngine';

/**
 * The complete, JSON-serializable world state. Everything that must survive a
 * save/load lives here; systems are stateless wrappers around this object.
 */

export const SAVE_VERSION = 1;

export type Dir = 'down' | 'up' | 'left' | 'right';

export type LocationId = string;
export type NpcId = string;
export type ItemId = string;

// ------------------------------------------------------------------ player

export interface Appearance {
  skin: number;
  hairStyle: number;
  hairColor: number;
  /** pronoun used in narration */
  pronoun: 'he' | 'she' | 'they';
  /** body template for the sprite (defaults from the pronoun) */
  body?: 'm' | 'f';
  glasses?: boolean;
  beard?: boolean;
  earrings?: boolean;
  hat?: 'beanie' | 'cap' | null;
  /** colour of the top for everyday clothes (hex) */
  topColor?: string;
  /** portrait eye shape and colour (indices into data/faces) */
  eyes?: number;
  eyeColor?: number;
}

export type PersonalityTendency = 'cautious' | 'bold' | 'sociable' | 'rational';
export type BackgroundId = 'local' | 'newcomer' | 'graduate' | 'restart';

export interface PlayerStats {
  /** physical stamina 0..100 */
  energy: number;
  /** 0 = full, 100 = starving */
  hunger: number;
  /** rest 0..100 (100 = fully rested) */
  sleep: number;
  stress: number;
  /** 0..100, 50 = neutral */
  mood: number;
  confidence: number;
  impulsivity: number;
  /** social fulfilment 0..100 */
  social: number;
  health: number;
  /** intoxication 0..100 */
  drunk: number;
}

export type SkillId = 'work' | 'finance' | 'social' | 'fitness' | 'service' | 'cards';

export interface PlayerState {
  name: string;
  appearance: Appearance;
  personality: PersonalityTendency;
  background: BackgroundId;
  stats: PlayerStats;
  skills: Record<SkillId, number>;
  outfit: ItemId;
  /** Public reputations, -100..100 */
  reputation: { social: number; casino: number; trust: number };
  creditScore: number;
  lastMealAt: number;
  lastSleepAt: number;
  awakeSince: number;
  vehicle: ItemId | null;
  /** Running mood modifiers from events that decay over time */
  moodBuffs: { id: string; amount: number; until: number; label: string }[];
  flags: Record<string, number | boolean | string>;
}

// ------------------------------------------------------------------ world

export interface WorldState {
  location: LocationId;
  x: number;
  y: number;
  facing: Dir;
  /** Where the player stood in the city before entering a building. */
  cityReturn: { x: number; y: number } | null;
  visited: Record<LocationId, number>;
  /** day of the latest visit to each place */
  lastVisit?: Record<LocationId, number>;
}

// ------------------------------------------------------------------ economy

export type AccountId = 'cash' | 'bank' | 'chips';

export type TxnCategory =
  | 'salary'
  | 'tips'
  | 'bonus'
  | 'casino_buyin'
  | 'casino_cashout'
  | 'casino_bet'
  | 'casino_payout'
  | 'deposit'
  | 'withdrawal'
  | 'rent'
  | 'utilities'
  | 'phone'
  | 'insurance'
  | 'food'
  | 'groceries'
  | 'drinks'
  | 'transport'
  | 'entertainment'
  | 'clothing'
  | 'furniture'
  | 'housing'
  | 'vehicle'
  | 'fees'
  | 'interest_income'
  | 'interest_paid'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'gift_given'
  | 'gift_received'
  | 'lend'
  | 'repaid_to_you'
  | 'medical'
  | 'investment_buy'
  | 'investment_sell'
  | 'dividend'
  | 'property_sale'
  | 'property_purchase'
  | 'business_income'
  | 'donation'
  | 'business_cost'
  | 'item_sale'
  | 'tax'
  | 'other';

export interface Txn {
  id: number;
  t: number;
  /** `cash` | `bank` | `chips` | `ext:<entity>` */
  from: string;
  to: string;
  amount: Money;
  cat: TxnCategory;
  memo: string;
}

export interface Loan {
  id: string;
  lender: string;
  lenderName: string;
  principal: Money;
  balance: Money;
  aprBp: number;
  termMonths: number;
  monthlyPayment: Money;
  nextDueDay: number;
  paymentsMade: number;
  missedPayments: number;
  startDay: number;
  status: 'active' | 'paid' | 'default';
  kind: 'personal' | 'mortgage' | 'payday' | 'casino_marker' | 'installment' | 'friend';
}

export interface Bill {
  id: string;
  kind: 'rent' | 'utilities' | 'phone' | 'insurance' | 'loan' | 'maintenance' | 'other';
  payee: string;
  payeeName: string;
  amount: Money;
  issuedDay: number;
  dueDay: number;
  paidDay: number | null;
  lateFees: Money;
  loanId?: string;
  memo: string;
}

export interface FlowDay {
  day: number;
  income: Money;
  expenses: Money;
  casinoNet: Money;
  byCat: Partial<Record<TxnCategory, Money>>;
}

export interface Holding {
  units: number;
  costBasis: Money;
}

export interface EconomyState {
  accounts: Record<AccountId, Money>;
  ledger: Txn[];
  seq: number;
  /** Lifetime external inflows/outflows per account (for the conservation invariant). */
  externalIn: Record<AccountId, Money>;
  externalOut: Record<AccountId, Money>;
  initial: Record<AccountId, Money>;
  lifetimeByCat: Partial<Record<TxnCategory, Money>>;
  today: FlowDay;
  history: FlowDay[];
  loans: Loan[];
  bills: Bill[];
  billSeq: number;
  atmDay: number;
  atmWithdrawn: Money;
  holdings: Record<string, Holding>;
  /** Money other people owe the player (informal loans) */
  receivables: { id: string; npc: NpcId; amount: Money; lentDay: number; dueDay: number; repaid: Money; status: 'open' | 'repaid' | 'written_off' }[];
  autopay: boolean;
  /** Shares in other people's businesses (valued at the player's share of the business) */
  stakes: Stake[];
}

export interface Stake {
  id: string;
  name: string;
  npc: NpcId;
  /** total the player put in */
  invested: Money;
  /** current estimate of the stake (share × business equity) */
  value: Money;
  /** fraction of the business owned, 0..1 */
  share: number;
  since: number;
  /** dividends and buy-back money received so far */
  received: Money;
  status: 'active' | 'sold' | 'closed';
}

// ------------------------------------------------------------------ inventory / housing / career

export interface InventoryState {
  items: Record<ItemId, number>;
  outfits: ItemId[];
}

export interface HousingState {
  homeId: string;
  tenure: 'rent' | 'own';
  rent: Money;
  leaseStartDay: number;
  owned: string[];
  furniture: Record<string, ItemId[]>;
  pendingRent: { amount: Money; effectiveDay: number } | null;
  overdueDays: number;
  evictionNoticeDay: number | null;
  guestsHosted: number;
}

export interface JobState {
  jobId: string;
  level: number;
  performance: number;
  hiredDay: number;
  shifts: number;
  lates: number;
  absences: number;
  warnings: number;
  lastShiftDay: number;
  /** Earned but not yet paid wages */
  accrued: Money;
  nextPayDay: number;
  /** day index of a scheduled shift already worked today */
  workedToday: number;
  status: 'active' | 'fired' | 'quit';
  promotionsDeclined: number;
}

export interface CareerState {
  jobs: JobState[];
  history: { jobId: string; start: number; end: number; reason: string; level: number }[];
  applications: { jobId: string; day: number; decideDay: number; status: 'pending' | 'accepted' | 'rejected' }[];
}

// ------------------------------------------------------------------ casino

export type MemberTier = 'visitor' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type GameKind = 'blackjack' | 'baccarat' | 'roulette' | 'poker' | 'slots';

export type TableEngineState =
  | { game: 'blackjack'; s: BlackjackState }
  | { game: 'baccarat'; s: BaccaratState }
  | { game: 'roulette'; s: RouletteState }
  | { game: 'poker'; s: PokerState };

export interface Patron {
  id: string;
  name: string;
  look: number;
  bankroll: Money;
  startBankroll: Money;
  /** 0..1: how big a share of bankroll they bet */
  risk: number;
  /** 0..1: strategy accuracy */
  skill: number;
  /** -100..100 */
  mood: number;
  favorite: GameKind;
  style: 'basic' | 'cautious' | 'dealer-mimic' | 'reckless';
  superstition: number;
  /** seat currently occupied, e.g. "bj1:2" */
  seat: string | null;
  arriveAt: number;
  leaveAt: number;
  /** stop-loss & win goal multipliers relative to start bankroll */
  stopLoss: number;
  winGoal: number;
  wins: number;
  losses: number;
  streak: number;
  /** linked named NPC, if any */
  npc?: NpcId;
  /** poker temperament (see pokerAI POKER_STYLES) */
  pokerStyle?: string;
  state: 'arriving' | 'playing' | 'wandering' | 'leaving' | 'gone';
}

export interface CasinoState {
  membership: {
    tier: MemberTier;
    points: number;
    lifetimePoints: number;
    lifetimeHandle: Money;
    lifetimeTheo: Money;
    joinedDay: number;
    lastVisitDay: number;
    visits: number;
    tierReviewDay: number;
  };
  tables: Record<string, TableEngineState>;
  patrons: Patron[];
  patronSeq: number;
  session: { start: number; startChips: Money; buyIn: Money; net: Money; rounds: number; peak: Money } | null;
  stats: {
    byGame: Record<GameKind, { rounds: number; wagered: Money; net: Money }>;
    biggestWin: Money;
    biggestLoss: Money;
    sessions: { start: number; end: number; net: Money; rounds: number }[];
    lossStreak: number;
    winStreak: number;
  };
  /** surveillance attention on blackjack bet spreading with the count */
  heat: number;
  countSamples: { tc: number; bet: Money }[];
  barredBlackjack: boolean;
  bannedUntil: number;
  comps: Money;
  securityCheckedDay: number;
  hostOffers: { id: string; kind: string; day: number; used: boolean }[];
  creditLine: Money;
  jackpot: Money;
  /** last round whose payouts were credited, per table */
  paidRounds: Record<string, number>;
  /** table the player is seated at (restored on load) */
  activeTable: string | null;
  /** extra access granted by the host */
  invites: { highLimit: number; vip: number };
}

// ------------------------------------------------------------------ NPCs & social

export interface NpcRuntime {
  id: NpcId;
  location: LocationId | null;
  spot: string | null;
  activity: string;
  /** set while travelling between locations */
  travel: { from: LocationId | null; to: LocationId | null; depart: number; arrive: number } | null;
  mood: number;
  stress: number;
  money: Money;
  debt: Money;
  overrides: { location: LocationId | null; spot: string | null; activity: string; from: number; until: number; reason: string }[];
  flags: Record<string, number | boolean | string>;
}

export interface RelDims {
  affection: number;
  trust: number;
  respect: number;
  attraction: number;
  envy: number;
  dependency: number;
  fear: number;
  familiarity: number;
}

export interface Relationship extends RelDims {
  met: boolean;
  knowsName: boolean;
  lastTalk: number;
  talkDay: number;
  talksToday: number;
  lastGiftDay: number;
  lastContact: number;
  status: 'stranger' | 'acquaintance' | 'friend' | 'close' | 'partner' | 'estranged' | 'rival';
  recentLines: string[];
  flags: Record<string, number | boolean | string>;
  history: { day: number; affection: number; trust: number; respect: number }[];
}

export type MemorySource = 'witnessed' | 'told' | 'rumor' | 'self' | 'inferred';

export interface Memory {
  id: number;
  npc: NpcId;
  t: number;
  kind: string;
  /** 'player' or another NPC id */
  about: string;
  importance: number;
  /** emotional colouring -100..100 from this NPC's point of view */
  valence: number;
  source: MemorySource;
  /** 0..1 belief in accuracy */
  reliability: number;
  /** who passed it on (rumors / told) */
  via?: string;
  data: Record<string, number | string | boolean>;
  sharedWith: NpcId[];
  /** set when the memory has been talked about with the player */
  discussed?: boolean;
}

export interface WealthBelief {
  estimate: Money;
  confidence: number;
  t: number;
  basis: string;
}

export interface Belief {
  wealth: WealthBelief | null;
  outfitPrestige: number;
  knowsJob: string | null;
  knowsHome: string | null;
  knowsDebt: boolean;
  knowsGambling: number;
  lastSeen: number;
}

export type EncounterKind = 'chat' | 'gossip' | 'toast' | 'comfort' | 'argue';

/** Two named NPCs talking to each other somewhere in the world. */
export interface Encounter {
  id: number;
  /** who starts (and, if needed, walks over) */
  a: NpcId;
  b: NpcId;
  kind: EncounterKind;
  location: LocationId;
  start: number;
  end: number;
  /** gossip: the story about the player as it was told (already retold / distorted) */
  topic?: string;
  /** gossip: the teller's memory that was passed on */
  memory?: number;
  /** the player was close enough to hear it */
  overheard?: boolean;
}

export interface SocialState {
  rel: Record<NpcId, Relationship>;
  memories: Memory[];
  memSeq: number;
  beliefs: Record<NpcId, Belief>;
  /** NPC↔NPC affinity, symmetric keys "a|b" (a < b) */
  ties: Record<string, number>;
  /** current and just-finished NPC↔NPC conversations */
  encounters: Encounter[];
  encSeq: number;
  /** last day each pair met (keys like ties) */
  pairDay: Record<string, number>;
}

// ------------------------------------------------------------------ events / phone / journal / stats

export interface ScheduledEvent {
  id: string;
  def: string;
  at: number;
  until: number;
  location: LocationId | null;
  npc: NpcId | null;
  data: Record<string, number | string | boolean>;
  status: 'invited' | 'accepted' | 'declined' | 'attended' | 'missed' | 'expired';
}

export interface EventsState {
  cooldown: Record<string, number>;
  count: Record<string, number>;
  scheduled: ScheduledEvent[];
  seq: number;
  lastDailyCheck: number;
  marketShock: number;
}

export interface PhoneAction {
  id: string;
  label: string;
}

export interface PhoneMessage {
  id: number;
  t: number;
  from: string;
  fromName: string;
  body: string;
  read: boolean;
  actions?: PhoneAction[];
  resolved?: string;
  ref?: string;
}

export interface PhoneState {
  messages: PhoneMessage[];
  seq: number;
}

export type JournalCat = 'life' | 'money' | 'social' | 'casino' | 'work' | 'event' | 'milestone';

export interface JournalEntry {
  id: number;
  t: number;
  cat: JournalCat;
  text: string;
  important?: boolean;
}

export interface JournalState {
  entries: JournalEntry[];
  seq: number;
}

export interface DaySnapshot {
  day: number;
  netWorth: Money;
  liquid: Money;
  cash: Money;
  bank: Money;
  chips: Money;
  debt: Money;
  assets: Money;
  income: Money;
  expenses: Money;
  casinoNet: Money;
  perceived: Money;
  mood: number;
  stress: number;
}

export interface StatsState {
  days: DaySnapshot[];
  peakNetWorth: Money;
  lowestNetWorth: Money;
  milestones: Record<string, number>;
  lifeEvents: { t: number; text: string }[];
}

export interface MarketAsset {
  id: string;
  price: Money;
  history: Money[];
  lastChange: number;
}

export interface MarketState {
  assets: Record<string, MarketAsset>;
  rng: RngState;
  lastUpdateDay: number;
  /** cumulative inflation index in basis points over 10000 */
  priceIndexBp: number;
}

export interface GameMeta {
  version: number;
  seed: number;
  createdReal: number;
  savedReal: number;
  playMs: number;
  saveLabel: string;
}

export interface GameState {
  meta: GameMeta;
  rng: RngState;
  time: { minutes: number };
  player: PlayerState;
  world: WorldState;
  economy: EconomyState;
  inventory: InventoryState;
  housing: HousingState;
  career: CareerState;
  casino: CasinoState;
  npcs: Record<NpcId, NpcRuntime>;
  social: SocialState;
  events: EventsState;
  phone: PhoneState;
  journal: JournalState;
  stats: StatsState;
  market: MarketState;
  stories: StoriesState;
}

/** A storyline in progress: which stage it is at and what has happened so far. */
export interface StoryState {
  arc: string;
  stage: string;
  /** day the current stage began */
  since: number;
  started: number;
  data: Record<string, number | string | boolean>;
}

export interface StoriesState {
  active: StoryState[];
  done: { arc: string; ending: string; day: number }[];
  /** day each storyline last ended (for cooldowns) */
  ended: Record<string, number>;
}
