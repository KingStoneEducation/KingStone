import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatG, type Money } from '../core/money';
import type { CharacterLook } from '../data/npcs';
import { buildCharacterSheet, CHAR_H, CHAR_W } from '../art/characters';
import { store } from './store';

export function Modal(props: {
  title: ReactNode;
  sub?: ReactNode;
  onClose?: () => void;
  wide?: boolean | 'x';
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
}): JSX.Element {
  const close = props.onClose ?? (() => store.closeModal());
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${props.wide === 'x' ? 'xwide' : props.wide ? 'wide' : ''} ${props.className ?? ''}`}>
        <div className="modal-head">
          <div>
            <h2>{props.title}</h2>
            {props.sub && <div className="sub">{props.sub}</div>}
          </div>
          <button className="ghost small close" onClick={close} title="关闭 (Esc)">
            ×
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.foot && <div className="modal-foot">{props.foot}</div>}
      </div>
    </div>
  );
}

export function GV(props: { v: Money; sign?: boolean; className?: string; compact?: boolean }): JSX.Element {
  const cls = props.sign ? (props.v > 0 ? 'good' : props.v < 0 ? 'bad' : '') : '';
  return <span className={`num ${cls} ${props.className ?? ''}`}>{formatG(props.v, { sign: props.sign, compact: props.compact })}</span>;
}

export function Bar(props: { value: number; max?: number; color: string; title?: string }): JSX.Element {
  const pct = Math.max(0, Math.min(100, (props.value / (props.max ?? 100)) * 100));
  return (
    <div className="bar" title={props.title}>
      <span style={{ width: `${pct}%`, background: props.color }} />
    </div>
  );
}

export function Tabs<T extends string>(props: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }): JSX.Element {
  return (
    <div className="tabs">
      {props.tabs.map((t) => (
        <button key={t.id} className={`tab ${t.id === props.value ? 'active' : ''}`} onClick={() => props.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

const sheetCache = new Map<string, HTMLCanvasElement>();

function sheetFor(look: CharacterLook): HTMLCanvasElement {
  const key = JSON.stringify(look);
  let c = sheetCache.get(key);
  if (!c) {
    c = buildCharacterSheet(look);
    sheetCache.set(key, c);
    if (sheetCache.size > 80) sheetCache.delete(sheetCache.keys().next().value as string);
  }
  return c;
}

/** Pixel portrait drawn from the same sprite sheet the world uses. */
export function Portrait(props: { look: CharacterLook; scale?: number; frame?: number; crop?: 'full' | 'bust' }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = props.scale ?? 4;
  const bust = props.crop === 'bust';
  const h = bust ? 20 : CHAR_H;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const sheet = sheetFor(props.look);
    const f = props.frame ?? 0;
    ctx.drawImage(sheet, f * CHAR_W, 0, CHAR_W, h, 0, 0, CHAR_W * scale, h * scale);
  }, [props.look, scale, props.frame, h]);
  return <canvas ref={ref} width={CHAR_W * scale} height={h * scale} />;
}

/** Number input in whole G that returns minor units. */
export function AmountInput(props: { value: number; onChange: (g: number) => void; max?: number; step?: number }): JSX.Element {
  return (
    <input
      type="number"
      min={0}
      step={props.step ?? 1}
      max={props.max}
      value={Number.isFinite(props.value) ? props.value : 0}
      onChange={(e) => props.onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      style={{ width: 120 }}
    />
  );
}

/** Small transient message line for modal actions. */
export function useFeedback(): [ReactNode, (ok: boolean, text: string) => void] {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className={msg.ok ? 'good' : 'error'} style={{ fontSize: 12, marginTop: 6 }}>{msg.text}</div> : null;
  return [node, (ok, text) => setMsg({ ok, text })];
}

export function Keycap(props: { k: string }): JSX.Element {
  return <span className="keycap">{props.k}</span>;
}
