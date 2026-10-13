import { EURO_WHEEL } from './RouletteEngine';

/**
 * Wheel and ball kinematics for the roulette animation. The winning pocket
 * is decided by the engine first; this module only computes a trajectory
 * that ends with the ball resting in exactly that pocket.
 */
export const POCKETS = EURO_WHEEL.length;
export const POCKET_ANGLE = (Math.PI * 2) / POCKETS;
const TAU = Math.PI * 2;

export function mod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

/** Angle (wheel frame) of the centre of pocket `index`; pocket 0 (zero) points up. */
export function pocketLocalAngle(index: number): number {
  return -Math.PI / 2 + index * POCKET_ANGLE;
}

/** Which pocket lies under a world angle for a given wheel rotation. */
export function pocketAtAngle(worldAngle: number, wheelRotation: number): number {
  const local = mod(worldAngle - wheelRotation + Math.PI / 2 + POCKET_ANGLE / 2, TAU);
  return Math.floor(local / POCKET_ANGLE) % POCKETS;
}

export interface SpinPlan {
  t0: number;
  duration: number;
  wheelRotation0: number;
  wheelSpeed: number;
  pocketIndex: number;
  /** relative angle of ball vs. target pocket at t0 (decreases to 0) */
  rel0: number;
  wobble: number;
}

/**
 * @param ballAngle0 current absolute angle of the ball
 * @param turns relative revolutions the ball makes before settling
 */
export function planSpin(t0: number, duration: number, wheelRotation0: number, wheelSpeed: number, ballAngle0: number, pocketIndex: number, turns = 7, wobble = 0.35): SpinPlan {
  const target0 = wheelRotation0 + pocketLocalAngle(pocketIndex);
  const rel0 = mod(ballAngle0 - target0, TAU) + TAU * turns;
  return { t0, duration, wheelRotation0, wheelSpeed, pocketIndex, rel0, wobble };
}

export function wheelRotationAt(plan: Pick<SpinPlan, 't0' | 'wheelRotation0' | 'wheelSpeed'>, t: number): number {
  return plan.wheelRotation0 + plan.wheelSpeed * ((t - plan.t0) / 1000);
}

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

/** Ball position (absolute angle and radius fraction 0 = pocket ring, 1 = outer track). */
export function ballAt(plan: SpinPlan, t: number): { angle: number; radius: number; settled: boolean } {
  const u = Math.max(0, Math.min(1, (t - plan.t0) / plan.duration));
  const wheel = wheelRotationAt(plan, t);
  const target = wheel + pocketLocalAngle(plan.pocketIndex);
  let rel = plan.rel0 * (1 - easeOut(u));
  // bouncing between frets near the end; decays to exactly zero at u = 1
  if (u > 0.72) {
    const k = (u - 0.72) / 0.28;
    rel += Math.sin(k * Math.PI * 5) * plan.wobble * POCKET_ANGLE * Math.pow(1 - k, 2);
  }
  let radius = 1;
  if (u > 0.6) {
    const k = Math.min(1, (u - 0.6) / 0.22);
    radius = 1 - easeOut(k);
    if (u > 0.7 && u < 0.92) radius += Math.abs(Math.sin(((u - 0.7) / 0.22) * Math.PI * 3)) * 0.18 * (1 - (u - 0.7) / 0.22);
  }
  return { angle: target + rel, radius: Math.max(0, radius), settled: u >= 1 };
}
