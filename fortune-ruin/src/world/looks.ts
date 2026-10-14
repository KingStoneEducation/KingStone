import type { GameCore } from '../core/GameCore';
import type { Appearance } from '../core/state';
import type { CharacterLook } from '../data/npcs';
import { OUTFITS, type OutfitLook } from '../data/items';
import { P } from '../art/palette';
import { shade } from '../art/canvas';
import { randomLook } from '../art/characters';

const FALLBACK: OutfitLook = { top: '#4f7fbf', topShade: '#3a5f94', bottom: '#3b4a66', shoes: '#2a2a2e', style: 'tee' };

/** Sprite look from a character-creation appearance and an outfit id. */
export function lookFor(a: Appearance, outfitId: string): CharacterLook {
  const o = OUTFITS[outfitId]?.look ?? FALLBACK;
  // everyday clothes come in the colour picked at character creation
  const recolor = a.topColor && EVERYDAY.has(outfitId);
  return {
    skin: a.skin,
    hair: a.hairStyle,
    hairColor: P.hair[a.hairColor] ?? P.hair[0],
    top: recolor ? a.topColor! : o.top,
    topShade: recolor ? shade(a.topColor!, -0.25) : o.topShade,
    bottom: o.bottom,
    shoes: o.shoes,
    accent: o.accent,
    style: o.style,
    glasses: a.glasses,
    beard: a.beard,
    earrings: a.earrings,
    hat: a.hat ?? null,
    body: a.body ?? (a.pronoun === 'she' ? 'f' : 'm'),
  };
}

const EVERYDAY = new Set(['outfit_casual', 'outfit_hoodie', 'outfit_smart']);

export function playerLook(core: GameCore): CharacterLook {
  return lookFor(core.state.player.appearance, core.state.player.outfit);
}

const UNIFORMS: Record<string, Partial<CharacterLook>> = {
  dealer: { style: 'vest', top: '#f0ede4', topShade: '#cfc9bb', bottom: '#15151a', shoes: '#0c0c0c', accent: '#7a1424' },
  cashier: { style: 'vest', top: '#efe9dc', topShade: '#cdc5b3', bottom: '#1e1a24', shoes: '#111111', accent: '#c9a24a' },
  bartender: { style: 'vest', top: '#e8e4da', topShade: '#c4bfb2', bottom: '#141418', shoes: '#0d0d0d', accent: '#1a1a1a' },
  guard: { style: 'suit', top: '#1b1d24', topShade: '#111318', bottom: '#15161b', shoes: '#0a0a0a', accent: '#d8d8d8' },
  doorman: { style: 'uniform', top: '#5a1424', topShade: '#3e0d18', bottom: '#1a1418', shoes: '#0b0b0b', accent: '#d9b25a' },
  singer: { style: 'gown', top: '#b0123a', topShade: '#7a0c28', bottom: '#b0123a', shoes: '#111111', accent: '#f2d27a', body: 'f' },
  clerk: { style: 'apron', top: '#3f7a5a', topShade: '#2c5a41', bottom: '#2f3540', shoes: '#2a2a2e', accent: '#e8e2d0' },
  cook: { style: 'apron', top: '#f2f2ee', topShade: '#cfcfca', bottom: '#2a2a30', shoes: '#1a1a1a', accent: '#f2f2ee' },
  teller: { style: 'shirt', top: '#dfe6ef', topShade: '#b9c4d2', bottom: '#2a3142', shoes: '#151515', accent: '#2a4a8a' },
  coworker: { style: 'shirt', top: '#e6e1d3', topShade: '#c4bfae', bottom: '#3a3a42', shoes: '#2a2a2e' },
  reception: { style: 'jacket', top: '#2b3448', topShade: '#1d2433', bottom: '#232b3b', shoes: '#141414', accent: '#e8e2d0' },
  waiter: { style: 'vest', top: '#f4f1ea', topShade: '#d0ccc2', bottom: '#111114', shoes: '#0b0b0b', accent: '#111114' },
  maitre: { style: 'suit', top: '#121218', topShade: '#08080c', bottom: '#0e0e12', shoes: '#050505', accent: '#f4f1ea' },
  butler: { style: 'suit', top: '#16161c', topShade: '#0c0c10', bottom: '#121216', shoes: '#050505', accent: '#e8e2d0' },
  roommate: { style: 'hoodie', top: '#6a7a4a', topShade: '#4f5c36', bottom: '#3a3a42', shoes: '#d8d8d8' },
  // the casino's members' floor
  lift: { style: 'uniform', top: '#1d2742', topShade: '#121a30', bottom: '#151a28', shoes: '#0b0b0b', accent: '#e0b13e' },
  concierge: { style: 'suit', top: '#1d2742', topShade: '#121a30', bottom: '#121828', shoes: '#08080c', accent: '#e0b13e' },
  spa: { style: 'shirt', top: '#e8e2d4', topShade: '#c8c0ae', bottom: '#8a9a88', shoes: '#e8e2d4', accent: '#8a9a88' },
  pianist: { style: 'suit', top: '#141218', topShade: '#0a090e', bottom: '#101016', shoes: '#050505', accent: '#f4f1ea' },
  jazz_singer: { style: 'gown', top: '#2a3a7a', topShade: '#1a2656', bottom: '#2a3a7a', shoes: '#111111', accent: '#d8dce8', body: 'f' },
  auctioneer: { style: 'suit', top: '#141218', topShade: '#0a090e', bottom: '#101016', shoes: '#050505', accent: '#e0b13e', glasses: true },
  // the Old Town
  pawnbroker: { style: 'vest', top: '#e8e2d0', topShade: '#c8c0ae', bottom: '#2a2a30', shoes: '#1a1a1a', accent: '#3a2a1a', glasses: true },
  kitchen_lead: { style: 'apron', top: '#c8604a', topShade: '#a04a38', bottom: '#3a3a46', shoes: '#2a2a2e', accent: '#f2efe6', body: 'f' },
  vendor: { style: 'apron', top: '#4a6a8a', topShade: '#36506a', bottom: '#2a2a30', shoes: '#2a2a2e', accent: '#e8e2d0' },
  foreman: { style: 'jacket', top: '#e86a2a', topShade: '#b85020', bottom: '#2f3a52', shoes: '#3a2a1a', accent: '#f2d24a', hat: 'cap' },
  fortune: { style: 'jacket', top: '#3a2a4a', topShade: '#2a1c36', bottom: '#1a1a22', shoes: '#111111', accent: '#c9a24a', glasses: true },
  // the marina
  dockmaster: { style: 'uniform', top: '#f4f1ea', topShade: '#cfcabe', bottom: '#1c2a4a', shoes: '#2a1a12', accent: '#e0b13e', hat: 'cap' },
  deckhand: { style: 'shirt', top: '#2a4a8a', topShade: '#1c3466', bottom: '#e8e4da', shoes: '#f4f1ea', accent: '#f4f1ea' },
};

/** Generic staff and extras get a uniform matching their role. */
export function staffLook(role: string, seed: number): CharacterLook {
  const base = randomLook(seed, { fancy: 0.3 });
  const u = UNIFORMS[role];
  if (!u) return base;
  const look: CharacterLook = { ...base, ...u } as CharacterLook;
  if (u.top && !u.topShade) look.topShade = shade(u.top, -0.22);
  if (role === 'guard') look.glasses = seed % 3 === 0;
  return look;
}
