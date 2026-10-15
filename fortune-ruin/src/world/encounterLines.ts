import type { GameCore } from '../core/GameCore';
import type { Encounter } from '../core/state';
import { NPC_BY_ID } from '../data/npcs';
import { hashString } from '../core/rng';

/** One beat of an NPC↔NPC conversation: a speech bubble or an emote. */
export interface EncounterBeat {
  who: 'a' | 'b';
  text?: string;
  emote?: string;
}

const GOOD_NEWS = new Set(['big_win', 'promotion', 'flashy_purchase', 'vip_upgrade', 'generous_treat', 'helped_friend', 'moved']);
const GAMBLING_NEWS = new Set(['big_win', 'big_loss', 'vip_upgrade', 'barred']);

function pick<T>(arr: readonly T[], seed: string): T {
  return arr[hashString(seed) % arr.length];
}

/** How NPCs refer to the player: the pronoun chosen at character creation. */
export function playerPronoun(core: GameCore): string {
  const p = core.state.player.appearance.pronoun;
  return p === 'he' ? '他' : p === 'she' ? '她' : 'TA';
}

/** The listener's reaction to a story about the player depends on who they are. */
function reaction(core: GameCore, e: Encounter, kind: string | undefined, seed: string): string {
  const t = NPC_BY_ID[e.b].traits;
  const ta = playerPronoun(core);
  if (kind && GOOD_NEWS.has(kind)) {
    if (t.envy >= 0.6) return pick(['哼，运气好而已。', '谁知道钱是怎么来的。'], seed);
    if (t.materialism >= 0.6 || t.opportunism >= 0.6) return pick([`那下次可得让${ta}请客！`, `看来得多跟${ta}走动走动。`], seed);
    return pick([`真替${ta}高兴。`, '不错嘛，看不出来。'], seed);
  }
  if (kind && GAMBLING_NEWS.has(kind) && t.gamblingView <= -0.3) return pick(['我早说过，赌场那种地方去不得。', '唉，又是赌桌上的事。'], seed);
  if (t.empathy >= 0.6) return pick([`唉，希望${ta}没事。`, `找个时间问问${ta}吧。`], seed);
  if (t.opportunism >= 0.6) return pick([`那以后可得离${ta}远点。`, `借钱给${ta}的人要倒霉了。`], seed);
  return pick(['真的假的？', '不会吧……', '怪不得。'], seed);
}

/** Scripted beats for an encounter, chosen deterministically from its id. */
export function encounterLines(e: Encounter, core: GameCore): EncounterBeat[] {
  const A = NPC_BY_ID[e.a];
  const B = NPC_BY_ID[e.b];
  const s = (k: string) => `${e.id}|${e.a}|${k}`;
  const tie = core.social.tie(e.a, e.b);
  if (e.about === 'money') {
    // a loan that is late
    return e.kind === 'argue'
      ? [
          { who: 'a', text: pick(['你说好上个月还我的！', '那笔钱到底什么时候还？', '我也要过日子的！'], s('m1')) },
          { who: 'b', text: pick(['我真的没钱……', '再宽限几天好不好？', '你非要在这儿说吗？'], s('m2')) },
          { who: 'a', emote: '💢' },
          { who: 'a', text: pick(['别再找借口了。', '我算是看透你了。', '下次别来找我。'], s('m3')) },
          { who: 'b', text: pick(['……对不起。', '你就这么不信我？', '我会还的！'], s('m4')) },
        ]
      : [
          { who: 'a', text: pick(['对了，上次那笔钱……', '那个……借你的钱，方便的时候还我吧。'], s('m1')) },
          { who: 'b', text: pick(['我记着呢，下个月一定还。', '再给我一点时间。', '哎，我知道，我知道。'], s('m2')) },
          { who: 'a', text: pick(['嗯，不急。', '好吧……别忘了就行。'], s('m3')) },
          { who: 'b', emote: '…' },
        ];
  }
  switch (e.kind) {
    case 'gossip': {
      const kind = core.state.social.memories.find((m) => m.id === e.memory)?.kind;
      const who = core.state.player.name;
      return [
        { who: 'a', text: pick(['跟你说件事……', '你听说了吗？', '别外传啊——'], s('o')) },
        { who: 'b', text: pick(['什么事？', '嗯？', '说来听听。'], s('q')) },
        { who: 'a', text: e.topic ? `听说${who}${e.topic}。` : `${who}最近好像不太顺。` },
        { who: 'b', emote: '!' },
        { who: 'b', text: reaction(core, e, kind, s('r')) },
      ];
    }
    case 'toast':
      return [
        { who: 'a', text: pick(['来，干一杯！', '这杯敬你。', '为这一周干杯！'], s('t1')) },
        { who: 'b', text: pick(['干！', '敬自由！', '下一轮我请。'], s('t2')) },
        { who: 'a', emote: '♪' },
        { who: 'b', emote: '♪' },
        { who: 'a', text: pick(['最近压力太大了，还好有你。', '今晚不醉不归。', '明天还得早起……算了，再来一杯。'], s('t3')) },
      ];
    case 'comfort':
      return [
        { who: 'a', text: pick(['你最近还好吗？脸色不太好。', '听说你最近遇到点麻烦？'], s('c0')) },
        { who: 'b', text: pick(['……手头有点紧，别跟别人说。', '一言难尽。', '撑得住，别担心。'], s('c1')) },
        { who: 'a', text: pick(['有什么需要尽管开口。', '会好起来的，有我呢。', '先别想那么多，喝口热的。'], s('c2')) },
        { who: 'b', emote: '♥' },
        { who: 'b', text: '谢谢你，真的。' },
      ];
    case 'argue':
      return [
        { who: 'a', text: pick(['你那天到底什么意思？', '我受够了你那副样子。', '上次的事你还没给我个说法。'], s('a1')) },
        { who: 'b', text: pick(['我说错了吗？', '你冷静点行不行。', '又来了……'], s('a2')) },
        { who: 'a', emote: '💢' },
        { who: 'a', text: pick(['你每次都这样！', '算了，跟你说不通。'], s('a3')) },
        { who: 'b', text: pick(['随你便。', '懒得跟你吵。'], s('a4')) },
      ];
    default:
      return [
        { who: 'a', text: tie >= 40 ? `嘿，${B.name}！` : pick(['你好啊。', '真巧。', '又见面了。'], s('g')) },
        { who: 'b', text: tie >= 40 ? pick(['最近怎么样？', '好久不见！', '正想找你呢。'], s('r')) : pick(['你好。', '最近忙吗？'], s('r')) },
        { who: 'a', text: pick(A.voice.small, s('small')) },
        { who: 'b', text: pick(['哈哈，真的吗？', '是嘛，有意思。', '确实。', '下次带上我。', '你总是这样。'], s('re')) },
        { who: 'a', text: pick(['回头见。', '那我先忙了。', '改天再聊。'], s('bye')) },
      ];
  }
}
