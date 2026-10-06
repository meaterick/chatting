import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createCodeTexture } from "./textures.js";

// 코드가 빛나는 작은 유리 큐브. 색 변형(주황/파랑/분홍) 3종을 재사용한다.
const VARIANTS = [
  { glow: "#ff9a3d", tint: "#ffd9b8", gain: 2.0 }, // 주황
  { glow: "#4aa8ff", tint: "#c4dcff", gain: 1.9 }, // 파랑
  { glow: "#ff7fd0", tint: "#ffd4ee", gain: 1.7 }, // 분홍
];

export function createCubeFactory(anisotropy = 4) {
  const shellGeo = new RoundedBoxGeometry(1, 1, 1, 5, 0.14);
  const innerGeo = new BoxGeometry(0.6, 0.6, 0.6);

  const variants = VARIANTS.map((v, i) => ({
    shellMat: new MeshPhysicalMaterial({
      color: new Color(v.tint),
      metalness: 0,
      roughness: 0.1,
      transmission: 1,
      thickness: 0.9,
      ior: 1.5,
      attenuationColor: new Color(v.tint),
      attenuationDistance: 1.4,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.6,
      iridescence: 0.4,
    }),
    innerMat: new MeshBasicMaterial({
      map: createCodeTexture(v.glow, 3 + i * 7, anisotropy),
      color: new Color().setScalar(v.gain),
      toneMapped: false,
    }),
  }));

  return {
    create(variant, size) {
      const v = variants[variant % variants.length];
      const object = new Group();
      const shell = new Mesh(shellGeo, v.shellMat);
      const inner = new Mesh(innerGeo, v.innerMat);
      object.add(inner, shell);
      object.scale.setScalar(size);
      return object;
    },
  };
}
