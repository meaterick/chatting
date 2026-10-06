import {
  AdditiveBlending,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { Font } from "three/addons/loaders/FontLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, easeOutExpo, mulberry32, smoothstep } from "./math.js";
import { createGlowTexture } from "./textures.js";

// 레퍼런스의 "FUTURE INTERFACES." — 글자 하나하나가 별도 메시인 광택 3D 타이틀.
//  - 진입: 글자들이 앞쪽에서 날아와 자리를 잡는다 (intro)
//  - 스크롤: 글자들이 사방으로 흩어지며 사라진다 (scatter)
//  - 포인터: 커서 근처 글자가 앞으로 솟아오른다
export const TITLE_LINES = ["FUTURE", "INTERFACES."];

const LINE_GAP = 1.04; // 줄 간격 (em)
const DEPTH = 0.2;

// 왼쪽(주황·분홍) → 오른쪽(라벤더·파랑) 그라디언트
const STOPS = [
  [0.0, new Color("#ff9a58")],
  [0.3, new Color("#ff8fb2")],
  [0.52, new Color("#e2c2ff")],
  [0.78, new Color("#a9c6ff")],
  [1.0, new Color("#6db3ff")],
];

function gradientAt(t, out) {
  const x = clamp(t);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (x <= t1) return out.copy(c0).lerp(c1, (x - t0) / (t1 - t0));
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}

export function createTitle(fontJson) {
  const font = new Font(fontJson);
  const data = font.data;
  const unit = 1 / data.resolution;
  const capHeight = (data.capHeight || 730) * unit;

  // 1) 레이아웃 (커닝 포함, 줄별 가운데 정렬)
  const lines = TITLE_LINES.map((text) => {
    const glyphs = [];
    let x = 0;
    let prev = "";
    for (const ch of text) {
      const g = data.glyphs[ch];
      if (!g) continue;
      x += (data.kerning?.[prev + ch] || 0) * unit;
      glyphs.push({ ch, x });
      x += g.ha * unit;
      prev = ch;
    }
    return { glyphs, width: x };
  });
  const width = Math.max(...lines.map((l) => l.width));
  const baseY = (i) => -i * LINE_GAP;
  const blockCenterY = (baseY(0) + capHeight + baseY(lines.length - 1)) / 2;

  // 2) 글자 메시
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    color: 0xffffff,
    metalness: 0.25,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.25,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    iridescence: 0.5,
    iridescenceIOR: 1.3,
  });
  // 발광색도 정점 색(그라디언트)을 따라가게 한다
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;"
    );
  };
  material.customProgramCacheKey = () => "title-emissive-vertex-color";

  const group = new Group();
  const rnd = mulberry32(2026);
  const letters = [];
  const tmp = new Color();

  lines.forEach((line, li) => {
    const offsetX = -line.width / 2;
    line.glyphs.forEach(({ ch, x }) => {
      const shapes = font.generateShapes(ch, 1);
      if (!shapes.length) return; // 공백
      const extruded = new ExtrudeGeometry(shapes, {
        depth: DEPTH,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.028,
        bevelOffset: -0.02,
        bevelSegments: 4,
        curveSegments: 8,
      });
      const geo = toCreasedNormals(extruded, Math.PI / 4.5);
      extruded.dispose();
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new Vector3());
      geo.translate(-c.x, -c.y, -c.z);

      const home = new Vector3(offsetX + x + c.x, baseY(li) + c.y - blockCenterY, c.z);

      // 월드(타이틀 로컬) x 에 따라 정점 색을 입힌다
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const wx = home.x + pos.getX(i);
        const vy = pos.getY(i) + c.y; // 글자 안에서의 높이 (대략 0~cap)
        gradientAt((wx + width / 2) / width, tmp);
        const lift = 1 + 0.12 * smoothstep(0.2, 0.75, vy);
        colors[i * 3] = tmp.r * lift;
        colors[i * 3 + 1] = tmp.g * lift;
        colors[i * 3 + 2] = tmp.b * lift;
      }
      geo.setAttribute("color", new Float32BufferAttribute(colors, 3));

      const mesh = new Mesh(geo, material);
      mesh.position.copy(home);
      group.add(mesh);

      letters.push({
        mesh,
        home,
        index: letters.length,
        dir: new Vector3(rnd() - 0.5, rnd() - 0.35, 0.5 + rnd() * 0.9).normalize(),
        axis: new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        spin: 0.6 + rnd() * 1.4,
        phase: rnd() * Math.PI * 2,
      });
    });
  });

  // 글자 뒤의 부드러운 후광: 왼쪽은 주황, 오른쪽은 파랑 (블룸만으로는 약해서 따로 깐다)
  const glowTex = createGlowTexture();
  const glowGeo = new PlaneGeometry(1, 1);
  const height = capHeight + (lines.length - 1) * LINE_GAP;
  const glows = [
    { color: "#ff8a4a", x: -0.27, w: 0.62 },
    { color: "#e9a8ff", x: 0.0, w: 0.5 },
    { color: "#4f9bff", x: 0.27, w: 0.62 },
  ].map((g) => {
    const mat = new MeshBasicMaterial({
      map: glowTex,
      color: new Color(g.color).multiplyScalar(0.26),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new Mesh(glowGeo, mat);
    mesh.scale.set(width * g.w * 1.35, height * 2.0, 1);
    mesh.position.set(width * g.x, 0, -0.35);
    mesh.renderOrder = -1;
    group.add(mesh);
    return mat;
  });

  const total = letters.length;
  const tmpV = new Vector3();

  return {
    group,
    width,
    height,
    /**
     * intro: 0→1 진입 진행도, scatter: 0→1 흩어짐 정도,
     * pointer: 타이틀 로컬 좌표의 포인터 위치(없으면 null)
     */
    update(time, { intro = 1, scatter = 0, pointer = null, calm = false }) {
      for (const L of letters) {
        const k = L.index / total;
        const ti = clamp((intro - k * 0.55) / 0.45);
        const out = 1 - easeOutExpo(ti); // 1 → 0 (자리 잡는 중)
        const sc = scatter;

        tmpV.copy(L.home);
        tmpV.addScaledVector(L.dir, out * 4.5 + sc * sc * 9.0);

        if (!calm) {
          tmpV.y += Math.sin(time * 0.9 + L.phase) * 0.018;
        }
        if (pointer) {
          const dx = L.home.x - pointer.x;
          const dy = L.home.y - pointer.y;
          tmpV.z += 0.28 * Math.exp(-(dx * dx + dy * dy) / 0.8) * (1 - sc);
        }
        L.mesh.position.copy(tmpV);

        const spinAmt = out * 4.2 * L.spin + sc * 2.6 * L.spin;
        L.mesh.rotation.set(L.axis.x * spinAmt, L.axis.y * spinAmt, L.axis.z * spinAmt);
        if (!calm) {
          L.mesh.rotation.x += Math.sin(time * 0.7 + L.phase) * 0.03;
          L.mesh.rotation.y += Math.cos(time * 0.6 + L.phase) * 0.035;
        }

        const s = (1 - smoothstep(0.55, 1.0, sc)) * (0.2 + 0.8 * easeOutExpo(clamp(ti * 1.6)));
        L.mesh.scale.setScalar(Math.max(0.0001, s));
        L.mesh.visible = s > 0.002;
      }
      const glowA = smoothstep(0, 0.55, intro) * (1 - smoothstep(0, 0.45, scatter));
      for (const m of glows) m.opacity = glowA;
      group.visible = glowA > 0.003 || letters.some((L) => L.mesh.visible);
    },
    dispose() {
      for (const L of letters) L.mesh.geometry.dispose();
      material.dispose();
      glowGeo.dispose();
      glowTex.dispose();
      for (const m of glows) m.dispose();
    },
  };
}
