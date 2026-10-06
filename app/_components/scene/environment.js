import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  BackSide,
} from "three";

// 반사용 "스튜디오" 환경맵을 코드로 만든다.
// 크롬/유리 표면에 분홍·주황·파랑이 번지는 레퍼런스의 홀로그래픽 반사를 내려고
// 색이 다른 큰 소프트박스(HDR) 몇 장과 어두운 그라디언트 돔을 PMREM 으로 구워 쓴다.
const PANELS = [
  { color: "#ff8a3d", k: 3.6, pos: [-16, 11, 14], size: [18, 10] }, // 따뜻한 키라이트 (좌상단 앞)
  { color: "#5b86ff", k: 3.2, pos: [18, 5, -8], size: [14, 13] }, // 푸른 림라이트 (우측 뒤)
  { color: "#ff4fd0", k: 2.0, pos: [17, -3, 15], size: [12, 9] }, // 마젠타 필 (우측 앞 아래)
  { color: "#ffffff", k: 2.6, pos: [0, 22, 2], size: [28, 7] }, // 윗면 하이라이트 스트립
  { color: "#3fe0ff", k: 1.8, pos: [-15, -7, -14], size: [12, 9] }, // 시안 포인트 (좌측 뒤 아래)
  { color: "#9d6bff", k: 1.5, pos: [0, 4, -24], size: [32, 13] }, // 보라 뒷벽
  { color: "#ffb27a", k: 1.3, pos: [4, -14, 10], size: [16, 5] }, // 바닥 바운스
];

// 가장자리가 부드럽게 사라지는 패널 마스크 (사각형 반사 대신 은은한 그라디언트 반사가 나오도록)
function softPanelTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x / (S - 1)) * 2 - 1;
      const ny = (y / (S - 1)) * 2 - 1;
      // 둥근 사각형 SDF 근사 → 부드러운 감쇠
      const d = Math.pow(Math.pow(Math.abs(nx), 3.2) + Math.pow(Math.abs(ny), 3.2), 1 / 3.2);
      const t = Math.min(1, Math.max(0, 1 - d));
      const v = Math.round(255 * (t * t * (3 - 2 * t)));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createEnvironment(renderer) {
  const envScene = new Scene();
  const disposables = [];
  const panelMask = softPanelTexture();
  disposables.push(panelMask);

  const dome = new Mesh(
    new SphereGeometry(60, 64, 32),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
  // smoothstep that works for any edge order (the GLSL spec only defines edge0 < edge1)
  float sstep(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
        void main() {
          // azimuth: warm orange/pink on the left (-x), lavender white in front, blue on the right (+x)
          float az = clamp(atan(vDir.x, vDir.z) / 1.25, -1.0, 1.0);
          vec3 warm = vec3(1.00, 0.46, 0.30);
          vec3 mid = vec3(0.86, 0.72, 1.00);
          vec3 cool = vec3(0.28, 0.46, 1.00);
          vec3 hue = az < 0.0 ? mix(mid, warm, -az) : mix(mid, cool, az);

          // elevation: brightest band near the horizon, dark below, a faint highlight above
          float y = vDir.y;
          float bd = (y - 0.05) / 0.38;
          float band = exp(-bd * bd);
          float top = sstep(0.35, 1.0, y);
          vec3 col = hue * (0.05 + 0.62 * band) + vec3(0.62, 0.55, 0.95) * top * 0.30;
          col = mix(col, vec3(0.02, 0.015, 0.06), sstep(-0.1, -0.85, y) * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  envScene.add(dome);
  disposables.push(dome.geometry, dome.material);

  for (const p of PANELS) {
    const mat = new MeshBasicMaterial({
      color: new Color(p.color).multiplyScalar(p.k * 1.7),
      map: panelMask,
      side: DoubleSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(new PlaneGeometry(p.size[0], p.size[1]), mat);
    mesh.position.set(...p.pos);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
    disposables.push(mesh.geometry, mat);
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.06, 0.1, 200);
  pmrem.dispose();

  for (const d of disposables) d.dispose();

  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
