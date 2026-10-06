import {
  AdditiveBlending,
  AddEquation,
  Color,
  CustomBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
} from "three";
import { createGlowTexture, createLabelTexture, createTileTexture } from "./textures.js";

// 레퍼런스의 떠 있는 아이콘 타일(Explore / Features / Pre-Order).
// 클릭하면 해당 섹션으로 스크롤한다.
export const TILE_DEFS = [
  { icon: "compass", label: "Explore", accent: "#ffb066", target: "about" },
  { icon: "search", label: "Explore", accent: "#5fc8ff", target: "about" },
  { icon: "bulb", label: "Features", accent: "#ffb066", target: "science" },
  { icon: "layers", label: "Features", accent: "#ff9d57", target: "science" },
  { icon: "cart", label: "Pre-Order", accent: "#5fc8ff", target: "pricing" },
];

const TILE_SIZE = 0.5;
const BASE_GAIN = 1.3;
const HOVER_GAIN = 2.4;

// 알파가 미리 곱해진(premultiplied) 텍스처용 블렌딩 — 가장자리에 검은 테두리가 생기지 않는다
function premultipliedMaterial(map) {
  return new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}

export function createTiles(anisotropy = 4) {
  const planeGeo = new PlaneGeometry(1, 1);
  const glowTex = createGlowTexture();
  const hitMat = new MeshBasicMaterial({ visible: false });

  const tiles = TILE_DEFS.map((def) => {
    const object = new Group();

    const tileMat = premultipliedMaterial(createTileTexture(def.icon, def.accent, anisotropy));
    const tile = new Mesh(planeGeo, tileMat);
    tile.scale.setScalar(TILE_SIZE);
    tile.renderOrder = 12;

    const labelMat = premultipliedMaterial(createLabelTexture(def.label, anisotropy));
    const label = new Mesh(planeGeo, labelMat);
    label.scale.set(1.0, 0.25, 1);
    label.position.set(0, -(TILE_SIZE / 2 + 0.17), 0.01);
    label.renderOrder = 13;

    const glowMat = new MeshBasicMaterial({
      map: glowTex,
      color: new Color(def.accent).multiplyScalar(0.55),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const glow = new Mesh(planeGeo, glowMat);
    glow.scale.setScalar(TILE_SIZE * 2.6);
    glow.position.z = -0.02;
    glow.renderOrder = 11;

    // 터치로도 누르기 쉽도록 눈에 보이는 타일보다 넉넉한 투명 히트 영역을 둔다
    const hit = new Mesh(planeGeo, hitMat);
    hit.scale.set(TILE_SIZE * 1.7, TILE_SIZE * 2.2, 1);
    hit.position.set(0, -0.1, 0.02);

    object.add(glow, tile, label, hit);

    const item = {
      def,
      object,
      hit, // 레이캐스트 대상
      hover: 0,
      setAlpha(a) {
        tileMat.opacity = a;
        tileMat.color.setScalar(a * (BASE_GAIN + (HOVER_GAIN - BASE_GAIN) * this.hover));
        labelMat.opacity = a;
        labelMat.color.setScalar(a * (0.85 + 0.15 * this.hover));
        glowMat.opacity = a * (0.55 + 0.45 * this.hover);
        glow.scale.setScalar(TILE_SIZE * (2.6 + 0.9 * this.hover));
        object.visible = a > 0.01;
      },
    };
    hit.userData.item = item;
    return item;
  });

  return { tiles, hitMeshes: tiles.map((t) => t.hit) };
}
