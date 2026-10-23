// The globe's motion (DESIGN §4.2, §4.3), small enough to keep Motion out of the globe's chunk
import { CURVES, SPRINGS, springPhysics } from "@/lib/motion-tokens";

/** CSS cubic-bezier() as a function of progress, solved by bisection */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i += 1) {
      if (at(x1, x2, (low + high) / 2) < x) low = (low + high) / 2;
      else high = (low + high) / 2;
    }
    return at(y1, y2, (low + high) / 2);
  };
}

/** --ease-out */
export const easeOut = cubicBezier(...CURVES.out);

/** The `move` spring (bounce 0, 0.4 s) as Motion resolves it: critically damped, at this natural frequency */
export const MOVE_OMEGA = Math.sqrt(springPhysics(SPRINGS.move).stiffness);

/** The `move` spring on one value. It never overshoots, and keeps its velocity when the target moves */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(value: number) {
    this.value = value;
    this.target = value;
  }

  /** Advances by dt seconds, and reports whether it has settled */
  step(dt: number): boolean {
    const offset = this.value - this.target;
    const decay = Math.exp(-MOVE_OMEGA * dt);
    const slope = this.velocity + MOVE_OMEGA * offset;
    this.value = this.target + (offset + slope * dt) * decay;
    this.velocity = (this.velocity - MOVE_OMEGA * slope * dt) * decay;
    if (Math.abs(this.value - this.target) > 1e-4 || Math.abs(this.velocity) > 1e-3) return false;
    this.value = this.target;
    this.velocity = 0;
    return true;
  }

  halt(): void {
    this.target = this.value;
    this.velocity = 0;
  }
}
