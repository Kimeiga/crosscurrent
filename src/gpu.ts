export type FrontTheme = "sea" | "land" | "air";

interface GpuApi {
  requestAdapter(): Promise<{ requestDevice(): Promise<GpuDevice> } | null>;
  getPreferredCanvasFormat(): string;
}
interface GpuQueue {
  writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView): void;
  submit(commands: unknown[]): void;
}
interface GpuDevice {
  queue: GpuQueue;
  createShaderModule(input: { code: string }): unknown;
  createRenderPipeline(input: Record<string, unknown>): GpuPipeline;
  createBuffer(input: { size: number; usage: number }): unknown;
  createBindGroup(input: { layout: unknown; entries: { binding: number; resource: { buffer: unknown } }[] }): unknown;
  createCommandEncoder(): GpuEncoder;
}
interface GpuPipeline { getBindGroupLayout(index: number): unknown; }
interface GpuEncoder {
  beginRenderPass(input: Record<string, unknown>): GpuPass;
  finish(): unknown;
}
interface GpuPass {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, group: unknown): void;
  draw(vertices: number): void;
  end(): void;
}
interface GpuContext {
  configure(input: { device: GpuDevice; format: string; alphaMode: "premultiplied" }): void;
  getCurrentTexture(): { createView(): unknown };
}

let devicePromise: Promise<{ device: GpuDevice; format: string } | null> | undefined;

export function gpuRuntime() {
  if (devicePromise) return devicePromise;
  devicePromise = (async () => {
    const gpu = (navigator as Navigator & { gpu?: GpuApi }).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    return { device, format: gpu.getPreferredCanvasFormat() };
  })().catch(() => null);
  return devicePromise;
}

export function webgpuContext(canvas: HTMLCanvasElement): GpuContext | null {
  return canvas.getContext("webgpu") as unknown as GpuContext | null;
}

export const GPU_BUFFER_USAGE = {
  uniform: 0x40,
  copyDst: 0x08,
} as const;

export const battlefieldShader = `
struct Params {
  resolution: vec2f,
  time: f32,
  own: f32,
  enemy: f32,
  target: f32,
  scoring: f32,
  theme: f32,
  motion: f32,
};
@group(0) @binding(0) var<uniform> p: Params;

fn hash(q: vec2f) -> f32 {
  return fract(sin(dot(q, vec2f(127.1, 311.7))) * 43758.5453123);
}
fn noise(q: vec2f) -> f32 {
  let i = floor(q);
  let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn palette(theme: f32, energy: f32) -> vec3f {
  if (theme < 0.5) { return mix(vec3f(0.015, 0.08, 0.13), vec3f(0.05, 0.42, 0.62), energy); }
  if (theme < 1.5) { return mix(vec3f(0.055, 0.045, 0.025), vec3f(0.48, 0.29, 0.09), energy); }
  return mix(vec3f(0.025, 0.055, 0.08), vec3f(0.32, 0.63, 0.82), energy);
}

@vertex fn vs(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
  let x = f32((id << 1u) & 2u);
  let y = f32(id & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let r = max(p.resolution, vec2f(1.0));
  let uv = frag.xy / r;
  let q = (uv - 0.5) * vec2f(r.x / r.y, 1.0);
  let t = p.time * p.motion;
  let balance = clamp((p.own - p.enemy) / 26.0, -1.0, 1.0);
  let total = clamp((p.own + p.enemy) / 52.0, 0.0, 1.0);
  var field = 0.0;

  if (p.theme < 0.5) {
    let w1 = sin(q.x * 20.0 + t * 1.8 + sin(q.y * 8.0 - t));
    let w2 = sin(q.x * 12.0 - q.y * 16.0 - t * 1.15);
    let caustic = pow(abs(w1 + w2) * 0.5, 5.0);
    field = 0.18 + caustic * 0.82 + noise(q * 8.0 + t * 0.08) * 0.12;
  } else if (p.theme < 1.5) {
    let n = noise(q * 5.0 + vec2f(t * 0.035, 0.0));
    let contour = 1.0 - smoothstep(0.025, 0.09, abs(fract((n + length(q) * 0.32) * 9.0) - 0.5));
    let fracture = pow(abs(sin((q.x + q.y * 0.42) * 25.0 + n * 6.0)), 18.0);
    field = 0.10 + contour * 0.34 + fracture * 0.22;
  } else {
    let cloud = noise(q * 4.0 + vec2f(t * 0.055, -t * 0.025));
    let streak = pow(max(0.0, sin(q.x * 5.0 - q.y * 19.0 + t * 1.2)), 14.0);
    field = 0.12 + cloud * 0.36 + streak * 0.26;
  }

  let center = exp(-dot(q, q) * 1.8);
  let tension = 0.5 + balance * 0.24;
  let pulse = (0.5 + 0.5 * sin(p.time * 6.0)) * p.scoring;
  let targetGlow = p.target * exp(-abs(q.x) * 2.2) * (0.65 + 0.35 * sin(p.time * 4.0));
  let energy = clamp(field * (0.42 + total * 0.5) + center * tension * 0.16 + pulse * 0.38 + targetGlow * 0.28, 0.0, 1.0);
  let color = palette(p.theme, energy);
  let edge = smoothstep(0.8, 0.18, abs(uv.y - 0.5));
  return vec4f(color, (0.12 + energy * 0.30) * edge);
}
`;