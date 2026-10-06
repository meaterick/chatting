import {
  ACESFilmicToneMapping,
  Group,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { createBackdrop } from "./backdrop.js";
import { createCubeFactory } from "./cubes.js";
import { createEnvironment } from "./environment.js";
import { createGoggles } from "./goggles.js";
import {
  buildLayout,
  computeStage,
  CUBE_HOMES,
  FOV,
  homePosition,
  samplePose,
  TILE_HOMES,
} from "./layout.js";
import { clamp, damp, easeOutBack, lerp, smoothstep, TAU } from "./math.js";
import { createPostFX } from "./postfx.js";
import { createTiles } from "./tiles.js";
import { createTitle } from "./title.js";
import { createCircuitTexture, displayFontFamily } from "./textures.js";
import { createWatch } from "./watch.js";

const SPIN_GAIN = 2.4; // 스크롤 속도(섹션/초) → 각속도(rad/s)

function disposeTree(root) {
  const textureKeys = ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "alphaMap", "aoMap"];
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of textureKeys) m[k]?.dispose?.();
      m.dispose?.();
    }
  });
}

/**
 * 3D 메인 씬을 만든다.
 * @param {object} opts
 * @param {HTMLElement} opts.container   canvas 를 붙일 고정 컨테이너
 * @param {string[]} opts.sectionIds     스크롤 섹션 id (위에서 아래 순서)
 * @param {(index:number)=>void} [opts.onActive]    현재 섹션이 바뀔 때
 * @param {(id:string)=>void} [opts.onNavigate]     3D 타일을 눌렀을 때
 * @param {boolean} [opts.reducedMotion]
 */
export async function createExperience({
  container,
  sectionIds,
  onActive,
  onNavigate,
  reducedMotion = false,
}) {
  const params = new URLSearchParams(window.location.search);
  const forcedDpr = Number.parseFloat(params.get("dpr"));
  const hasForcedDpr = Number.isFinite(forcedDpr);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const compact = Math.min(window.innerWidth, window.innerHeight) < 560;
  const lowPower = coarse || compact;
  const maxDpr = lowPower ? 1.5 : 2;
  let dpr = hasForcedDpr ? forcedDpr : Math.min(window.devicePixelRatio || 1, maxDpr);
  const calm = reducedMotion;
  // 개발 모드 전용: ?speed=N 으로 시간을 N배 빠르게 (느린 소프트웨어 렌더링에서 스크린샷 검증용)
  const devSpeed = process.env.NODE_ENV !== "production" ? Number.parseFloat(params.get("speed")) || 1 : 1;

  // ---- 에셋 준비 (폰트 → 타이틀 / 캔버스 텍스트) ----
  const family = displayFontFamily();
  const fontReady = Promise.race([
    document.fonts?.load(`600 56px ${family}`).catch(() => null),
    new Promise((r) => setTimeout(r, 1800)),
  ]);
  const [fontJson] = await Promise.all([
    fetch("/fonts/sora-extrabold.typeface.json", { signal: AbortSignal.timeout?.(12000) }).then((r) => {
      if (!r.ok) throw new Error(`title font ${r.status}`);
      return r.json();
    }),
    fontReady,
  ]);

  const canvas = document.createElement("canvas");
  canvas.className = "stage-canvas";
  container.appendChild(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    canvas.remove();
    throw err;
  }
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // 유리 굴절용 배경 패스는 어차피 흐리게 보이므로 해상도를 낮춰 비용을 아낀다
  renderer.transmissionResolutionScale = lowPower ? 0.5 : 0.75;

  let width = container.clientWidth || window.innerWidth;
  let height = container.clientHeight || window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, width / height, 0.5, 140);

  const env = createEnvironment(renderer);
  scene.environment = env.texture;

  // ---- 오브젝트 ----
  const circuit = createCircuitTexture(11, anisotropy);
  const backdrop = createBackdrop({ circuitTexture: circuit, quality: lowPower ? 0.6 : 1 });
  scene.add(backdrop.group);

  const title = createTitle(fontJson);
  scene.add(title.group);

  const goggles = createGoggles();
  const gogglesRig = new Group(); // 위치/회전/스케일 담당 (피벗을 모델 중심으로 맞추려고 한 겹 더 감싼다)
  gogglesRig.rotation.order = "YXZ";
  goggles.group.position.z = 0.8;
  gogglesRig.add(goggles.group);
  scene.add(gogglesRig);

  const watch = createWatch({ anisotropy });
  const watchRig = new Group();
  watchRig.rotation.order = "YXZ";
  watchRig.add(watch.group);
  scene.add(watchRig);

  const cubeFactory = createCubeFactory(anisotropy);
  const { tiles, hitMeshes } = createTiles(anisotropy);

  // 클러스터: 타일 5 + 큐브 8 을 섞어서 하나의 리스트로 다룬다 (링 배치 순서 = 번갈아)
  const cluster = new Group();
  scene.add(cluster);
  const items = [];
  const cubeItems = CUBE_HOMES.map((def, i) => {
    const object = cubeFactory.create(def.variant, def.size);
    cluster.add(object);
    return {
      kind: "cube",
      def,
      object,
      home: new Vector3(),
      off: new Vector3(),
      phase: i * 1.7 + 0.4,
      freq: 0.5 + (i % 4) * 0.12,
      spin: new Vector3(0.18 + i * 0.03, 0.27 - i * 0.015, 0.1 + (i % 3) * 0.05),
    };
  });
  const tileItems = tiles.map((tile, i) => {
    cluster.add(tile.object);
    return {
      kind: "tile",
      tile,
      object: tile.object,
      home: new Vector3(),
      off: new Vector3(),
      phase: i * 2.3 + 1.1,
      freq: 0.6 + (i % 3) * 0.1,
    };
  });
  for (let i = 0; i < Math.max(cubeItems.length, tileItems.length); i++) {
    if (tileItems[i]) items.push(tileItems[i]);
    if (cubeItems[i]) items.push(cubeItems[i]);
  }
  // 링 위의 위치: 큐브는 큐브끼리, 타일은 타일끼리 균등하게 (타일은 홈에서만 보인다)
  cubeItems.forEach((it, j) => {
    it.ringAngle = (j / cubeItems.length) * TAU + (j % 2) * 0.25;
    it.ringR = 0.86 + 0.26 * ((j * 0.618) % 1);
  });
  tileItems.forEach((it, j) => {
    it.ringAngle = ((j + 0.5) / tileItems.length) * TAU;
    it.ringR = 1;
  });

  const pointerLight = new PointLight(0xb8d4ff, 0, 40, 2);
  scene.add(pointerLight);

  // ---- 후처리 ----
  const fx = createPostFX({
    renderer,
    scene,
    camera,
    width,
    height,
    pixelRatio: dpr,
    fxaa: dpr < 2,
  });

  // ---- 레이아웃 ----
  let stage = computeStage(width / height);
  let layout = buildLayout(stage);
  const titleScale = () => layout.title.width / title.width;

  function applyLayout() {
    stage = computeStage(width / height);
    layout = buildLayout(stage);
    for (const it of cubeItems) homePosition(it.def, stage, it.home);
    tileItems.forEach((it, i) => homePosition(TILE_HOMES[i], stage, it.home));
    const fovRad = (camera.fov * Math.PI) / 180;
    backdrop.setPixelScale(renderer.getDrawingBufferSize(new Vector2()).y / (2 * Math.tan(fovRad / 2)));
    backdrop.setAspect(width / height);
  }
  applyLayout();

  // ---- 스크롤 ↔ 섹션 매핑 ----
  const sectionEls = sectionIds.map((id) => document.getElementById(id));
  let offsets = [];
  function measure() {
    offsets = sectionEls.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : 0));
  }
  function scrollToS(y) {
    const n = offsets.length;
    if (n < 2 || y <= offsets[0]) return 0;
    for (let i = 0; i < n - 1; i++) {
      if (y < offsets[i + 1]) return i + (y - offsets[i]) / Math.max(1, offsets[i + 1] - offsets[i]);
    }
    return n - 1;
  }
  function activeIndex(y) {
    const probe = y + window.innerHeight * 0.4;
    let idx = 0;
    for (let i = 0; i < offsets.length; i++) if (offsets[i] <= probe) idx = i;
    return idx;
  }
  measure();

  // ---- 상태 ----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, over: false, moved: false, fine: !coarse };
  let sCur = scrollToS(window.scrollY);
  let sPrev = sCur;
  let velSmooth = 0;
  let spin = 0;
  let spinVel = 0;
  let time = 0;
  let intro = calm ? 1 : 0; // 모션 줄이기: 진입 연출 없이 바로 완성된 상태로
  let introStarted = false;
  let lastActive = -1;
  let hovered = null;
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  const ray = new Raycaster();
  const ndc = new Vector2();
  const evNdc = new Vector2();
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const titleLocal = new Vector3();

  // ---- 입력 ----
  const toNdc = (clientX, clientY, out) => {
    const r = canvas.getBoundingClientRect();
    return out.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  };
  const onPointerMove = (e) => {
    toNdc(e.clientX, e.clientY, evNdc);
    pointer.tx = evNdc.x;
    pointer.ty = evNdc.y;
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.over = e.target === canvas;
    pointer.moved = true;
    if (e.pointerType === "touch") pointer.fine = false;
  };
  const onPointerLeave = () => {
    pointer.over = false;
    pointer.tx = 0;
    pointer.ty = 0;
  };
  const pickAt = (clientX, clientY) => {
    toNdc(clientX, clientY, ndc);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(hitMeshes, false);
    for (const h of hits) {
      const item = h.object.userData.item;
      if (item && item.object.visible && item.alpha > 0.35) return item;
    }
    return null;
  };
  const onClick = (e) => {
    if (e.target !== canvas) return;
    const item = pickAt(e.clientX, e.clientY);
    if (item) onNavigate?.(item.def.target);
  };

  // ---- 크기 변경 ----
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    fx.setSize(width, height, dpr);
    applyLayout();
    measure();
  }
  function setDpr(next) {
    dpr = next;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    fx.setSize(width, height, dpr);
    applyLayout();
  }
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  const ro = new ResizeObserver(() => {
    resize();
    measure();
  });
  ro.observe(document.body);
  ro.observe(container);

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("click", onClick);

  // ---- 컨텍스트 유실 대응 ----
  const onContextLost = (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
  };
  const onContextRestored = () => {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  // ---- 적응형 해상도: 느린 기기에서는 DPR 을 단계적으로 낮춘다 ----
  let perfAcc = 0;
  let perfFrames = 0;
  let perfClock = 0;
  function adapt(dt) {
    if (hasForcedDpr || dpr <= 1) return;
    perfAcc += dt;
    perfFrames += 1;
    perfClock += dt;
    if (perfClock < 2) return;
    const avg = perfAcc / perfFrames;
    perfAcc = 0;
    perfFrames = 0;
    perfClock = 0;
    if (avg > 0.028) setDpr(Math.max(1, dpr - 0.25));
  }

  // ---- 프레임 ----
  const tmpPointer = new Vector2();
  const tmpSize = new Vector2();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000)) * devSpeed;
    last = now;
    time += dt;
    if (introStarted) intro = Math.min(1, intro + dt / 2.6);
    const introT = intro;

    // 포인터/스크롤 스무딩
    const follow = calm ? 30 : 4;
    pointer.x = damp(pointer.x, calm ? 0 : pointer.tx, follow, dt);
    pointer.y = damp(pointer.y, calm ? 0 : pointer.ty, follow, dt);

    const y = window.scrollY;
    const sTarget = scrollToS(y);
    sPrev = sCur;
    sCur = damp(sCur, sTarget, calm ? 30 : 6, dt);
    const ds = sCur - sPrev;
    velSmooth = damp(velSmooth, ds / dt, 10, dt);

    // 스크롤 관성 스핀: 빨리 스크롤하면 기기가 휙 돌고, 멈추면 가까운 정위치로 되돌아온다
    if (!calm) {
      spinVel = damp(spinVel, velSmooth * SPIN_GAIN, 3.5, dt);
      spin += spinVel * dt;
      const settle = 1 - smoothstep(0.12, 0.7, Math.abs(spinVel));
      spin = damp(spin, Math.round(spin / TAU) * TAU, 2.8 * settle, dt);
    }

    const idx = activeIndex(y);
    if (idx !== lastActive) {
      lastActive = idx;
      onActive?.(idx);
    }

    const pose = samplePose(layout.poses, sCur);

    // ---- 카메라 ----
    const dist = stage.dist * pose.cam.zoom;
    const yaw = pose.cam.yaw + pointer.x * 0.045;
    const kick = clamp(Math.abs(velSmooth) * 2.6, 0, 6);
    const fov = FOV + (calm ? 0 : kick);
    if (Math.abs(fov - camera.fov) > 0.01) camera.fov = fov;
    camera.position.set(
      Math.sin(yaw) * dist,
      pose.cam.lookY + pointer.y * 0.22 * (dist / 11),
      Math.cos(yaw) * dist
    );
    camera.lookAt(0, pose.cam.lookY, 0);
    camera.setViewOffset(
      width,
      height,
      -pose.cam.shiftX * width * 0.5,
      pose.cam.shiftY * height * 0.5,
      width,
      height
    );
    camera.updateMatrixWorld();

    // 포인터 → 월드 레이 (타이틀 물결, 클러스터 반발, 포인터 라이트에 사용)
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);

    // ---- 기기 ----
    const devIntro = easeOutBack(clamp(introT * 1.25));
    const bob = calm ? 0 : Math.sin(time * 0.9) * 0.06;
    const px = calm ? 0 : pointer.x;
    const py = calm ? 0 : pointer.y;

    {
      const g = pose.goggles;
      gogglesRig.position.set(g.x, g.y + bob, g.z);
      gogglesRig.rotation.set(
        g.rx - py * 0.14 + Math.sin(time * 0.6) * (calm ? 0 : 0.02),
        g.ry + spin + px * 0.3 + (1 - devIntro) * 2.2,
        g.rz
      );
      gogglesRig.scale.setScalar(Math.max(0.0001, g.s * devIntro));
      goggles.update(time);
    }
    {
      const w = pose.watch;
      watchRig.position.set(w.x, w.y - bob, w.z);
      watchRig.rotation.set(
        w.rx - py * 0.14 + Math.cos(time * 0.55) * (calm ? 0 : 0.02),
        w.ry - spin * 0.9 + px * 0.3 - (1 - devIntro) * 2.2,
        w.rz
      );
      watchRig.scale.setScalar(Math.max(0.0001, w.s * devIntro));
      watch.update(time, clamp(sCur / 4));
    }

    // ---- 타이틀 ----
    {
      const ts = titleScale();
      title.group.position.set(0, layout.title.y, 0);
      title.group.scale.setScalar(ts);
      title.group.rotation.set(-py * 0.1, px * 0.14, 0);
      let ptr = null;
      if (pointer.fine && pointer.moved && !calm) {
        // 포인터 레이를 타이틀 평면(z=0)과 교차
        const o = ray.ray.origin;
        const d = ray.ray.direction;
        const t = -o.z / d.z;
        titleLocal.set(o.x + d.x * t, o.y + d.y * t - layout.title.y, 0).divideScalar(ts);
        ptr = titleLocal;
      }
      title.update(time, { intro: introT, scatter: pose.title.scatter, pointer: ptr, calm });
    }

    // ---- 클러스터 (히어로 배치 ↔ 기기를 도는 링) ----
    {
      const c = pose.cluster;
      const ringMix = smoothstep(0, 1, c.ring);
      const ringSpin = (calm ? 0 : time * 0.12) + sCur * 1.3 + spin * 0.35;
      // 화면 픽셀 기준으로 타일/큐브 크기를 보정 (작은 폰에서는 키우고, 큰 화면에서는 그대로)
      const pxPerUnit = width / (2 * stage.hW);
      const tileK = clamp(104 / pxPerUnit, 0.9, 1.8);
      const cubeK = clamp(110 / pxPerUnit, 1, 1.4);
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      cluster.position.set(0, 0, 0);

      items.forEach((it, i) => {
        const bobA = calm ? 0 : Math.sin(time * it.freq + it.phase) * 0.1;
        const bobB = calm ? 0 : Math.cos(time * it.freq * 0.8 + it.phase) * 0.14;
        const bobC = calm ? 0 : Math.sin(time * 0.5 + it.phase) * 0.08;

        // 히어로 위치
        tmp.set(it.home.x + c.x + bobA, it.home.y + c.y + bobB, it.home.z + c.z + bobC);
        // 링 위치
        const a = it.ringAngle + ringSpin;
        tmp2.set(
          c.x + Math.cos(a) * c.rx * it.ringR,
          c.y + Math.sin(a + it.phase) * c.ry + bobB,
          c.z + Math.sin(a) * c.rz
        );
        tmp.lerp(tmp2, ringMix);

        // 포인터 반발 (같은 깊이의 평면에서 거리 계산)
        if (it.kind === "cube" && pointer.fine && pointer.moved && !calm && Math.abs(d.z) > 1e-4) {
          const t = (tmp.z - o.z) / d.z;
          const qx = o.x + d.x * t;
          const qy = o.y + d.y * t;
          const dx = tmp.x - qx;
          const dy = tmp.y - qy;
          const r2 = dx * dx + dy * dy;
          const f = Math.exp(-r2 / 1.1) * 0.85;
          const len = Math.sqrt(r2) || 1;
          it.off.x = damp(it.off.x, (dx / len) * f, 6, dt);
          it.off.y = damp(it.off.y, (dy / len) * f, 6, dt);
        } else {
          it.off.x = damp(it.off.x, 0, 6, dt);
          it.off.y = damp(it.off.y, 0, 6, dt);
        }
        tmp.add(it.off);

        // 글이 놓이는 화면 중앙에서는 큐브가 잠시 사라져 가독성을 지킨다
        const fade = lerp(1, smoothstep(1.6, 3.6, Math.abs(tmp.x)), c.clear);

        // 진입 연출: 하나씩 커지며 나타난다
        const k = clamp((introT - 0.35 - i * 0.03) / 0.35);
        const pop = easeOutBack(k);

        it.object.position.copy(tmp);
        if (it.kind === "cube") {
          const a2 = lerp(0.45, 1, c.cubeAlpha);
          it.object.scale.setScalar(Math.max(0.0001, it.def.size * a2 * pop * cubeK * fade));
          it.object.rotation.set(
            time * it.spin.x + it.phase,
            time * it.spin.y + it.phase * 1.3,
            time * it.spin.z
          );
          if (calm) it.object.rotation.set(it.phase, it.phase * 1.3, 0);
        } else {
          // 타일은 항상 카메라를 향하고, 포인터 쪽으로 살짝 기운다
          it.object.quaternion.copy(camera.quaternion);
          it.object.rotateY(px * 0.18);
          it.object.rotateX(-py * 0.12);
          const hov = it.tile.hover;
          it.object.scale.setScalar(Math.max(0.0001, (1 + 0.16 * hov) * pop * tileK));
          it.tile.alpha = c.alpha * pop;
          it.tile.setAlpha(it.tile.alpha);
        }
      });
    }

    // ---- 호버 판정 (타일) ----
    scene.updateMatrixWorld();
    if (pointer.fine && pointer.over) {
      hovered = pickAt(pointer.cx, pointer.cy);
      canvas.style.cursor = hovered ? "pointer" : "";
    } else if (hovered) {
      hovered = null;
      canvas.style.cursor = "";
    }
    for (const t of tiles) t.hover = damp(t.hover, t === hovered ? 1 : 0, 10, dt);

    // ---- 포인터 라이트 ----
    if (pointer.fine && pointer.moved && !calm) {
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      const t = (4.6 - o.z) / d.z;
      pointerLight.position.set(o.x + d.x * t, o.y + d.y * t, 4.6);
      pointerLight.intensity = damp(pointerLight.intensity, 7, 3, dt);
    } else {
      pointerLight.intensity = damp(pointerLight.intensity, 0, 3, dt);
    }

    // ---- 배경 + 후처리 ----
    backdrop.update(time, sCur, tmpPointer.set(pointer.x, pointer.y), calm);
    const fovRad = (camera.fov * Math.PI) / 180;
    backdrop.setPixelScale(renderer.getDrawingBufferSize(tmpSize).y / (2 * Math.tan(fovRad / 2)));
    fx.finish.uTime.value = time;
    fx.finish.uAberration.value = (calm ? 0.0004 : 0.0011) + clamp(Math.abs(velSmooth) * 0.0042, 0, 0.012);
    fx.bloom.strength = 0.8 + clamp(Math.abs(velSmooth) * 0.3, 0, 0.5);

    fx.render(dt);
    adapt(dt);
  }

  // 첫 프레임을 먼저 그려서(검은 화면 방지) 준비 완료로 알린다
  frame(performance.now());
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
  introStarted = true;

  // 폰트/레이아웃이 늦게 잡히는 경우를 대비해 한 번 더 측정
  requestAnimationFrame(measure);
  window.addEventListener("load", measure, { once: true });
  document.fonts?.ready?.then(() => !disposed && measure());

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("click", onClick);
      window.removeEventListener("load", measure);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      ro.disconnect();

      fx.dispose();
      title.dispose();
      watch.dispose();
      backdrop.dispose();
      disposeTree(scene);
      circuit.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
