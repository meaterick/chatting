// 작은 수학/보간 유틸

export const TAU = Math.PI * 2;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeOutBack = (t, s = 1.70158) => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

// 프레임레이트와 무관한 지수 감쇠 추종
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

// 숫자/배열/객체가 섞인 포즈를 재귀적으로 보간
export function mix(a, b, t) {
  if (typeof a === "number") return lerp(a, b, t);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], t));
  const out = {};
  for (const k of Object.keys(a)) out[k] = mix(a[k], b[k], t);
  return out;
}

// 시드 고정 난수 (렌더마다 배치가 달라지지 않게)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
