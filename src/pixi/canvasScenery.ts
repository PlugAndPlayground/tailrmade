import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import CanvasMode, { CANVAS_MODE } from './canvasMode';

// Space backdrop: a parallax star field that turns panning and zooming the
// graph into flying through space. It is one full-screen quad drawn with one
// fragment shader, so every star layer is a few extra lines of shader math
// instead of another texture or render pass.
//
// The shader never sees world coordinates. Each frame the camera movement is
// converted to a screen-space delta and added to per-layer offsets, scaled by
// that layer's depth. This keeps far layers slow, near layers fast, and avoids
// the drift you get from multiplying a large world position by a zoom factor.

const FADE_MS = 250;

const STAR_LAYERS = 6;
const CELL_PX = 70;
// how much one doubling of zoom pushes the star layers forward
const ZOOM_TRAVEL = 0.3;
const NEBULA_PX = 520;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// uStars[i]: xy offset in cells, z depth 0 far..1 near, w seed
// uNebula: xy offset, z zoom
// (not uResolution: Pixi binds its own global uniform under that name)
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uScreenSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uFade;
uniform vec4 uStars[${STAR_LAYERS}];
uniform vec4 uNebula;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int o = 0; o < 4; o++) {
    v += a * noise2(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 starLayer(vec2 p, vec4 L) {
  float z = L.z;
  float cellPx = ${CELL_PX.toFixed(1)} * exp2(z * 3.0);
  vec2 uv = (p - 0.5 * uScreenSize) / cellPx + L.xy;
  vec2 seed = floor(uv) + L.w * vec2(17.13, 31.71);
  float h = hash12(seed);
  if (h > 0.5) return vec3(0.0);
  vec2 pos = 0.2 + 0.6 * hash22(seed + 3.7);
  float d = length(fract(uv) - pos) * cellPx;
  float r = mix(0.4, 1.5, hash12(seed + 9.1)) * (0.6 + 1.6 * z * z);
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + 3.0 * h) + h * 40.0);
  float core = smoothstep(r + 0.8, r - 0.4, d);
  float glow = exp(-d / (r * 2.5)) * 0.35;
  float fade = smoothstep(0.0, 0.25, z) * smoothstep(1.0, 0.8, z);
  float t = hash12(seed + 5.3);
  vec3 tint = t < 0.15 ? vec3(1.0, 0.78, 0.6) : (t < 0.35 ? vec3(0.72, 0.82, 1.0) : vec3(1.0));
  return tint * (core + glow) * twinkle * fade;
}

void main() {
  // screen position in CSS pixels, origin top left
  vec2 p = vec2(gl_FragCoord.x, uScreenSize.y * uPixelRatio - gl_FragCoord.y) / uPixelRatio;
  vec2 q = p / uScreenSize;

  vec3 col = mix(vec3(0.04, 0.05, 0.13), vec3(0.01, 0.015, 0.045), q.y);

  vec2 nuv = (p - 0.5 * uScreenSize) / (${NEBULA_PX.toFixed(1)} * uNebula.z) + uNebula.xy + vec2(uTime * 0.004, 0.0);
  col += vec3(0.42, 0.16, 0.55) * smoothstep(0.48, 0.92, fbm2(nuv)) * 0.45;
  col += vec3(0.08, 0.38, 0.5) * smoothstep(0.52, 0.95, fbm2(nuv * 1.6 + vec2(4.2, -2.7))) * 0.32;

  for (int i = 0; i < ${STAR_LAYERS}; i++) {
    col += starLayer(p, uStars[i]);
  }

  col *= 1.0 - 0.35 * dot(q - 0.5, q - 0.5);
  // dither against gradient banding
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  // premultiplied, so the fade blends over the regular canvas background
  fragColor = vec4(col * uFade, uFade);
}
`;

const fract = (v: number): number => v - Math.floor(v);
const clamp = (v: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, v));
const starCellPx = (z: number): number => CELL_PX * 2 ** (z * 3);
const nebulaPx = (scale: number): number => NEBULA_PX * scale ** 0.12;

export default class CanvasScenery {
  mesh: PIXI.Mesh<PIXI.MeshGeometry, PIXI.Shader>;
  private app: PIXI.Application;
  private viewport: Viewport;
  private uniforms: PIXI.UniformGroup;
  private fade = 0;
  private warmedUp = false;
  private stars = new Float32Array(STAR_LAYERS * 4);
  private nebula = new Float32Array(4);
  private screenSize = new Float32Array(2);
  private lastCenter: PIXI.Point | undefined;
  private lastScale = 1;
  private startTime = performance.now();

  constructor(app: PIXI.Application, viewport: Viewport) {
    this.app = app;
    this.viewport = viewport;
    this.uniforms = new PIXI.UniformGroup({
      uScreenSize: { value: this.screenSize, type: 'vec2<f32>' },
      uPixelRatio: { value: 1, type: 'f32' },
      uTime: { value: 0, type: 'f32' },
      uFade: { value: 0, type: 'f32' },
      uStars: {
        value: this.stars,
        type: 'vec4<f32>',
        size: STAR_LAYERS,
      },
      uNebula: { value: this.nebula, type: 'vec4<f32>' },
    });
    this.mesh = new PIXI.Mesh({
      geometry: new PIXI.MeshGeometry({
        positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      }),
      shader: PIXI.Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT },
        resources: { sceneryUniforms: this.uniforms },
      }),
    });
    this.mesh.label = 'CanvasScenery';
    this.mesh.eventMode = 'none';
    // the first frame draws it fully transparent so the shader compiles at
    // startup instead of stuttering the first time the backdrop is turned on
    app.stage.addChildAt(this.mesh, 0);
    app.ticker.add(this.update);
    this.fade = this.isEnabled() ? 1 : 0;
    this.resetLayers();
  }

  private isEnabled(): boolean {
    return CanvasMode.get() === CANVAS_MODE.SPACE;
  }

  private resetLayers(): void {
    this.lastCenter = undefined;
    // spread the star layers so they don't start on the same cells
    for (let i = 0; i < STAR_LAYERS; i++) {
      this.stars[i * 4] = i * 37.1;
      this.stars[i * 4 + 1] = i * 11.7;
    }
  }

  // runs before each render, as the ticker renders at low priority
  private update = (ticker: PIXI.Ticker): void => {
    const target = this.isEnabled() ? 1 : 0;
    const step = ticker.deltaMS / FADE_MS;
    this.fade =
      target > this.fade
        ? Math.min(target, this.fade + step)
        : Math.max(target, this.fade - step);

    // after the warm-up draw, skip all work while off
    this.mesh.visible = this.fade > 0 || !this.warmedUp;
    this.warmedUp = true;
    if (!this.mesh.visible) {
      this.lastCenter = this.viewport.center.clone();
      return;
    }

    const scale = this.viewport.scale.x;
    const center = this.viewport.center;
    const lastCenter = this.lastCenter ?? center;
    const lastScale = this.lastCenter ? this.lastScale : scale;
    this.lastCenter = center.clone();
    this.lastScale = scale;

    // Each frame the camera either pans or zooms about one fixed screen
    // point: the cursor for wheel zoom, the pinch center on a trackpad, the
    // screen center for the zoom shortcuts. The star layers zoom about that
    // same point, so the stars under the cursor stay under it.
    const { width, height } = this.app.screen;
    let anchorX = 0;
    let anchorY = 0;
    let dx = 0;
    let dy = 0;
    if (Math.abs(scale / lastScale - 1) > 1e-4) {
      // offset of the fixed point from the screen center, in screen pixels
      const inverseScaleChange = 1 / lastScale - 1 / scale;
      anchorX = clamp((center.x - lastCenter.x) / inverseScaleChange, width);
      anchorY = clamp((center.y - lastCenter.y) / inverseScaleChange, height);
    } else {
      // camera movement in screen pixels, capped so jumps like loading a
      // graph don't fling the layers around
      dx = clamp((center.x - lastCenter.x) * scale, 300);
      dy = clamp((center.y - lastCenter.y) * scale, 300);
    }
    this.updateLayers(scale, lastScale, anchorX, anchorY, dx, dy);

    const u = this.uniforms.uniforms;
    this.screenSize[0] = width;
    this.screenSize[1] = height;
    u.uPixelRatio = this.app.renderer.resolution;
    u.uTime = (performance.now() - this.startTime) / 1000;
    u.uFade = this.fade;
    this.uniforms.update();
  };

  // Star layers cycle through depth as you zoom: zooming in pushes every
  // layer closer until it fades out in front of you and comes back from
  // the far end with a fresh seed, so you can zoom forever.
  private updateLayers(
    scale: number,
    lastScale: number,
    anchorX: number,
    anchorY: number,
    dx: number,
    dy: number,
  ): void {
    const travel = Math.log2(scale) * ZOOM_TRAVEL;
    const lastTravel = Math.log2(lastScale) * ZOOM_TRAVEL;
    for (let i = 0; i < STAR_LAYERS; i++) {
      const phase = i / STAR_LAYERS + travel;
      const z = fract(phase);
      const cellPx = starCellPx(z);
      const lastCellPx = starCellPx(fract(i / STAR_LAYERS + lastTravel));
      // keeps the layer point under the anchor where it was
      const anchorShift = 1 / lastCellPx - 1 / cellPx;
      const panFactor = 0.02 + 0.6 * z * z;
      this.stars[i * 4] += anchorX * anchorShift + (dx * panFactor) / cellPx;
      this.stars[i * 4 + 1] +=
        anchorY * anchorShift + (dy * panFactor) / cellPx;
      this.stars[i * 4 + 2] = z;
      this.stars[i * 4 + 3] = Math.floor(phase);
    }
    const px = nebulaPx(scale);
    const anchorShift = 1 / nebulaPx(lastScale) - 1 / px;
    this.nebula[0] += anchorX * anchorShift + (dx * 0.01) / px;
    this.nebula[1] += anchorY * anchorShift + (dy * 0.01) / px;
    this.nebula[2] = px / NEBULA_PX;
  }
}
