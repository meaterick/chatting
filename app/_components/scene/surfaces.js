import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * 격자 형태의 "중간 곡면"에 앞/뒤 두께를 줘서 닫힌 솔리드(베개 모양)를 만든다.
 * 가장자리로 갈수록 두께가 0 에 수렴하므로 앞면/뒷면이 둥글게 맞닿아
 * 별도의 옆면 없이도 모서리가 둥근 유리판·밴드를 만들 수 있다.
 *
 * - point(u, v, out): 중간 곡면 위의 점 (u, v ∈ [0, 1]). 법선은 du × dv 방향이 "바깥".
 * - halfThickness(u, v, P): 해당 점에서의 반 두께 (≥ 0)
 * - closedU: u=0 과 u=1 이 같은 줄인 고리(밴드)인지 여부
 */
export function pillowGeometry({ nu, nv, point, halfThickness, closedU = false }) {
  const cols = closedU ? nu : nu + 1;
  const rows = nv + 1;
  const count = cols * rows;

  const mid = new Float32Array(count * 3);
  const p = new Vector3();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      point(i / nu, j / nv, p);
      const k = (j * cols + i) * 3;
      mid[k] = p.x;
      mid[k + 1] = p.y;
      mid[k + 2] = p.z;
    }
  }

  const get = (i, j, out) => {
    const ii = closedU ? (i + cols) % cols : Math.min(cols - 1, Math.max(0, i));
    const jj = Math.min(rows - 1, Math.max(0, j));
    const k = (jj * cols + ii) * 3;
    return out.set(mid[k], mid[k + 1], mid[k + 2]);
  };

  const positions = new Float32Array(count * 6);
  const a = new Vector3();
  const b = new Vector3();
  const du = new Vector3();
  const dv = new Vector3();
  const n = new Vector3();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      get(i + 1, j, a);
      get(i - 1, j, b);
      du.subVectors(a, b);
      get(i, j + 1, a);
      get(i, j - 1, b);
      dv.subVectors(a, b);
      n.crossVectors(du, dv).normalize();

      const idx = j * cols + i;
      const k = idx * 3;
      p.set(mid[k], mid[k + 1], mid[k + 2]);
      const t = halfThickness(i / nu, j / nv, p);

      // 앞면(+n), 뒷면(-n)
      positions[k] = p.x + n.x * t;
      positions[k + 1] = p.y + n.y * t;
      positions[k + 2] = p.z + n.z * t;
      const o = (count + idx) * 3;
      positions[o] = p.x - n.x * t;
      positions[o + 1] = p.y - n.y * t;
      positions[o + 2] = p.z - n.z * t;
    }
  }

  const indices = [];
  const iMax = closedU ? cols : cols - 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < iMax; i++) {
      const i1 = (i + 1) % cols;
      const a0 = j * cols + i;
      const b0 = j * cols + i1;
      const c0 = (j + 1) * cols + i1;
      const d0 = (j + 1) * cols + i;
      indices.push(a0, b0, c0, a0, c0, d0);
      indices.push(count + a0, count + c0, count + b0, count + a0, count + d0, count + c0);
    }
  }

  let geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  // 두께 0 인 가장자리에서 앞/뒤 정점을 하나로 합쳐 법선이 끊기지 않게 한다
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// 모서리 둥글림 프로파일: 가장자리(d=0)에서 0, d >= r 에서 1 (사분원)
export function roundProfile(d, r) {
  const k = Math.min(1, Math.max(0, d / r));
  return Math.sqrt(1 - (1 - k) * (1 - k));
}
