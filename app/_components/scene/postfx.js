import { Vector2 } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// 마무리 패스: 색수차(스크롤 속도에 비례) + 비네팅 + 필름 그레인
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0012 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAberration * (0.35 + dot(c, c) * 3.2);
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - off).b;
      vec3 col = vec3(r, g, b);

      col *= 1.0 - uVignette * smoothstep(0.28, 0.98, length(c) * 1.35);
      col += (hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPostFX({ renderer, scene, camera, width, height, pixelRatio, fxaa = true }) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new Vector2(width, height), 0.75, 0.6, 0.92);
  composer.addPass(bloom);

  composer.addPass(new OutputPass()); // 톤매핑 + sRGB 변환

  if (fxaa) composer.addPass(new FXAAPass()); // sRGB 입력이 필요하므로 OutputPass 뒤에 둔다

  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  return {
    composer,
    bloom,
    finish: finish.uniforms,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    },
    render(dt) {
      composer.render(dt);
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
    },
  };
}
