import type { GameCore } from '../core/GameCore';
import { formatG, mulRatio, type Money } from '../core/money';
import { ITEMS, OUTFITS, SHOPS, itemDef, type ItemDef } from '../data/items';
import type { TxnCategory } from '../core/state';
import { G } from '../core/money';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Meals cooked at home are stored as these pseudo items. */
export const MEAL_BASIC = 'meal_basic';
export const MEAL_FRESH = 'meal_fresh';

export function categoryFor(item: ItemDef): TxnCategory {
  switch (item.kind) {
    case 'food':
      return 'food';
    case 'drink':
      return item.effects?.drunk ? 'drinks' : 'food';
    case 'grocery':
      return 'groceries';
    case 'outfit':
      return 'clothing';
    case 'vehicle':
      return 'vehicle';
    case 'furniture':
      return 'furniture';
    case 'book':
      return 'entertainment';
    case 'valuable':
      return 'clothing';
    default:
      return 'groceries';
  }
}

export class InventorySystem {
  constructor(private core: GameCore) {}

  private get inv() {
    return this.core.state.inventory;
  }

  count(id: string): number {
    return this.inv.items[id] ?? 0;
  }

  add(id: string, n = 1): void {
    this.inv.items[id] = (this.inv.items[id] ?? 0) + n;
    this.core.touch();
  }

  remove(id: string, n = 1): boolean {
    const c = this.count(id);
    if (c < n) return false;
    if (c === n) delete this.inv.items[id];
    else this.inv.items[id] = c - n;
    this.core.touch();
    return true;
  }

  ownsOutfit(id: string): boolean {
    return this.inv.outfits.includes(id);
  }

  wear(id: string): ActionResult {
    if (!this.ownsOutfit(id)) return { ok: false, error: '你没有这套衣服' };
    this.core.state.player.outfit = id;
    this.core.bus.emit('appearance', {});
    this.core.touch();
    return { ok: true, message: `换上了${OUTFITS[id].name}` };
  }

  currentOutfit(): ItemDef {
    return OUTFITS[this.core.state.player.outfit] ?? OUTFITS.outfit_casual;
  }

  /** Visible prestige 0..6: outfit, accessories and (when seen) the car. */
  appearancePrestige(includeVehicle = false): number {
    let p = this.currentOutfit().prestige ?? 1;
    let acc = 0;
    for (const [id, n] of Object.entries(this.inv.items)) {
      const d = ITEMS[id];
      if (n > 0 && d?.kind === 'valuable' && d.prestige) acc = Math.max(acc, d.prestige);
    }
    p += acc;
    const s = this.core.state.player.stats;
    if (s.drunk > 55) p -= 0.6;
    if (s.sleep < 15) p -= 0.3;
    if (includeVehicle) {
      const v = this.vehicle();
      if (v?.vehicle) p = Math.max(p, v.vehicle.prestige);
    }
    return Math.max(0, Math.min(6, p));
  }

  vehicle(): ItemDef | null {
    const id = this.core.state.player.vehicle;
    return id ? (ITEMS[id] ?? null) : null;
  }

  vehicleValue(): Money {
    const v = this.vehicle();
    if (!v) return 0;
    // straight-line depreciation is modelled by the resale fraction
    return mulRatio(v.price, Math.round((v.resale ?? 0.5) * 100), 100);
  }

  valuablesValue(): Money {
    let total = 0;
    for (const [id, n] of Object.entries(this.inv.items)) {
      const d = ITEMS[id];
      if (d?.kind === 'valuable') total += mulRatio(d.price, Math.round((d.resale ?? 0.4) * 100), 100) * n;
    }
    return total;
  }

  /** A free item someone promised you at this shop, as the flag that records it. */
  private freebie(shopId: string, itemId: string): string | null {
    const f = this.core.state.player.flags;
    if (shopId === 'cafe' && itemId === 'latte' && Number(f.freeLatte ?? 0) > 0) return 'freeLatte';
    if (shopId === 'restaurant' && itemId === 'pasta' && Number(f.freePasta ?? 0) > 0) return 'freePasta';
    return null;
  }

  /** Price of one item at a shop, after membership perks, discounts and promised freebies. */
  unitPrice(shopId: string, itemId: string, ignoreFreebie = false): Money {
    const item = itemDef(itemId);
    if (!item) return 0;
    if (!ignoreFreebie && this.freebie(shopId, itemId)) return 0;
    // casino membership discounts at the casino bar (comped drinks are handled by the caller)
    if (shopId === 'casino_bar') return this.core.casino.barPrice(item.price);
    // the members' floor: the lounge buffet is complimentary; the sky bar follows the bar discount, champagne is free on Saturday nights
    if (shopId === 'sky_lounge') return 0;
    if (shopId === 'sky_bar') return itemId === 'champagne' && this.core.sky.isSkyNight() ? 0 : this.core.casino.barPrice(item.price);
    const until = Number(this.core.state.player.flags[`discount:${shopId}`] ?? -1);
    if (item.kind === 'outfit' && until >= this.core.today()) return mulRatio(item.price, 85, 100);
    const f = SHOPS[shopId]?.priceFactor;
    if (f) return Math.round(mulRatio(item.price, Math.round(f * 100), 100) / 10) * 10;
    return item.price;
  }

  /** Buy from a shop. Validates stock, payment method and funds. */
  buy(shopId: string, itemId: string, method: 'cash' | 'card', qty = 1): ActionResult {
    const shop = SHOPS[shopId];
    const item = itemDef(itemId);
    if (!shop || !item || !shop.items.includes(itemId)) return { ok: false, error: '这家店没有这件商品' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { ok: false, error: '数量无效' };
    if (method === 'card' && !shop.accepts.includes('card')) return { ok: false, error: '本店只收现金' };
    if (method === 'cash' && !shop.accepts.includes('cash')) return { ok: false, error: '本店只接受刷卡' };
    if (item.kind === 'outfit' && this.ownsOutfit(itemId)) return { ok: false, error: '你已经有这套衣服了' };
    if (item.kind === 'vehicle' && this.core.state.player.vehicle === itemId) return { ok: false, error: '你已经有这辆车了' };
    if (item.kind === 'furniture') {
      const owned = this.core.housing.furniture();
      if (owned.includes(itemId)) return { ok: false, error: '家里已经有这件家具了' };
      if (owned.length >= this.core.housing.current().furnitureSlots) return { ok: false, error: '家里放不下了，换个大点的房子吧' };
    }
    // a promised freebie covers one of them
    const free = this.freebie(shopId, itemId);
    const unit = this.unitPrice(shopId, itemId, true);
    const total = unit * qty - (free ? unit : 0);
    if (free) this.core.state.player.flags[free] = 0;
    if (total > 0) {
      const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', total, categoryFor(item), `${shop.name}：${item.name}${qty > 1 ? ` ×${qty}` : ''}`, shopId);
      if (!r.ok) return { ok: false, error: r.error };
    }
    this.give(item, qty);
    this.core.bus.emit('purchase', { itemId, shopId, amount: total });
    if (total >= G(1000)) this.core.journal.add('money', `在${shop.name}花 ${formatG(total)} 买了${item.name}`, total >= G(20000));
    return { ok: true, message: `购买了 ${item.name}${qty > 1 ? ` ×${qty}` : ''}${total > 0 ? `（${formatG(total)}）` : '（免费招待）'}` };
  }

  /** Put something the player now owns where it belongs (wardrobe, garage, home, bag). */
  give(item: ItemDef, qty: number): void {
    switch (item.kind) {
      case 'outfit':
        if (!this.inv.outfits.includes(item.id)) this.inv.outfits.push(item.id);
        break;
      case 'vehicle': {
        const old = this.vehicle();
        if (old) this.sellVehicleSilently(old);
        this.core.state.player.vehicle = item.id;
        break;
      }
      case 'furniture':
        this.core.housing.addFurniture(item.id);
        break;
      case 'grocery':
        // fresh produce and the island's fish and crabs make the healthier home meals
        this.add(item.id === 'groceries_fresh' || item.id.startsWith('isle_') ? MEAL_FRESH : MEAL_BASIC, (item.meals ?? 1) * qty);
        break;
      default:
        this.add(item.id, qty);
    }
    this.core.touch();
  }

  /** Trade-in of the old car when buying a new one. */
  private sellVehicleSilently(v: ItemDef): void {
    const value = this.vehicleValue();
    this.core.state.player.vehicle = null;
    if (value > 0) this.core.economy.receive('bank', value, 'item_sale', `旧车置换：${v.name}`, 'motors');
  }

  sellVehicle(): ActionResult {
    const v = this.vehicle();
    if (!v) return { ok: false, error: '你没有车' };
    const value = this.vehicleValue();
    this.core.state.player.vehicle = null;
    this.core.economy.receive('bank', value, 'item_sale', `出售车辆：${v.name}`, 'motors');
    this.core.journal.add('money', `卖掉了${v.name}，到手 ${formatG(value)}`);
    return { ok: true, message: `已出售 ${v.name}，${formatG(value)} 已转入银行账户` };
  }

  /** Consume food/drink/medicine/books. Advances time by the item's use time. */
  use(id: string): ActionResult {
    const d = itemDef(id);
    const isMeal = id === MEAL_BASIC || id === MEAL_FRESH;
    if (!isMeal && (!d || this.count(id) <= 0)) return { ok: false, error: '没有这件物品' };
    if (isMeal) {
      if (!this.core.isAtHome()) return { ok: false, error: '需要在家里的厨房做饭' };
      if (!this.remove(id)) return { ok: false, error: '没有食材了' };
      const g = id === MEAL_FRESH ? ITEMS.groceries_fresh : ITEMS.groceries_basic;
      this.core.player.applyEffects(g.effects ?? {});
      this.core.state.player.lastMealAt = this.core.now();
      this.core.advance(g.useMinutes ?? 40, 'eating');
      this.core.bus.emit('used', { itemId: id });
      return { ok: true, message: id === MEAL_FRESH ? '做了一顿健康的家常饭。' : '随便做了点吃的。' };
    }
    const def = d as ItemDef;
    if (def.kind === 'book') {
      if (!this.core.isAtHome()) return { ok: false, error: '回家找个安静的地方再读吧' };
      this.remove(id);
      const sk = def.skill!;
      const gain = this.core.player.addSkill(sk.id, sk.amount, sk.cap);
      this.core.advance(def.useMinutes ?? 120, 'reading');
      this.core.player.change('stress', -4);
      this.core.bus.emit('used', { itemId: id });
      return { ok: true, message: gain > 0.05 ? `读完了${def.name}，有所收获。` : `重读了${def.name}，但已经没有新东西了。` };
    }
    if (!def.effects) return { ok: false, error: '这件物品不能直接使用' };
    this.remove(id);
    this.core.player.applyEffects(def.effects);
    if (def.kind === 'food') this.core.state.player.lastMealAt = this.core.now();
    if (def.useMinutes) this.core.advance(def.useMinutes, 'eating');
    this.core.bus.emit('used', { itemId: id });
    return { ok: true, message: `用掉了${def.name}。` };
  }

  /** Eat or drink something right away at a venue (buy + consume). */
  order(shopId: string, itemId: string, method: 'cash' | 'card', free = false): ActionResult {
    const item = itemDef(itemId);
    if (!item) return { ok: false, error: '没有这个' };
    if (free) {
      this.core.bus.emit('purchase', { itemId, shopId, amount: 0 });
    } else {
      const r = this.buy(shopId, itemId, method);
      if (!r.ok) return r;
      this.remove(itemId);
    }
    this.core.player.applyEffects(item.effects ?? {});
    if (item.kind === 'food') this.core.state.player.lastMealAt = this.core.now();
    if (item.effects?.drunk) this.core.bus.emit('drink', { itemId });
    if (item.useMinutes) this.core.advance(item.useMinutes, 'eating');
    return { ok: true, message: `${free ? '（招待）' : ''}享用了${item.name}。` };
  }

  giftables(): ItemDef[] {
    return Object.entries(this.inv.items)
      .filter(([id, n]) => n > 0 && (ITEMS[id]?.giftTags?.length ?? 0) > 0)
      .map(([id]) => ITEMS[id]);
  }
}
