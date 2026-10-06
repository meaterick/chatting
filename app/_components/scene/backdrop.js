import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
} from "three";
import { mulberry32 } from "./math.js";

// 깊이감 있는 배경 3겹:
//  1) 풀스크린 셰이더 — 네이비 베이스 + 주황/파랑/보라 블롭 + 보케 원반 + 희미한 회로 패턴
//  2) 월드 공간 보케 포인트 — 카메라가 움직이면 시차로 따로 움직인다 (아웃포커스된 배경 느낌)
//  3) 먼지 반짝임 포인트
const PALETTE = [
  // [A(주황 계열), B(파랑 계열), C(보라/분홍 계열)] — 섹션 분위기별
  [new Color("#ff8a3d"), new Color("#3b6bff"), new Color("#9b4dff")], // home
  [new Color("#ff9f4a"), new Color("#27b9ff"), new Color("#5b7bff")], // about (고글: 시안 + 주황)
  [new Color("#ff4fa3"), new Color("#6a5cff"), new Color("#27c4ff")], // science (워치: 마젠타 + 보라)
  [new Color("#ffb04a"), new Color("#3d73ff"), new Color("#ff4fd0")], // pricing
  [new Color("#ff6f8f"), new Color("#6a4dff"), new Color("#ff9a3d")], // contact
];

const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const fullscreenFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uScroll;
  uniform vec2 uPointer;
  uniform vec3 uBase;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  uniform sampler2D uCircuit;

  // smoothstep that works for any edge order (the GLSL spec only defines edge0 < edge1)
  float sstep(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.02 + 17.1;
      a *= 0.5;
    }
    return v;
  }

  // out-of-focus bokeh discs (at most one per grid cell)
  vec3 bokeh(vec2 p, float scale, vec2 drift, float seed, float density) {
    vec2 g = p * scale + drift;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float on = step(1.0 - density, hash21(id + seed + 7.7));
    vec2 off = (vec2(hash21(id + seed + 1.3), hash21(id + seed + 2.9)) - 0.5) * 0.5;
    float r = mix(0.16, 0.36, hash21(id + seed + 5.1));
    float d = length(f - off);
    float disc = sstep(r, r * 0.55, d);
    float rim = sstep(r * 0.74, r, d) * sstep(r * 1.02, r * 0.88, d);
    float t = hash21(id + seed + 3.3);
    vec3 tint = mix(uColA, uColB, sstep(0.2, 0.8, t));
    tint = mix(tint, uColC, step(0.8, hash21(id + seed + 9.1)));
    return tint * (disc * 0.5 + rim * 0.9) * on;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    vec2 par = uPointer * 0.03;

    // slowly drifting domain warp
    vec2 w = vec2(
      fbm(p * 1.4 + vec2(uTime * 0.03, uScroll * 0.25)),
      fbm(p * 1.4 + vec2(5.2, -uTime * 0.025))
    );
    vec2 q = p + (w - 0.5) * 0.45 + par;

    float halfW = uAspect * 0.5;
    float a = sstep(0.85, 0.0, length(q - vec2(-0.86 * halfW, 0.42)));
    float b = sstep(1.0, 0.0, length(q - vec2(0.55 * halfW, -0.38 + sin(uScroll * 1.7) * 0.12)));
    float c = sstep(0.85, 0.0, length(q - vec2(0.92 * halfW, 0.36)));
    float d = sstep(0.65, 0.0, length(q - vec2(-0.92 * halfW, -0.2)));

    vec3 col = uBase;
    col += uColA * a * 0.20 + uColB * b * 0.12 + uColC * c * 0.13 + uColB * d * 0.07;

    // two bokeh layers (they drift with scroll)
    col += bokeh(p + par * 2.0, 3.0, vec2(uTime * 0.012, uScroll * 0.18), 1.0, 0.34) * 0.075;
    col += bokeh(p + par * 3.5, 6.5, vec2(-uTime * 0.016, uScroll * 0.32), 11.0, 0.30) * 0.045;

    // faint circuit pattern on the right and bottom-left
    vec2 cuv = q * 0.62 + vec2(0.5) + vec2(uScroll * 0.05, uScroll * 0.02);
    vec4 cir = texture2D(uCircuit, cuv);
    float mask = sstep(0.15, 0.95, uv.x) * 0.9 + sstep(0.35, 0.0, uv.x) * sstep(0.55, 0.0, uv.y) * 0.5;
    col += uColC * cir.rgb * cir.a * mask * 0.17;

    // vignette
    col *= 1.0 - 0.5 * sstep(0.4, 1.3, length(p * vec2(0.85, 1.1)));

    // dithering against banding
    col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * (1.6 / 255.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pointsVert = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute float aTone;
  uniform float uTime;
  uniform float uPixelScale;
  uniform float uMaxSize;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    pos.x += sin(uTime * 0.07 + aSeed * 6.283) * 0.8;
    pos.y += cos(uTime * 0.05 + aSeed * 12.566) * 0.6;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.1);
    gl_PointSize = min(aSize * uPixelScale / dist, uMaxSize);
    vColor = aTone < 0.34 ? uColA : (aTone < 0.67 ? uColB : uColC);
    vAlpha = uAlpha * (0.65 + 0.35 * sin(uTime * 0.6 + aSeed * 40.0));
  }
`;

const pointsFrag = /* glsl */ `
  uniform float uRing;
  varying vec3 vColor;
  varying float vAlpha;
  // smoothstep that works for any edge order (the GLSL spec only defines edge0 < edge1)
  float sstep(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float disc = sstep(1.0, 0.8, d);
    float rim = sstep(0.68, 0.94, d) * sstep(1.0, 0.94, d);
    float a = mix(disc * disc, disc * 0.35 + rim * 0.55, uRing);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

function makePoints({ count, seed, area, sizeRange, ring, alpha, maxSize, shared }) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seeds = new Float32Array(count);
  const tone = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * area[0];
    pos[i * 3 + 1] = (rnd() - 0.5) * area[1];
    pos[i * 3 + 2] = area[2] + rnd() * area[3];
    size[i] = sizeRange[0] + Math.pow(rnd(), 1.6) * (sizeRange[1] - sizeRange[0]);
    seeds[i] = rnd();
    tone[i] = rnd();
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  geo.setAttribute("aTone", new Float32BufferAttribute(tone, 1));
  const mat = new ShaderMaterial({
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uPixelScale: shared.uPixelScale,
      uColA: shared.uColA,
      uColB: shared.uColB,
      uColC: shared.uColC,
      uMaxSize: { value: maxSize },
      uRing: { value: ring },
      uAlpha: { value: alpha },
    },
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

export function createBackdrop({ circuitTexture, quality = 1 }) {
  const group = new Group();

  const colA = { value: PALETTE[0][0].clone() };
  const colB = { value: PALETTE[0][1].clone() };
  const colC = { value: PALETTE[0][2].clone() };
  const shared = {
    uTime: { value: 0 },
    uPixelScale: { value: 1000 },
    uColA: colA,
    uColB: colB,
    uColC: colC,
  };

  const quadMat = new ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: fullscreenFrag,
    depthWrite: false,
    uniforms: {
      uTime: shared.uTime,
      uAspect: { value: 1.6 },
      uScroll: { value: 0 },
      uPointer: { value: new Vector2() },
      uBase: { value: new Color("#040616") },
      uColA: colA,
      uColB: colB,
      uColC: colC,
      uCircuit: { value: circuitTexture },
    },
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), quadMat);
  quad.frustumCulled = false;
  quad.renderOrder = -100;
  group.add(quad);

  // 큰 아웃포커스 보케 (월드 공간)
  const bokeh = makePoints({
    count: Math.round(70 * quality),
    seed: 7,
    area: [34, 20, -12, 20],
    sizeRange: [0.9, 3.4],
    ring: 1,
    alpha: 0.1,
    maxSize: 360,
    shared,
  });
  // 작은 먼지 반짝임
  const dust = makePoints({
    count: Math.round(320 * quality),
    seed: 21,
    area: [30, 18, -8, 14],
    sizeRange: [0.025, 0.06],
    ring: 0,
    alpha: 0.7,
    maxSize: 6,
    shared,
  });
  group.add(bokeh, dust);

  return {
    group,
    setPixelScale(v) {
      shared.uPixelScale.value = v;
    },
    setAspect(a) {
      quadMat.uniforms.uAspect.value = a;
    },
    update(time, s, pointer, calm) {
      shared.uTime.value = calm ? 0 : time;
      quadMat.uniforms.uScroll.value = s;
      quadMat.uniforms.uPointer.value.copy(pointer);
      // 섹션 사이에서 팔레트를 부드럽게 섞는다
      const i = Math.min(PALETTE.length - 2, Math.max(0, Math.floor(s)));
      const f = Math.min(1, Math.max(0, s - i));
      const k = f * f * (3 - 2 * f);
      const pa = PALETTE[i];
      const pb = PALETTE[i + 1];
      colA.value.copy(pa[0]).lerp(pb[0], k);
      colB.value.copy(pa[1]).lerp(pb[1], k);
      colC.value.copy(pa[2]).lerp(pb[2], k);
    },
    dispose() {
      quad.geometry.dispose();
      quadMat.dispose();
      for (const p of [bokeh, dust]) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
  };
}
