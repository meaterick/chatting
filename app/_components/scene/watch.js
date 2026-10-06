import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp, smoothstep, TAU } from "./math.js";
import { pillowGeometry, roundProfile } from "./surfaces.js";
import { createWatchUI } from "./textures.js";

// 크롬 스마트 밴드.
//  - 밴드: YZ 평면의 둥근 사각 고리(축은 X) — 위쪽이 평평해서 케이스 아래로 자연스럽게 들어간다.
//  - 케이스: 둥근 박스 + 화면(UI 텍스처) + 크라운/버튼 + 아래쪽 클래스프
const A = 1.12; // 고리 반높이 (y)
const B = 0.8; // 고리 반깊이 (z)
const RHO = 0.5; // 모서리 반지름
const SHARP = 4; // 직선 구간 샤프니스
const BAND_W = 1.0; // 밴드 폭 (x)

const CASE_W = 1.2;
const CASE_H = 1.46;
const CASE_D = 0.36;
const CASE_Z = B + 0.13; // 케이스 중심 z

export const WATCH_HEIGHT = 2 * (A + 0.1);

function loopPoint(psi, out) {
  const cy = (A - RHO) * clamp(SHARP * Math.sin(psi), -1, 1);
  const cz = (B - RHO) * clamp(SHARP * Math.cos(psi), -1, 1);
  return out.set(0, cy + RHO * Math.sin(psi), cz + RHO * Math.cos(psi));
}

function bandGeometry() {
  return pillowGeometry({
    nu: 260,
    nv: 24,
    closedU: true,
    point(u, v, out) {
      loopPoint(u * TAU, out);
      out.x = (0.5 - v) * BAND_W;
    },
    halfThickness(u, v) {
      const d = Math.min(v, 1 - v) * BAND_W;
      const psi = u * TAU;
      const fromTop = Math.min(psi, TAU - psi);
      const tMax = lerp(0.1, 0.062, smoothstep(0.4, 1.6, fromTop)); // 케이스 쪽이 두껍다
      return tMax * roundProfile(d, 0.07);
    },
  });
}

function roundedRectShape(w, h, r) {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function screenGeometry(w, h, r) {
  const geo = new ShapeGeometry(roundedRectShape(w, h, r), 16);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  return geo;
}

export function createWatch({ anisotropy = 4 } = {}) {
  const group = new Group();

  const chrome = new MeshPhysicalMaterial({
    color: 0xe4eaff,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 0.5,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.8,
    iridescence: 0.35,
    iridescenceIOR: 1.4,
  });
  const darkChrome = new MeshPhysicalMaterial({
    color: 0x151a30,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1.4,
  });

  // 밴드
  const band = new Mesh(bandGeometry(), chrome);
  group.add(band);

  // 케이스
  const caseMesh = new Mesh(new RoundedBoxGeometry(CASE_W, CASE_H, CASE_D, 10, 0.32), chrome);
  caseMesh.position.z = CASE_Z;
  group.add(caseMesh);

  // 화면 (검은 유리 + UI 발광)
  const ui = createWatchUI(anisotropy);
  const screenMat = new MeshStandardMaterial({
    color: 0x02030a,
    roughness: 0.06,
    metalness: 0.55,
    emissive: 0xffffff,
    emissiveMap: ui.texture,
    emissiveIntensity: 1.15,
    envMapIntensity: 1.2,
  });
  const screen = new Mesh(screenGeometry(CASE_W - 0.2, CASE_H - 0.2, 0.24), screenMat);
  screen.position.z = CASE_Z + CASE_D / 2 + 0.003;
  group.add(screen);

  // 크라운 + 사이드 버튼
  const crown = new Mesh(new CylinderGeometry(0.085, 0.085, 0.14, 40), chrome);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(CASE_W / 2 + 0.05, 0.3, CASE_Z);
  group.add(crown);
  const crownRing = new Mesh(new TorusGeometry(0.088, 0.014, 12, 40), darkChrome);
  crownRing.rotation.y = Math.PI / 2;
  crownRing.position.set(CASE_W / 2 + 0.07, 0.3, CASE_Z);
  group.add(crownRing);
  const button = new Mesh(new RoundedBoxGeometry(0.07, 0.36, 0.1, 4, 0.03), chrome);
  button.position.set(CASE_W / 2 + 0.01, -0.2, CASE_Z);
  group.add(button);

  // 클래스프 (밴드 아래쪽, 분절된 판)
  const clasp = new Group();
  const plateGeo = new RoundedBoxGeometry(BAND_W + 0.06, 0.34, 0.2, 5, 0.07);
  const plate1 = new Mesh(plateGeo, chrome);
  plate1.position.set(0, 0.2, 0);
  const plate2 = new Mesh(plateGeo, chrome);
  plate2.position.set(0, -0.2, 0.012);
  plate2.scale.set(0.96, 1, 1);
  const groove = new Mesh(new RoundedBoxGeometry(BAND_W + 0.08, 0.035, 0.205, 2, 0.012), darkChrome);
  groove.position.set(0, 0, 0.004);
  const pin = new Mesh(new CylinderGeometry(0.035, 0.035, 0.05, 20), darkChrome);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0, -0.2, -0.12);
  clasp.add(plate1, plate2, groove, pin);
  clasp.position.set(0, 0, -B - 0.02);
  group.add(clasp);

  const rings = [0.72, 0.52, 0.86];
  let lastDraw = -1;

  return {
    group,
    height: WATCH_HEIGHT,
    // progress: 0~1, 스크롤에 맞춰 활동 링이 차오른다
    update(time, progress = 0) {
      const t = Math.floor(time * 4); // 초당 4회까지만 갱신
      if (t !== lastDraw) {
        lastDraw = t;
        rings[0] = 0.35 + 0.6 * progress;
        rings[1] = 0.3 + 0.55 * Math.abs(Math.sin(time * 0.35 + progress * 2));
        rings[2] = 0.5 + 0.45 * Math.abs(Math.sin(time * 0.2 + 1.3));
        ui.draw({ date: new Date(), rings });
      }
    },
    redraw() {
      lastDraw = -1;
    },
    dispose() {
      ui.dispose();
    },
  };
}
