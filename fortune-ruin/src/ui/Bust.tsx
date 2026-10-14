import { useEffect, useRef, useState } from 'react';
import { PORTRAIT_H, PORTRAIT_W, portraitCanvas, type Expression, type FaceSpec } from '../art/portraits';
import type { CharacterLook } from '../data/npcs';
import type { Ambience } from '../data/locations';

/** Backdrop behind a portrait, by the kind of place the conversation happens in. */
export const BACKDROPS: Record<Ambience, string> = {
  city: '#7f93a8',
  casino: '#6a2a3a',
  cafe: '#9a7350',
  bar: '#3f4f52',
  restaurant: '#8a5a44',
  store: '#7f9282',
  office: '#858b94',
  bank: '#6f7f8f',
  home: '#a08a6a',
  club: '#4a2f5a',
  boutique: '#9a7a86',
  quiet: '#7a8a7a',
};

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Half-body portrait. Blinks every few seconds and moves its mouth for a
 * moment whenever `talkKey` changes (new lines in a conversation).
 */
export function Bust(props: { look: CharacterLook; face: FaceSpec; expr?: Expression; scale?: number; crop?: 'full' | 'head'; bg?: string | null; talkKey?: string; still?: boolean }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);
  const [talk, setTalk] = useState(false);
  const still = props.still || reducedMotion();
  useEffect(() => {
    if (still) return;
    let alive = true;
    let t = 0;
    const next = () => {
      t = window.setTimeout(
        () => {
          if (!alive) return;
          setBlink(true);
          t = window.setTimeout(() => {
            if (!alive) return;
            setBlink(false);
            next();
          }, 140);
        },
        2200 + Math.random() * 3400,
      );
    };
    next();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [still]);
  useEffect(() => {
    if (still || !props.talkKey) return;
    let n = 0;
    const iv = window.setInterval(() => {
      n++;
      setTalk(n % 2 === 1 && n < 9);
      if (n >= 9) window.clearInterval(iv);
    }, 110);
    return () => {
      window.clearInterval(iv);
      setTalk(false);
    };
  }, [props.talkKey, still]);
  const scale = props.scale ?? 2;
  const head = props.crop === 'head';
  const [sx, sy, sw, sh] = head ? [10, 6, 44, 44] : [0, 0, PORTRAIT_W, PORTRAIT_H];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const src = portraitCanvas(props.look, props.face, { expr: props.expr, blink, talk, bg: props.bg ?? null });
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  }, [props.look, props.face, props.expr, props.bg, blink, talk, scale, sx, sy, sw, sh]);
  return <canvas ref={ref} className="bust" width={sw * scale} height={sh * scale} />;
}
