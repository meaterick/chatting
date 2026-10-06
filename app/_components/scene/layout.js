import { MathUtils } from "three";
import { lerp, mix, smoothstep, TAU } from "./math.js";

// 스크롤 → 3D 연출의 "각본".
//  - 섹션 5개(home / about / science / pricing / contact)마다 포즈 하나씩, 그 사이를 보간한다.
//  - 가로 화면(레퍼런스 구도)과 세로 화면(모바일)은 별도 포즈이고, 화면비에 따라 섞는다.
//  - 좌표는 전부 월드 단위. 카메라 거리를 조절해 z=0 평면에서 보이는 가로폭(stage)을 고정한다.
export const SECTION_COUNT = 5;
export const FOV = 32;
const TAN = Math.tan(MathUtils.degToRad(FOV / 2));

const LAND_STAGE_W = 11.2; // 16:9 레퍼런스에서 z=0 평면의 가로폭
const PORT_STAGE_W = 6.6;

export function computeStage(aspect) {
  const portrait = smoothstep(1.25, 0.8, aspect); // 0: 가로, 1: 세로
  const stageW = lerp(LAND_STAGE_W, PORT_STAGE_W, portrait);
  const dist = Math.max(stageW / (2 * TAN * aspect), 11);
  const hH = dist * TAN;
  return { portrait, dist, hH, hW: hH * aspect };
}

const cam = (yaw, zoom, lookY = 0, shiftX = 0, shiftY = 0) => ({ yaw, zoom, lookY, shiftX, shiftY });
const dev = (x, y, z, rx, ry, rz, s) => ({ x, y, z, rx, ry, rz, s });
// clear: 0~1, 글이 있는 화면 중앙에서 큐브가 사라지게 하는 정도
const cluster = (x, y, z, ring, rx, rz, ry, alpha, cubeAlpha, clear = 0) => ({
  x, y, z, ring, rx, rz, ry, alpha, cubeAlpha, clear,
});

// 한 바퀴(TAU)씩 더해 가며 섹션이 바뀔 때마다 기기가 한 바퀴 돌아 자리를 잡는다
const LAND_POSES = [
  // 0 home — 레퍼런스 구도
  {
    cam: cam(0, 1),
    goggles: dev(-1.82, -0.55, 0, 0.08, 0.55, -0.03, 0.86),
    watch: dev(1.95, -0.85, 0, 0.1, -0.62, 0.18, 1.08),
    title: { scatter: 0 },
    cluster: cluster(0, 0, 0, 0, 3.3, 1.4, 0.5, 1, 1),
  },
  // 1 about — 고글 클로즈업 (텍스트는 오른쪽). 큐브들이 고글 뒤쪽에서 돈다
  {
    cam: cam(-0.09, 0.9),
    goggles: dev(-1.7, 0.05, 0.5, 0.12, 0.45 + TAU, -0.05, 0.98),
    watch: dev(12, -1.0, -6.0, 0.1, -0.6 + TAU, 0.18, 0.75),
    title: { scatter: 1 },
    cluster: cluster(-1.7, 0.1, -2.8, 1, 2.8, 1.4, 1.15, 0, 1),
  },
  // 2 science — 워치 클로즈업 (텍스트는 왼쪽)
  {
    cam: cam(0.09, 0.9),
    goggles: dev(-12, 0.3, -5.0, 0.1, 0.5 + TAU * 2, -0.05, 0.8),
    watch: dev(2.3, -0.05, 0.5, 0.08, -0.45 + TAU * 2, 0.1, 1.12),
    title: { scatter: 1 },
    cluster: cluster(2.3, 0.0, -2.8, 1, 2.8, 1.4, 1.2, 0, 1),
  },
  // 3 pricing — 두 기기가 위쪽, 가격 카드가 아래쪽
  {
    cam: cam(0, 1, 0, 0, 0),
    goggles: dev(-3.0, 1.55, 0, 0.1, 0.5 + TAU * 3, -0.04, 0.86),
    watch: dev(3.0, 1.5, 0, 0.1, -0.5 + TAU * 3, 0.15, 0.96),
    title: { scatter: 1 },
    cluster: cluster(0, 1.9, -3.0, 1, 5.6, 1.6, 0.6, 0, 0.9, 1),
  },
  // 4 contact — 두 기기가 글 양옆에서 천천히 돈다
  {
    cam: cam(0, 1.06, 0),
    goggles: dev(-4.7, 0.9, -2.0, 0.1, 0.5 + TAU * 4, -0.04, 0.78),
    watch: dev(4.7, 0.6, -2.0, 0.1, -0.5 + TAU * 4, 0.15, 0.9),
    title: { scatter: 1 },
    cluster: cluster(0, 0.2, -4.5, 1, 5.8, 1.8, 1.3, 0, 0.85, 1),
  },
];

// 세로(모바일): x 는 월드 단위, y 는 화면 반높이(hH) 비율
function portPoses(hH) {
  return [
    {
      cam: cam(0, 1),
      goggles: dev(-0.45, 0.07 * hH, 0, 0.08, 0.55, -0.03, 0.92),
      watch: dev(1.45, -0.3 * hH, 0, 0.1, -0.62, 0.18, 0.88),
      title: { scatter: 0 },
      cluster: cluster(0, 0, 0, 0, 2.6, 1.6, 0.4, 1, 1),
    },
    {
      cam: cam(-0.08, 1),
      goggles: dev(-0.1, 0.6 * hH, 0.5, 0.12, 0.4 + TAU, -0.05, 0.98),
      watch: dev(4.6, 0.5 * hH, -3.0, 0.1, -0.6 + TAU, 0.18, 0.7),
      title: { scatter: 1 },
      cluster: cluster(-0.1, 0.6 * hH, -2.6, 1, 2.9, 1.2, 0.5, 0, 1),
    },
    {
      cam: cam(0.08, 1),
      goggles: dev(-4.6, 0.5 * hH, -3.0, 0.1, 0.5 + TAU * 2, -0.05, 0.8),
      watch: dev(0, 0.6 * hH, 0.5, 0.08, -0.45 + TAU * 2, 0.1, 1.1),
      title: { scatter: 1 },
      cluster: cluster(0, 0.6 * hH, -2.6, 1, 2.8, 1.2, 0.5, 0, 1),
    },
    {
      cam: cam(0, 1),
      goggles: dev(-1.5, 0.56 * hH, 0, 0.1, 0.5 + TAU * 3, -0.04, 0.78),
      watch: dev(1.55, 0.54 * hH, 0, 0.1, -0.5 + TAU * 3, 0.15, 0.86),
      title: { scatter: 1 },
      cluster: cluster(0, 0.55 * hH, -3.0, 1, 3.0, 1.4, 0.4, 0, 0.85),
    },
    {
      cam: cam(0, 1.04),
      goggles: dev(-1.55, 0.52 * hH, -1.0, 0.1, 0.5 + TAU * 4, -0.04, 0.82),
      watch: dev(1.55, 0.5 * hH, -1.0, 0.1, -0.5 + TAU * 4, 0.15, 0.92),
      title: { scatter: 1 },
      cluster: cluster(0, 0.5 * hH, -3.5, 1, 3.0, 1.4, 0.4, 0, 0.8),
    },
  ];
}

// 클러스터(타일+큐브)의 히어로 배치. land 는 월드 좌표, port 의 y 는 hH 비율.
export const TILE_HOMES = [
  { land: [-3.2, 0.62, 1.3], port: [-2.4, 0.3, 1.3] }, // compass
  { land: [-2.52, -1.55, 1.4], port: [-1.95, -0.1, 1.4] }, // search
  { land: [3.3, 0.35, 1.3], port: [2.35, 0.27, 1.3] }, // bulb
  { land: [0.42, -1.5, 1.4], port: [-1.2, -0.47, 1.4] }, // layers
  { land: [3.4, -1.1, 1.3], port: [2.5, -0.06, 1.3] }, // cart
];

export const CUBE_HOMES = [
  { size: 0.5, variant: 1, land: [0.2, 0.0, 0.6], port: [0.75, 0.36, 0.5] },
  { size: 0.42, variant: 0, land: [3.86, -0.44, 0.2], port: [2.7, -0.33, 0.3] },
  { size: 0.8, variant: 1, land: [-3.6, -1.85, 0.9], port: [-2.4, -0.72, 0.9] },
  { size: 0.34, variant: 1, land: [-3.86, -1.0, 0.4], port: [-2.75, 0.12, 0.2] },
  { size: 0.3, variant: 0, land: [-0.34, -1.89, 0.5], port: [0.5, -0.5, 0.6] },
  { size: 0.55, variant: 0, land: [4.9, 1.7, 2.3], port: [2.55, 0.47, 1.6] },
  { size: 0.4, variant: 2, land: [-4.9, 1.6, 1.5], port: [-2.6, 0.47, 1.2] },
  { size: 0.45, variant: 1, land: [1.9, 2.5, -1.5], port: [1.0, 0.8, -1.0] },
];

// 입력 좌표는 "z=0 평면에서 보이길 원하는 화면 위치". 카메라에 가까운(z>0) 오브젝트는
// 원근으로 바깥쪽으로 퍼져 보이므로 (D-z)/D 만큼 안쪽으로 당겨 의도한 위치에 투영되게 한다.
export function homePosition(def, stage, out) {
  const [lx, ly, lz] = def.land;
  const [px, pfy, pz] = def.port;
  const x = lerp(lx, px, stage.portrait);
  const y = lerp(ly, pfy * stage.hH, stage.portrait);
  const z = lerp(lz, pz, stage.portrait);
  const k = (stage.dist - z) / stage.dist;
  return out.set(x * k, y * k, z);
}

export function buildLayout(stage) {
  const port = portPoses(stage.hH);
  return {
    poses: LAND_POSES.map((l, i) => mix(l, port[i], stage.portrait)),
    title: {
      y: lerp(1.3, 0.6 * stage.hH, stage.portrait),
      width: lerp(4.6, 5.3, stage.portrait),
    },
  };
}

// 스크롤 위치(섹션 인덱스 s)에서 포즈 보간. 각 구간 중간 70%에서만 변하고 양끝은 머문다.
export function samplePose(poses, s) {
  const max = poses.length - 1;
  const x = Math.min(max, Math.max(0, s));
  const i = Math.min(max - 1, Math.floor(x));
  const f = smoothstep(0.12, 0.88, x - i);
  return mix(poses[i], poses[i + 1], f);
}
