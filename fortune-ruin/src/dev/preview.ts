import { buildCharacterSheet, randomLook } from '../art/characters';
import { buildTileset } from '../art/tiles';
import { NPCS } from '../data/npcs';
import { drawBuilding } from '../art/buildings';
import { buildPropImages } from '../art/props';
import { BUILDINGS } from '../world/maps/cityLayout';

const out = document.getElementById('out')!;
function show(c: HTMLCanvasElement, scale: number, label: string) {
  const d = document.createElement('div');
  d.textContent = label;
  out.appendChild(d);
  const s = document.createElement('canvas');
  s.width = c.width * scale;
  s.height = c.height * scale;
  const x = s.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.drawImage(c, 0, 0, s.width, s.height);
  out.appendChild(s);
}
const mode = new URLSearchParams(location.search).get('m') ?? 'chars';
if (mode === 'chars') {
  for (const n of NPCS.slice(0, 9)) show(buildCharacterSheet(n.look), 3, n.name);
}
if (mode === 'chars2') {
  for (const n of NPCS.slice(9)) show(buildCharacterSheet(n.look), 3, n.name);
  for (let i = 0; i < 4; i++) show(buildCharacterSheet(randomLook(i * 7 + 3)), 3, 'random ' + i);
}
if (mode === 'tiles') show(buildTileset(), 2, 'tiles');
if (mode === 'bld' || mode === 'bldn') {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.alignItems = 'flex-end';
  out.appendChild(wrap);
  for (const b of BUILDINGS) {
    const art = drawBuilding(b);
    const c = document.createElement('canvas');
    c.width = art.day.width * 2;
    c.height = art.day.height * 2;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.drawImage(art.day, 0, 0, c.width, c.height);
    if (mode === 'bldn') {
      x.fillStyle = 'rgba(10,8,30,0.65)';
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'lighter';
      x.drawImage(art.night, 0, 0, c.width, c.height);
    }
    c.style.margin = '4px';
    wrap.appendChild(c);
  }
}
if (mode === 'props') {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.alignItems = 'flex-end';
  wrap.style.background = '#6a6a5a';
  out.appendChild(wrap);
  buildPropImages((name, c) => {
    if (name.endsWith(':n') || !name.endsWith(':0')) return;
    const s2 = document.createElement('canvas');
    s2.width = c.width * 3;
    s2.height = c.height * 3;
    const x = s2.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.drawImage(c, 0, 0, s2.width, s2.height);
    s2.title = name;
    s2.style.margin = '3px';
    wrap.appendChild(s2);
  });
}
(window as unknown as { __done: boolean }).__done = true;

import { interiorMap } from '../world/maps/interiors';
import { buildCityMap } from '../world/maps/city';
import { PROPS, propFrameName } from '../art/props';
import { BUILDING_BY_ID } from '../world/maps/cityLayout';
import { TILESET_COLUMNS } from '../art/tiles';
import type { MapData } from '../world/maps/types';

function renderMap(m: MapData, scale: number, night: boolean) {
  const ts = buildTileset();
  const props = new Map<string, HTMLCanvasElement>();
  buildPropImages((n, c) => props.set(n, c));
  const c = document.createElement('canvas');
  c.width = m.w * 16;
  c.height = m.h * 16;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  for (let i = 0; i < m.w * m.h; i++) {
    const t = m.ground[i];
    const sx = (t % TILESET_COLUMNS) * 16;
    const sy = Math.floor(t / TILESET_COLUMNS) * 16;
    x.drawImage(ts, sx, sy, 16, 16, (i % m.w) * 16, Math.floor(i / m.w) * 16, 16, 16);
  }
  type D = { y: number; draw: () => void };
  const list: D[] = [];
  for (const p of m.props) {
    const d = PROPS[p.id];
    const img = props.get(propFrameName(p.id, 0))!;
    const px = p.x * 16 + (Math.max(1, d.foot.w) * 16 - d.w) / 2 + (p.ox ?? 0);
    const py = (p.y + 1) * 16 - d.h + (p.oy ?? 0) + (d.dy ?? 0);
    list.push({ y: d.ground ? -1 : d.wall ? 0 : (p.y + 1) * 16 + (d.overhead ? 999 : 0), draw: () => x.drawImage(img, Math.round(px), Math.round(py)) });
  }
  for (const id of m.buildings) {
    const bd = BUILDING_BY_ID[id];
    const art = drawBuilding(bd);
    list.push({ y: (bd.y + bd.h) * 16, draw: () => x.drawImage(art.day, bd.x * 16, bd.y * 16 + art.offsetY) });
  }
  for (const s of m.staff) list.push({ y: (s.y + 1) * 16, draw: () => { x.fillStyle = '#ff00ff'; x.fillRect(s.x * 16 + 5, s.y * 16 + 2, 6, 12); } });
  for (const [, s] of Object.entries(m.spots)) list.push({ y: 99999, draw: () => { x.strokeStyle = '#00ffff'; x.strokeRect(s.x * 16 + 2, s.y * 16 + 2, 12, 12); } });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  if (night) {
    x.fillStyle = 'rgba(10,8,30,0.6)';
    x.fillRect(0, 0, c.width, c.height);
  }
  for (const d of m.doors) { x.strokeStyle = '#ffff00'; x.strokeRect(d.x * 16, d.y * 16, d.w * 16, 16); }
  show(c, scale, m.id);
}
const mid = new URLSearchParams(location.search).get('id');
if (mode === 'map' && mid) renderMap(mid === 'city' ? buildCityMap() : interiorMap(mid), Number(new URLSearchParams(location.search).get('s') ?? 2), false);
