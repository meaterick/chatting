import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { mulberry32, TAU } from "./math.js";

// 씬에서 쓰는 텍스처는 전부 canvas 2D 로 그린다 (이미지 파일 없이 코드만으로 구성).

const makeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function toTexture(canvas, { anisotropy = 4, premultiply = false, repeat = false } = {}) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.premultiplyAlpha = premultiply;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function hexToRgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// next/font 가 만든 폰트 패밀리 이름은 해시가 붙으므로 CSS 변수에서 읽어온다
export function displayFontFamily() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sora").trim();
  return v ? `${v}, system-ui, sans-serif` : "system-ui, sans-serif";
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ------------------------------------------------------------------ */
/* 유리 큐브 안에서 빛나는 "코드" 텍스처                                */
/* ------------------------------------------------------------------ */
const TOKENS = [
  "const", "let", "fn", "=>", "return", "{", "}", "()", "[]", "0x1f", "i++", "await",
  "<mesh/>", "vec3", "uv", "if", "else", "for", "1.0", "pos", "dt", "map", "glow",
  "bloom", "scene", "cam", "t*2", "sin", "mix", "0.5", "&&", "||", "new", "of",
];

export function createCodeTexture(hex, seed = 1, anisotropy = 4) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  g.fillStyle = "#03050d";
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S * 0.75);
  rg.addColorStop(0, hexToRgba(hex, 0.5));
  rg.addColorStop(1, hexToRgba(hex, 0.02));
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);

  const rnd = mulberry32(seed);
  g.font = "700 19px ui-monospace, Menlo, Consolas, monospace";
  g.textBaseline = "alphabetic";
  let y = 28;
  while (y < S - 6) {
    let x = 14 + Math.floor(rnd() * 3) * 16;
    const parts = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < parts && x < S - 50; i++) {
      const tok = TOKENS[Math.floor(rnd() * TOKENS.length)];
      const bright = rnd() > 0.7;
      g.shadowColor = hex;
      g.shadowBlur = bright ? 10 : 4;
      g.fillStyle = bright ? "#ffffff" : hexToRgba(hex, 0.75 + rnd() * 0.25);
      g.fillText(tok, x, y);
      x += g.measureText(tok).width + 8;
    }
    y += 24;
  }
  return toTexture(c, { anisotropy });
}

/* ------------------------------------------------------------------ */
/* 아이콘 타일 / 라벨                                                   */
/* ------------------------------------------------------------------ */
// 24x24 좌표계 스트로크 아이콘 (Lucide 계열 형태를 단순화)
const ICONS = {
  compass: {
    circles: [[12, 12, 10]],
    paths: ["M16.24 7.76L14.12 14.12L7.76 16.24L9.88 9.88Z"],
  },
  search: {
    circles: [[11, 11, 8]],
    paths: ["M21 21l-4.3-4.3"],
  },
  bulb: {
    paths: [
      "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
      "M9 18h6",
      "M10 22h4",
    ],
  },
  layers: {
    paths: [
      "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
      "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",
      "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
    ],
  },
  cart: {
    circles: [
      [8, 21, 1],
      [19, 21, 1],
    ],
    paths: ["M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"],
  },
};

export function createTileTexture(icon, accent, anisotropy = 4) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  const pad = 14;
  const r = 58;
  const inner = S - pad * 2;

  // 어두운 유리 바탕
  roundRectPath(g, pad, pad, inner, inner, r);
  const base = g.createLinearGradient(0, pad, 0, S - pad);
  base.addColorStop(0, "rgba(46, 52, 96, 0.9)");
  base.addColorStop(1, "rgba(14, 18, 44, 0.94)");
  g.fillStyle = base;
  g.fill();

  // 안쪽 포인트 컬러 글로우 + 상단 광택
  g.save();
  roundRectPath(g, pad, pad, inner, inner, r);
  g.clip();
  const glow = g.createRadialGradient(S / 2, S * 0.56, 6, S / 2, S * 0.56, S * 0.5);
  glow.addColorStop(0, hexToRgba(accent, 0.32));
  glow.addColorStop(1, hexToRgba(accent, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  const gloss = g.createLinearGradient(0, pad, 0, S * 0.5);
  gloss.addColorStop(0, "rgba(255,255,255,0.24)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gloss;
  g.fillRect(0, 0, S, S * 0.5);
  g.restore();

  // 테두리
  roundRectPath(g, pad, pad, inner, inner, r);
  const bd = g.createLinearGradient(pad, pad, S - pad, S - pad);
  bd.addColorStop(0, "rgba(255,255,255,0.6)");
  bd.addColorStop(0.5, hexToRgba(accent, 0.6));
  bd.addColorStop(1, "rgba(255,255,255,0.2)");
  g.lineWidth = 3.5;
  g.strokeStyle = bd;
  g.stroke();

  // 아이콘
  const def = ICONS[icon];
  const k = 5.4;
  g.save();
  g.translate(S / 2 - 12 * k, S / 2 - 12 * k);
  g.scale(k, k);
  g.lineWidth = 1.7;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = accent;
  g.shadowColor = accent;
  g.shadowBlur = 14;
  for (const [cx, cy, cr] of def.circles || []) {
    g.beginPath();
    g.arc(cx, cy, cr, 0, TAU);
    g.stroke();
  }
  for (const d of def.paths || []) g.stroke(new Path2D(d));
  g.restore();

  return toTexture(c, { anisotropy, premultiply: true });
}

export function createLabelTexture(text, anisotropy = 4) {
  const W = 512;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext("2d");
  g.font = `600 56px ${displayFontFamily()}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.65)";
  g.shadowBlur = 10;
  g.fillStyle = "#ffffff";
  g.fillText(text, W / 2, H / 2 + 2);
  return toTexture(c, { anisotropy, premultiply: true });
}

// 타일 뒤에 깔리는 부드러운 네온 글로우 (흰색 → 투명 방사형)
export function createGlowTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.35)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  return toTexture(c, { anisotropy: 1 });
}

/* ------------------------------------------------------------------ */
/* 스마트워치 화면 UI (매 프레임 갱신 가능)                              */
/* ------------------------------------------------------------------ */
export function createWatchUI(anisotropy = 4) {
  const W = 512;
  const H = 640;
  const c = makeCanvas(W, H);
  const g = c.getContext("2d");
  const texture = toTexture(c, { anisotropy });
  const family = displayFontFamily();

  const RINGS = [
    { r: 148, from: "#ffb347", to: "#ff5e62" },
    { r: 116, from: "#ff7ad9", to: "#a64bff" },
    { r: 84, from: "#4facfe", to: "#3df5e0" },
  ];

  function draw({ date = new Date(), rings = [0.7, 0.5, 0.85] } = {}) {
    // 배경
    const bg = g.createRadialGradient(W / 2, H * 0.62, 20, W / 2, H * 0.62, H * 0.75);
    bg.addColorStop(0, "#10163a");
    bg.addColorStop(1, "#02030a");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 시각
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = "#ffffff";
    g.font = `700 112px ${family}`;
    g.fillText(`${hh}:${mm}`, W / 2, 150);
    g.fillStyle = "rgba(190, 205, 255, 0.7)";
    g.font = `500 28px ${family}`;
    g.fillText(date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase(), W / 2, 196);

    // 활동 링
    const cx = W / 2;
    const cy = 408;
    g.lineCap = "round";
    RINGS.forEach((ring, i) => {
      g.lineWidth = 24;
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.beginPath();
      g.arc(cx, cy, ring.r, 0, TAU);
      g.stroke();

      const p = Math.max(0.001, Math.min(1, rings[i]));
      const grad = g.createLinearGradient(cx - ring.r, cy - ring.r, cx + ring.r, cy + ring.r);
      grad.addColorStop(0, ring.from);
      grad.addColorStop(1, ring.to);
      g.strokeStyle = grad;
      g.shadowColor = ring.to;
      g.shadowBlur = 16;
      g.beginPath();
      g.arc(cx, cy, ring.r, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      g.stroke();
      g.shadowBlur = 0;
    });

    // 중앙 심박
    g.fillStyle = "#ffffff";
    g.font = `700 54px ${family}`;
    g.fillText(String(60 + Math.round(rings[0] * 24)), cx, cy + 14);
    g.fillStyle = "rgba(255, 110, 150, 0.95)";
    g.font = `600 20px ${family}`;
    g.fillText("BPM", cx, cy + 46);

    texture.needsUpdate = true;
  }

  draw();
  return {
    texture,
    draw,
    dispose() {
      texture.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 배경의 희미한 회로 패턴 (레퍼런스 우측의 마젠타 라인)                  */
/* ------------------------------------------------------------------ */
export function createCircuitTexture(seed = 11, anisotropy = 4) {
  const S = 1024;
  const GRID = 64;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  const rnd = mulberry32(seed);
  g.lineCap = "round";
  g.lineJoin = "round";

  const DIRS = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const palette = ["#ff4fd8", "#b14bff", "#6c7bff"];

  for (let n = 0; n < 46; n++) {
    let x = Math.floor(rnd() * (S / GRID)) * GRID;
    let y = Math.floor(rnd() * (S / GRID)) * GRID;
    let d = Math.floor(rnd() * 8);
    const col = palette[Math.floor(rnd() * palette.length)];
    g.strokeStyle = hexToRgba(col, 0.55);
    g.shadowColor = col;
    g.shadowBlur = 12;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 3 + Math.floor(rnd() * 5);
    for (let i = 0; i < steps; i++) {
      const len = (1 + Math.floor(rnd() * 3)) * GRID;
      const [dx, dy] = DIRS[d];
      const norm = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
      x += dx * len * norm;
      y += dy * len * norm;
      g.lineTo(x, y);
      d = (d + (rnd() > 0.5 ? 1 : 7)) % 8; // 45도씩 꺾는다
    }
    g.stroke();
    // 끝점 노드
    g.beginPath();
    g.arc(x, y, 7, 0, TAU);
    g.lineWidth = 2;
    g.stroke();
  }
  return toTexture(c, { anisotropy, repeat: true });
}
