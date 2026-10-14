import { cardLabel, type Card } from '../casino/cards';
import { formatG, type Money } from '../core/money';

/**
 * Everything a dealer says at the tables, kept in one place and one register:
 * the guest is 您, announcements are calm statements (no exclamation marks),
 * and the wording follows table practice — 买定离手 to close betting, totals
 * announced as points, a dealer over 21 announced as such rather than with
 * players' slang.
 */
export const DEALER = {
  shuffle: (): string => '洗牌中，请稍候。',

  // ------------------------------------------------------------ blackjack
  bjBetting: (needsShuffle: boolean, nearCut: boolean): string =>
    needsShuffle ? '本靴牌已发完，下一局开始前洗牌。各位请下注。' : nearCut ? '各位请下注。本靴即将发到切牌位置。' : '各位请下注。',
  bjInsurance: (): string => '庄家明牌为 A。请问是否购买保险？保险二赔一。',
  bjNoBlackjack: (): string => '庄家不是 Blackjack，牌局继续。',
  bjDealerBlackjack: (): string => '庄家 Blackjack。',
  bjDealerStands: (total: number): string => `庄家 ${total} 点，停牌。`,
  bjDealerOver: (total: number): string => `庄家 ${total} 点，超过 21 点。在座未超过 21 点的各位均获赔付。`,
  bjYourTurn: (): string => '请您决定：要牌、停牌，或其他选择。',

  // ------------------------------------------------------------ baccarat
  bacBetting: (round: number, needsShuffle: boolean): string => (needsShuffle ? '本靴已结束，下一局重新洗牌。各位请下注。' : `第 ${round} 局，各位请下注。`),
  bacNoMoreBets: (): string => '买定离手，开牌。',
  bacBurn: (reveal: Card, count: number): string => `首张 ${cardLabel(reveal)}，按规则烧牌 ${count} 张。`,
  bacNatural: (side: 'player' | 'banker' | 'both', player: number, banker: number): string =>
    side === 'both'
      ? `闲 ${player} 点，庄 ${banker} 点，双方天牌，不再补牌。`
      : side === 'player'
        ? `闲家 ${player} 点天牌，双方不再补牌。`
        : `庄家 ${banker} 点天牌，双方不再补牌。`,
  bacDraw: (to: 'player' | 'banker', total: number): string => (to === 'player' ? `闲家 ${total} 点，补一张。` : `庄家 ${total} 点，依规则补一张。`),
  bacResult: (winner: 'player' | 'banker' | 'tie', player: number, banker: number, playerPair: boolean, bankerPair: boolean): string => {
    const head = `闲 ${player} 点，庄 ${banker} 点，`;
    const verdict = winner === 'tie' ? '和局。' : winner === 'player' ? '闲赢。' : '庄赢。';
    const pairs = [playerPair ? '闲对' : '', bankerPair ? '庄对' : ''].filter(Boolean).join('、');
    return head + verdict + (pairs ? `${pairs}。` : '');
  },

  // ------------------------------------------------------------ roulette
  rlBetting: (minTotal: Money, maxInside: Money): string => `各位请下注。本桌每局合计最低 ${formatG(minTotal)}，内围单注上限 ${formatG(maxInside)}。`,
  rlNoMoreBets: (): string => '买定离手。',
  rlResult: (n: number, color: 'red' | 'black' | 'green'): string =>
    n === 0 ? '0 号，绿色。' : `${n} 号，${color === 'red' ? '红色' : '黑色'}，${n % 2 ? '单' : '双'}，${n <= 18 ? '小' : '大'}。`,

  // ------------------------------------------------------------ poker
  pkAllIn: (name: string): string => `${name}全下。`,
  pkShowdown: (): string => '请各位摊牌。',
  pkWin: (name: string, amount: Money, hand: string | null, isPlayer: boolean): string =>
    isPlayer ? `恭喜，这一池 ${formatG(amount)} 归您${hand ? `（${hand}）` : ''}。` : `这一池 ${formatG(amount)} 归 ${name}${hand ? `（${hand}）` : ''}。`,
  pkWelcome: (): string => '欢迎光临扑克室。您可以选择买入金额入座，也可以先旁观几手。',
  pkNextOpen: (): string => '下一手即将开始。如需入座，请现在买入。',
  pkBusted: (): string => '您面前的筹码已经用完。补码后可以继续，也可以离桌休息。',
  pkSeated: (): string => '请入座。您准备好后，我们开始下一手。',
  pkNext: (): string => '下一手即将开始。',
};
