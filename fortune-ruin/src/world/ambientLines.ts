import type { GameCore } from '../core/GameCore';
import type { Patron } from '../core/state';
import { formatClock, toDate } from '../core/calendar';
import { FISHING } from '../systems/IsleSystem';

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
  else if (h < 17) lines.push('集市街的面包店出了新款可颂。', '听说河畔那边的房价又涨了。', '午休时间太短了。', '银行门口的队排得好长。');
  else if (h < 22) lines.push('下班啦，去喝一杯？', '赌场门口今晚停满了豪车。', '晚饭吃什么好呢……', '锈锚酒吧今晚有乐队演出。');
  else lines.push('赌场那边的霓虹真晃眼。', '末班车快没了。', '今晚风好大。', '又一个不眠夜。');
  if (d.weekday >= 5) lines.push('周末终于来了！', '周末的河滨公园人真多。');
  // they can see the sky too
  const w = core.weather.now();
  if (w.storm) lines.splice(0, lines.length, '这么大的风你还出门？', '渡轮今天停了，我的货过不去。', '快回家吧，风越来越大了。', '伞都被吹翻了，算了不打了。');
  else if (w.snowing) lines.push('下雪了！灰港一个冬天也就下这么几回。', '路好滑，慢点走。', '这么冷的天，来碗热汤面就好了。', '手都冻僵了，早知道戴手套出门。');
  else if (w.snowCover > 0.3) lines.push('雪还没化完，走路小心点。', '屋顶上一片白，像换了一座城。');
  else if (w.raining) {
    lines.push('这雨下得真烦。', '出门的时候还没下呢……', '鞋都湿透了。', '下雨天，赌场的人反而更多。');
    if (!core.weather.hasUmbrella()) lines.push('你没带伞啊？前面便利店有卖。', '淋成这样，快找个地方躲躲雨吧。');
  } else if (w.fog > 0.3) lines.push('这雾大得连对面的楼都看不见。', '雾笛响了一早上。');
  else if (w.overcast >= 0.5) lines.push('看这云，晚点怕是要下雨。', '天阴沉沉的。');
  else if (h >= 10 && h < 17) lines.push('今天天气不错。', '难得的好天气，去河边走走吧。');
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
  const b = core.business.here();
  if (b) {
    // your own employees and customers
    const last = b.days[b.days.length - 1];
    if (role === 'patron') return pick(b.price === 'high' ? ['东西不错，就是贵了点。', '这家店挺有格调的。'] : b.price === 'low' ? ['这么便宜，我下次还来。', '划算。'] : ['这家店不错。', '我是看朋友推荐来的。'], r);
    return pick(
      [
        last ? `老板，昨天来了 ${last.customers} 位客人。` : '老板好。',
        b.staff < core.business.staffNeeded(b) ? '人手有点紧，忙的时候顾不过来。' : '今天一切正常。',
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
    case 'auctioneer': {
      const ph = core.auction.phase();
      if (ph === 'sale') return pick(['请坐，拍卖正在进行。', '要竞投的话，先领号牌。'], r);
      if (ph === 'preview') return pick(['预展的拍品都在画架上，可以走近看。', '图录在拍卖台上，估价都写着。'], r);
      return pick(['拍卖会在周日下午三点。', '周六上午开始预展。', '有想委托的藏品，可以交给我们估价。'], r);
    }
    case 'pawnbroker': {
      const open = core.pawn.openTickets();
      const due = open.find((t) => core.today() >= t.due - 5);
      if (due) return pick([`当票 ${due.id} 号快到期了，别忘了。`, '东西我替你收着，到期之前来赎就行。'], r);
      if (core.oldtown.isRich()) return pick(['稀客。您是来当东西，还是来淘东西？', '柜台里有几块好表，要不要看看？'], r);
      return pick(['来当东西？拿出来我看看。', '二手柜台每个礼拜一换货。', '我在这条街上干了四十年，什么样的人都见过。', '赌场一到周末，我这儿礼拜一就忙。'], r);
    }
    case 'kitchen_lead':
      return pick(
        core.oldtown.serving()
          ? ['饭在窗口，排队就行。', '要来帮忙的话，跟我说一声，围裙在这儿。', '今天的炖菜是 Marlow 家送来的。']
          : ['还没到开饭时间，十一点和五点开饭。', '下午我们备菜，要帮忙的话开饭前来。'],
        r,
      );
    case 'vendor':
      return pick(
        core.inventory.appearancePrestige() >= 4
          ? ['哟，穿这么好来夜市？尝尝我们的，不比法餐厅差。', '老板，来一份？只收现金哦。']
          : ['来一份？刚出锅的。', '只收现金，不好意思。', '今晚人多，坐那边的桌子吧。', '周末开到两点。'],
        r,
      );
    case 'foreman': {
      const h = toDate(core.now()).hour;
      if (h >= 5 && h < 9) return pick(['要干活的过来，卸完一船当场结钱。', '今天的船晚了半小时，先等着。'], r);
      return pick(['今天的人招满了，明天早点来。', '老周以前是这儿的班长，现在还常来看看。', '五点半开始招人，礼拜天休息。'], r);
    }
    case 'fortune':
      return pick(['看相吗？二十块，不灵不要钱——开玩笑的，灵不灵都要钱。', '坐下，让我看看你的眼睛。'], r);
    case 'dockmaster': {
      const b = core.state.marina?.booking;
      const own = core.marina.ownedDef();
      if (b) return pick([`您约的船 ${formatClock(toDate(b.at).minuteOfDay)} 出发，提前半小时就可以登船。`, '客人到了我会让他们在栈桥上等您。'], r);
      if (own) return pick([`${own.name}昨天刚做过保养，随时可以出海。`, 'C 泊位那条是您的吧？船员都在。', '这个月的泊位费账单一号会寄到。'], r);
      return pick(['游船在 A 泊位，开船前半小时登船。', '想包船的话，到办公室窗口来登记。', 'C 泊位空着呢。那两条船都在卖，有兴趣可以看看。', '南边那条深蓝色的是惠特莫尔家的。'], r);
    }
    case 'deckhand':
      if (core.marina.stormy()) return pick(['风暴天，游船停航了。', '缆绳加了两道，今天哪儿也不去。'], r);
      return pick(['上船请扶好栏杆。', '船票在这边买，现金、刷卡都行。', core.weather.raining() ? '下雨也开船，上层有顶棚。' : '今天风小，坐上层看得最远。'], r);
    // Whitestone Bay
    case 'ferry_crew': {
      const next = core.isle.nextFerry();
      if (core.isle.suspended()) return pick([`风浪太大，今天全天停航。下一班 ${core.isle.departureLabel(next)} 开。`, '这种天开船，船长要被吊销执照的。'], r);
      return pick([`下一班 ${core.isle.departureLabel(next)} 开，开船前二十分钟检票。`, '头等舱在上层，有咖啡。', '末班船八点从白石湾开回来，别错过了。'], r);
    }
    case 'keeper':
      return pick(['这灯塔一百二十年了，我是第四个守塔的。', '晚上的光能照到对岸的灰港。', '起雾的时候，渔船全靠它回家。'], r);
    case 'skipper': {
      const d = toDate(core.now());
      if (core.weather.stormDay()) return pick(['这天气谁出海谁是傻子。', '缆绳都加了一道，等风过去吧。', '风暴天鱼也躲起来了。'], r);
      if (d.weekday === 6) return pick(['礼拜天不出海，船也要歇歇。', '明天四点半来，五点半开船。'], r);
      if (d.minuteOfDay >= FISHING.from && d.minuteOfDay <= FISHING.until) return pick(['要跟船的过来，五点半开船。', core.weather.now().fog > 0.3 ? '雾大，跟紧了，别掉下去。' : '今天风浪不大，上船吧。'], r);
      return core.isle.boatsIn() ? pick(['船都靠岸了，想跟船明早四点半来。', '今天的鱼都卖到鱼市去了。'], r) : pick(['船都出去了，下午两点半才回来。', '明天四点半再来。'], r);
    }
    case 'fishmonger':
      return pick(['刚上岸的，还在蹦！', '带两条回去？清蒸最好吃。', '六点以前来，晚了就只剩小鱼了。'], r);
    case 'shack':
      return pick(['椰子刚冰好。', '来杯莫吉托？看着海喝最好。', '晚上有人在这边弹吉他。'], r);
    case 'lifeguard':
      return core.isle.lifeguardOn()
        ? pick(['别游出浮标。', '喝了酒的不能下水。', '今天的浪不大，可以游。'], r)
        : core.weather.raining()
          ? pick(['下雨了，旗子收了，今天先不下水。', '雨停了再说。'], r)
          : pick(['下班了，现在不能下水。', '明天九点再来游吧。'], r);
    case 'beach_waiter':
      return pick(['需要毛巾吗？', '饮料单夹在伞柄上。', '下午的日落从这里看最好。'], r);
    case 'captain':
      return pick(['我出了四十年的海，现在只管炒菜。', '鱼要吃新鲜的，不新鲜的我不卖。', '下午船一回来，鱼就送到我后厨。'], r);
    case 'innkeeper':
      return core.isle.room()?.kind === 'guesthouse'
        ? pick(['房间收拾好了，热水十点以前有。', '明早十一点前退房就行。'], r)
        : pick(['住一晚吗？一百二。', '错过末班船的人，都来我这儿。', '酒店那边一晚上，够在我这住两个礼拜了。'], r);
    case 'guard_booth':
    default:
      return '你好。';
  }
}
