import type { GameCore } from '../core/GameCore';
import type { Patron } from '../core/state';
import { toDate } from '../core/calendar';

function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

/** Varies with the real game minute so the same extra rarely repeats itself. */
function rot(core: GameCore, extra = 0): number {
  return Math.floor(core.now() / 7) + extra;
}

/** Small talk from anonymous passers-by. They only react to what they can see. */
export function pedestrianLine(core: GameCore, seed: number): string {
  const d = toDate(core.now());
  const h = d.hour;
  const lines: string[] = [];
  if (h < 6) lines.push('……这么晚了还不回家？', '夜班刚下，累死了。', '别看我，我只是睡不着。', '这个点的灰港最安静。');
  else if (h < 10) lines.push('早！公交又晚点了。', '得赶紧去上班了。', '海港咖啡排队的人好多。', '早上的风有点凉。');
  else if (h < 17) lines.push('今天天气不错。', '集市街的面包店出了新款可颂。', '听说河畔那边的房价又涨了。', '午休时间太短了。', '银行门口的队排得好长。');
  else if (h < 22) lines.push('下班啦，去喝一杯？', '赌场门口今晚停满了豪车。', '晚饭吃什么好呢……', '锈锚酒吧今晚有乐队演出。');
  else lines.push('赌场那边的霓虹真晃眼。', '末班车快没了。', '今晚风好大。', '又一个不眠夜。');
  if (d.weekday >= 5) lines.push('周末终于来了！', '周末的河滨公园人真多。');
  const s = core.state.player.stats;
  if (core.inventory.appearancePrestige() >= 4) lines.push('（对方打量了一下你的穿着）这身衣服不便宜吧？', '您是住山丘区的吧？');
  if (s.drunk > 50) lines.push('你还好吗？走路都在晃。');
  if (s.sleep < 15) lines.push('你看起来好几天没睡了。');
  return pick(lines, seed + rot(core));
}

/** What a gambler says depends on how their night is actually going. */
export function patronLine(p: Patron, core: GameCore): string {
  const net = p.bankroll - p.startBankroll;
  const ratio = net / Math.max(1, p.startBankroll);
  const seed = p.wins * 3 + p.losses * 7 + rot(core);
  if (ratio > 0.5) return pick(['今晚手气太顺了！', '再赢一把我就走……大概吧。', '哈哈，今晚的酒我请！', '我感觉今晚谁也挡不住我。'], seed);
  if (ratio > 0.1) return pick(['小赢一点，见好就收。', '还不错，还不错。', '今晚运气在我这边。'], seed);
  if (ratio < -0.6) return pick(['别跟我说话。', '……我就不信下一把还输。', '今天的钱都打水漂了。', '我得想想怎么跟家里交代。'], seed);
  if (ratio < -0.2) return pick(['今晚有点背。', '这把荷官手太热了。', '再玩两把就回本了……', '我本来只打算玩一小时的。'], seed);
  if (p.streak >= 3) return '连赢好几把了，感觉要起飞。';
  if (p.streak <= -3) return '连输好几把，要不要换张桌子……';
  if (p.favorite === 'baccarat' && p.superstition > 0.5) return pick(['庄已经连了好几把，我觉得该转闲了。', '看路单，看路单。', '这靴牌的路很怪。'], seed);
  if (p.favorite === 'roulette') return pick(['我一直押 17 号。', '红色！今晚就押红色。', '球还没停呢，别急。'], seed);
  if (p.favorite === 'blackjack') return pick(['12 点对庄家 2，要不要牌真是个问题。', '这桌是 3:2 的，别去那张 6:5 的。', '我从来不买保险。'], seed);
  return pick(['刚来，先看两把。', '你也来玩？', '这桌的荷官发牌很快。'], seed);
}

/** Generic staff by role. */
export function staffLine(role: string, core: GameCore): string {
  const r = rot(core);
  const b = core.state.business;
  if (core.state.world.location === 'own_shop' && b) {
    // your own employees and customers
    const last = b.days[b.days.length - 1];
    if (role === 'patron') return pick(b.price === 'high' ? ['东西不错，就是贵了点。', '这家店挺有格调的。'] : b.price === 'low' ? ['这么便宜，我下次还来。', '划算。'] : ['这家店不错。', '我是看朋友推荐来的。'], r);
    return pick(
      [
        last ? `老板，昨天来了 ${last.customers} 位客人。` : '老板好。',
        b.staff < core.business.staffNeeded() ? '人手有点紧，忙的时候顾不过来。' : '今天一切正常。',
        b.supplies === 'premium' ? '新到的货客人都说好。' : '有客人说东西还可以再好一点。',
      ],
      r,
    );
  }
  const tier = core.casino.tierInfo().name;
  switch (role) {
    case 'dealer':
      return pick(['请问要入座吗？本桌规则公示在桌边。', '祝您好运。', '下注请在发牌前完成。', '本桌最低注额写在桌边的牌子上。'], r);
    case 'cashier':
      return pick(['筹码兑换在窗口办理，现金或银行卡都可以。', '离场前别忘了把筹码换回现金。'], r);
    case 'bartender':
      return pick(['想喝点什么？', '今晚的特调叫「午夜筹码」。', '喝酒别上桌，这是我的忠告。'], r);
    case 'guard':
      return pick(['请保管好您的随身物品。', `${tier}会员您好。`, '场内禁止拍照。'], r);
    case 'doorman':
      return pick(['欢迎光临灰港大赌场。', '祝您今晚愉快。'], r);
    case 'singer':
      return pick(['谢谢捧场～', '下一首献给今晚的幸运儿。'], r);
    case 'clerk':
      return pick(['需要什么随便看看。', '今天新到了一批货。'], r);
    case 'cook':
      return pick(['后厨重地，闲人免进哦。', '今天的汤熬了四个小时。'], r);
    case 'teller':
      return pick(['您好，请到柜台办理业务。', '贷款业务请找格蕾丝经理。'], r);
    case 'coworker':
      return pick(['今天的报表又要加班了。', '主管今天心情不太好，小心点。', '周五一起去喝一杯？', '听说下个月要调薪。'], r);
    case 'reception':
      return pick(['您好，请问有预约吗？', '投资咨询可以通过手机 App 预约。'], r);
    case 'waiter':
      return pick(['请问几位？', '今天的推荐是香煎鲈鱼。'], r);
    case 'maitre':
      return pick(['欢迎光临，这边请。', '今晚的品鉴菜单很受欢迎。'], r);
    case 'butler':
      return pick(['需要为您准备晚餐吗？', '花园的玫瑰开了。'], r);
    case 'roommate':
      return pick(['冰箱里那盒牛奶是我的，别动啊。', '这个月的水电费你转我一半？', '我今晚带朋友回来，可能会有点吵。', '你最近回来得好晚。'], r);
    case 'lift': {
      const up = core.sky.upstairs();
      if (up) return pick(['需要下楼的话，请按电梯。', '祝您在天穹层度过愉快的时光。'], r);
      const err = core.sky.access();
      if (err) return pick(['这部电梯通往天穹层，只对会员开放。', '金卡及以上会员、套房住客可以上楼。周六晚上银卡会员也可以。'], r);
      return pick([`${tier}会员您好，请上楼。`, core.sky.isSkyNight() ? '今晚是天穹之夜，楼上有现场爵士乐。' : '楼上的休息室有自助餐，请随意取用。'], r);
    }
    case 'concierge':
      return pick(['晚上好，需要为您安排什么？', core.sky.suiteGuest() ? '您的套房已经准备好了。' : '今晚的套房还可以预订。', '需要用车的话，请告诉我。'], r);
    case 'spa':
      return pick(['欢迎来到水疗中心，请问要预约吗？', '桑拿房一直开着。', '做完按摩，记得多喝水。'], r);
    case 'pianist':
      return pick(['有想听的曲子吗？', '这首是《港口的灯》。'], r);
    case 'jazz_singer':
      return pick(['谢谢，下一首慢一点。', '欢迎来到天穹之夜。'], r);
    case 'guard_booth':
    default:
      return '你好。';
  }
}
