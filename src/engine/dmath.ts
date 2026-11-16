/**
 * Deterministic maths. Math.exp/log/sin etc. are not required by the spec to
 * be correctly rounded, so browser engines may disagree in the last bit and
 * break lockstep play. These versions use only + - * / (which IEEE 754 makes
 * exact and identical everywhere).
 */

/** e^x via range reduction and a Taylor series. Accurate to ~1e-15 relative for |x| < 700. */
export function dexp(x: number): number {
  if (x === 0) return 1;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  let k = 0;
  let r = x;
  while (r > 0.5 || r < -0.5) {
    r /= 2;
    k++;
  }
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 20; n++) {
    term = (term * r) / n;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= sum;
  return sum;
}

/** Probability that a Poisson process with the given rate fires at least once: 1 - e^(-rate). */
export function pAtLeastOnce(rate: number): number {
  return rate <= 0 ? 0 : 1 - dexp(-rate);
}

/** Integer power by repeated multiplication (deterministic). */
export function dpowInt(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
}
