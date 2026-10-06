import {
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp, smoothstep } from "./math.js";
import { pillowGeometry, roundProfile } from "./surfaces.js";

// 투명 유리 바이저(스마트 글래스).
//  - 수평: 타원 호(θ)를 따라 머리를 감싸고, 끝으로 갈수록 가늘어져 스트랩이 된다.
//  - 수직: 렌즈 높이 + 코 받침 홈(notch) + 끝단 둥근 캡
//  - 렌즈(맑은 유리) / 스트랩(반투명 스모크) / 검은 클립 / 가장자리 네온 림 / 상태 LED
const RX = 1.7; // 렌즈 호의 좌우 반지름
const RZ = 1.25; // 렌즈 호의 앞뒤 반지름
const CLIP_AT = 1.05; // 렌즈 호의 끝 = 클립 위치 (rad)
const LENS_END = 0.76; // 렌즈 → 스트랩 높이 전환 시작 각도
const STRAP_LEN = 1.3; // 스트랩 길이 (월드 단위)
const STRAP_SPEED = 1.25; // 스트랩 구간에서 θ 1rad 당 길이
const STRAP_BEND = 0.2; // 스트랩이 안쪽으로 휘는 정도 (곡률)
const STRAP_H = 0.28; // 스트랩 반높이
const CAP = 0.23; // 끝단 캡 각도
const TH = CLIP_AT + STRAP_LEN / STRAP_SPEED; // 전체 호 반각 (rad)

// 수평 경로: 렌즈 구간은 타원 호, 그 너머 스트랩 구간은 접선 방향 직선 + 완만한 안쪽 휨 (C1 연속)
const TIP = pathXZ(TH);
export const GOGGLES_WIDTH = 2 * Math.abs(TIP[0]);

function pathXZ(theta) {
  const a = Math.abs(theta);
  const sgn = theta < 0 ? -1 : 1;
  if (a <= CLIP_AT) return [RX * Math.sin(theta), RZ * (Math.cos(theta) - 1)];
  const x0 = RX * Math.sin(CLIP_AT);
  const z0 = RZ * (Math.cos(CLIP_AT) - 1);
  const tx = RX * Math.cos(CLIP_AT);
  const tz = -RZ * Math.sin(CLIP_AT);
  const tl = Math.hypot(tx, tz);
  const ux = tx / tl;
  const uz = tz / tl;
  const tau = (a - CLIP_AT) * STRAP_SPEED;
  const bend = 0.5 * STRAP_BEND * tau * tau;
  // (uz, -ux): 접선을 머리 안쪽으로 90° 돌린 방향
  return [sgn * (x0 + ux * tau + uz * bend), z0 + uz * tau - ux * bend];
}

function profile(theta) {
  const a = Math.abs(theta);
  const t = smoothstep(LENS_END, LENS_END + 0.3, a); // 0: 렌즈, 1: 스트랩
  const lens = 0.86 - 0.12 * smoothstep(0, 0.95, a);
  let h = lerp(lens, STRAP_H, t);
  const e = clamp((a - (TH - CAP)) / CAP);
  h *= Math.sqrt(Math.max(0, 1 - e * e)); // 끝단을 둥글게 닫는다
  const notch = 0.46 * Math.exp(-Math.pow(a / 0.2, 2.3)) * (1 - t); // 코 받침 홈
  return { h, notch, t };
}

// θ ∈ [from, to] 구간의 베개형 곡면 (u: 0→1 이 from→to)
function visorPiece(from, to, nu) {
  return pillowGeometry({
    nu,
    nv: 40,
    point(u, v, out) {
      const theta = lerp(from, to, u);
      const { h, notch } = profile(theta);
      const y = lerp(-h + notch, h, v);
      const yn = h > 1e-4 ? y / h : 0;
      const bow = 0.22 * (h / 0.86); // 위/아래 가장자리가 뒤로 휘어 입체감을 준다
      const [px, pz] = pathXZ(theta);
      out.set(px, y, pz - bow * yn * yn);
    },
    halfThickness(u, v, P) {
      const theta = lerp(from, to, u);
      const { h, notch, t } = profile(theta);
      const d = Math.min(P.y - (-h + notch), h - P.y);
      const tMax = lerp(0.115, 0.05, t);
      return tMax * roundProfile(d, tMax * 1.5);
    },
  });
}

// 바이저 전체 외곽선(아래 가장자리 → 위 가장자리)을 따라 도는 가는 튜브 = 에지 라이트
function rimGeometry() {
  const at = (u, v) => {
    const theta = lerp(-TH, TH, u);
    const { h, notch } = profile(theta);
    // 유리 바깥쪽으로 살짝 띄운다 (유리 안에 묻히면 굴절로 흐릿해지므로). 끝단 캡에서는 0 으로 수렴.
    const out = 0.03 * Math.min(1, h / 0.15) * (v === 0 ? -1 : 1);
    const y = lerp(-h + notch, h, v) + out;
    const yn = h > 1e-4 ? clamp(y / h, -1, 1) : 0;
    const bow = 0.22 * (h / 0.86);
    const [px, pz] = pathXZ(theta);
    return new Vector3(px, y, pz - bow * yn * yn);
  };
  const N = 420;
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(at(i / N, 0));
  for (let i = N - 1; i >= 1; i--) pts.push(at(i / N, 1));
  const curve = new CatmullRomCurve3(pts, true, "centripetal");
  const geo = new TubeGeometry(curve, 1400, 0.01, 6, true);

  // 왼쪽 주황 → 가운데 따뜻한 흰색 → 오른쪽 파랑 (HDR 로 밝게 → 블룸)
  const stops = [new Color("#ff9a4d"), new Color("#fff0e0"), new Color("#6db4ff")];
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const xr = GOGGLES_WIDTH / 2;
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getX(i) + xr) / (2 * xr));
    if (t < 0.5) c.copy(stops[0]).lerp(stops[1], t * 2);
    else c.copy(stops[1]).lerp(stops[2], (t - 0.5) * 2);
    c.multiplyScalar(1.0);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geo;
}

// 스트랩과 렌즈 사이의 검은 클립 위치/방향
function clipTransform(theta) {
  const e = 1e-3;
  const [x1, z1] = pathXZ(theta + e);
  const [x0, z0] = pathXZ(theta - e);
  const tx = x1 - x0;
  const tz = z1 - z0;
  const len = Math.hypot(tx, tz);
  const [x, z] = pathXZ(theta);
  return { x, z, rotY: Math.atan2(-tz / len, tx / len) };
}

export function createGoggles() {
  const group = new Group();

  // 렌즈: 맑은 유리 + 은은한 헤이즈
  const glass = new MeshPhysicalMaterial({
    color: 0xdfe8ff,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.88,
    thickness: 0.5,
    ior: 1.42,
    attenuationColor: new Color("#c4d8ff"),
    attenuationDistance: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.5,
    iridescence: 0.5,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    sheen: 0.5,
    sheenColor: new Color("#8fb4ff"),
    sheenRoughness: 0.5,
    dispersion: 0.3,
    emissive: new Color("#4a68ff"),
    emissiveIntensity: 0.02,
  });
  const lens = new Mesh(visorPiece(-CLIP_AT, CLIP_AT, 200), glass);
  group.add(lens);

  // 스트랩: 반투명 스모크 (맑은 유리면 거의 안 보이므로 색과 광택을 준다). 왼쪽은 따뜻하게, 오른쪽은 차갑게.
  const strapMaterial = (color, atten, sheen) =>
    new MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness: 0.16,
      transmission: 0.92,
      thickness: 0.25,
      ior: 1.35,
      attenuationColor: new Color(atten),
      attenuationDistance: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 2.4,
      iridescence: 0.5,
      sheen: 0.8,
      sheenColor: new Color(sheen),
      sheenRoughness: 0.45,
    });
  group.add(
    new Mesh(visorPiece(-TH, -CLIP_AT, 70), strapMaterial(0xfff1e6, "#ff8a3d", "#ffb27a")),
    new Mesh(visorPiece(CLIP_AT, TH, 70), strapMaterial(0xeef3ff, "#5f86ff", "#8fb4ff"))
  );

  // 가장자리 네온 림
  const rimMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  group.add(new Mesh(rimGeometry(), rimMat));

  // 검은 크롬 클립 (레퍼런스의 렌즈-스트랩 연결부)
  const clipMat = new MeshPhysicalMaterial({
    color: 0x0c0f1f,
    metalness: 0.9,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.6,
  });
  const clipGeo = new RoundedBoxGeometry(0.24, 0.64, 0.22, 4, 0.07);
  for (const side of [-1, 1]) {
    const c = clipTransform(side * CLIP_AT);
    const clip = new Mesh(clipGeo, clipMat);
    clip.position.set(c.x, 0, c.z);
    clip.rotation.y = c.rotY;
    group.add(clip);
  }

  // 오른쪽 클립의 상태 LED
  const ledMat = new MeshBasicMaterial({ color: new Color(0.35, 1.1, 2.2), toneMapped: false });
  const led = new Mesh(new SphereGeometry(0.03, 16, 12), ledMat);
  const rc = clipTransform(CLIP_AT);
  led.position.set(rc.x, 0.18, rc.z + 0.12);
  led.rotation.y = rc.rotY;
  group.add(led);

  return {
    group,
    width: GOGGLES_WIDTH,
    update(time) {
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 2.4));
      ledMat.color.setRGB(0.35 * pulse * 2, 1.1 * pulse * 2, 2.2 * pulse * 2);
    },
  };
}
