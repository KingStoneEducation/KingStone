import type { Expression, FaceSpec } from '../art/portraits';
import type { Appearance } from '../core/state';
import type { CharacterLook } from './npcs';

/**
 * Faces of the named characters. The walking sprite only has room for two
 * eye pixels; the portraits need to know more about each person.
 */
export const FACES: Record<string, FaceSpec> = {
  eileen: { eyes: 'round', eyeColor: '#4f7a4a', brows: 'normal', nose: 'button', jaw: 'soft', age: 26, freckles: true, blush: true, rest: 'smile' },
  victor: { eyes: 'narrow', eyeColor: '#5a4632', brows: 'thick', nose: 'long', jaw: 'square', age: 44, rest: 'smirk' },
  alexander: { eyes: 'almond', eyeColor: '#4a78b0', brows: 'normal', nose: 'straight', jaw: 'square', age: 31, rest: 'smirk' },
  sophia: { eyes: 'almond', eyeColor: '#3a2a20', brows: 'arched', nose: 'straight', jaw: 'narrow', age: 36, lips: '#9e3e48', rest: 'neutral' },
  daniel: { eyes: 'round', eyeColor: '#4a3020', brows: 'thick', nose: 'button', jaw: 'round', age: 29, beard: 'short', rest: 'smile' },
  margaret: { eyes: 'droopy', eyeColor: '#5a5a6a', brows: 'thin', nose: 'small', jaw: 'round', age: 58, lips: '#a8606a', glasses: '#8a5a2a', earrings: 'stud', rest: 'neutral' },
  raymond: { eyes: 'narrow', eyeColor: '#3a3028', brows: 'thick', nose: 'straight', jaw: 'square', age: 47, rest: 'frown' },
  kiki: { eyes: 'round', eyeColor: '#6a4a3a', brows: 'thin', nose: 'small', jaw: 'soft', age: 24, lashes: true, blush: true, lips: '#d0607a', earrings: 'hoop', rest: 'smile' },
  marco: { eyes: 'almond', eyeColor: '#3a2618', brows: 'thick', nose: 'long', jaw: 'square', age: 39, beard: 'goatee', rest: 'smile' },
  lillian: { eyes: 'almond', eyeColor: '#4a7a6a', brows: 'arched', nose: 'small', jaw: 'narrow', age: 42, lashes: true, lips: '#a8303e', mole: 'lip', earrings: 'hoop', eyeshadow: '#7a5a6a', rest: 'smirk' },
  oldzhou: { eyes: 'droopy', eyeColor: '#3a3028', brows: 'thick', nose: 'button', jaw: 'round', age: 67, rest: 'smile' },
  natasha: { eyes: 'narrow', eyeColor: '#5a6a8a', brows: 'arched', nose: 'straight', jaw: 'narrow', age: 33, lips: '#8e3a44', rest: 'neutral' },
  jack: { eyes: 'narrow', eyeColor: '#2a2018', brows: 'thick', nose: 'long', jaw: 'square', age: 35, rest: 'frown' },
  grace: { eyes: 'almond', eyeColor: '#3a2418', brows: 'normal', nose: 'button', jaw: 'round', age: 30, lips: '#8a3a40', earrings: 'stud', rest: 'smile' },
  tommy: { eyes: 'round', eyeColor: '#3a2a1a', brows: 'normal', nose: 'button', jaw: 'round', age: 22, freckles: true, rest: 'neutral' },
  isabella: { eyes: 'almond', eyeColor: '#3a2a22', brows: 'arched', nose: 'small', jaw: 'narrow', age: 28, lashes: true, lips: '#b8323a', earrings: 'hoop', eyeshadow: '#8a5a4a', rest: 'smirk' },
  ben: { eyes: 'round', eyeColor: '#4a3a2a', brows: 'thick', nose: 'button', jaw: 'round', age: 52, beard: 'full', rest: 'smile' },
};

export const EYE_SHAPES: [FaceSpec['eyes'], string][] = [
  ['almond', '杏眼'],
  ['round', '圆眼'],
  ['narrow', '细长眼'],
  ['droopy', '下垂眼'],
];

export const EYE_COLORS = ['#3a2a20', '#5a3a22', '#4a78b0', '#4f7a4a', '#6a6a7a', '#7a5a2a'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Fill in what the sprite already says (glasses, beard, earrings) on top of a face. */
function withLook(face: FaceSpec, look: CharacterLook): FaceSpec {
  return {
    ...face,
    glasses: face.glasses ?? (look.glasses ? '#2a2a34' : undefined),
    beard: face.beard ?? (look.beard ? 'full' : undefined),
    earrings: face.earrings ?? (look.earrings ? 'stud' : undefined),
  };
}

/** Face for anyone: the named cast from the table, everyone else derived from their id. */
export function faceFor(id: string, look: CharacterLook): FaceSpec {
  const known = FACES[id];
  if (known) return withLook(known, look);
  const h = hash(id);
  const fem = look.body === 'f';
  const pick = <T,>(arr: readonly T[], shift: number): T => arr[(h >>> shift) % arr.length];
  return withLook(
    {
      eyes: pick(['almond', 'round', 'narrow', 'almond'] as const, 0),
      eyeColor: pick(EYE_COLORS, 3),
      brows: pick(fem ? (['thin', 'arched', 'normal'] as const) : (['normal', 'thick', 'normal'] as const), 6),
      nose: pick(fem ? (['small', 'button'] as const) : (['straight', 'button', 'long'] as const), 9),
      jaw: pick(fem ? (['soft', 'narrow', 'round'] as const) : (['square', 'round'] as const), 12),
      age: 22 + ((h >>> 15) % 40),
      lashes: fem,
      rest: 'neutral',
    },
    look,
  );
}

export function playerFace(app: Appearance, look: CharacterLook): FaceSpec {
  const fem = look.body === 'f';
  return withLook(
    {
      eyes: EYE_SHAPES[app.eyes ?? 0]?.[0] ?? 'almond',
      eyeColor: EYE_COLORS[app.eyeColor ?? 0] ?? EYE_COLORS[0],
      brows: fem ? 'arched' : 'normal',
      nose: fem ? 'small' : 'straight',
      jaw: fem ? 'soft' : 'round',
      age: 27,
      lashes: fem,
      beard: app.beard ? 'short' : undefined,
      rest: 'neutral' as Expression,
    },
    look,
  );
}
