import { battlefieldShader, bufferUsage, gpuRuntime, webgpuContext, type FrontTheme } from "./gpu";

interface Field { stop(): void; }

function themeOf(front: HTMLElement): FrontTheme {
  if (front.classList.contains("sea")) return "sea";
  if (front.classList.contains("land")) return "land";
  return "air";
}

function strength(front: HTMLElement, selector: string) {
  return Number(front.querySelector(selector)?.textContent?.trim() ?? 0) || 0;
}

function state(front: HTMLElement) {
  return {
    own: strength(front, ".cc-own-strength strong"),
    enemy: strength(front, ".cc-enemy-strength strong"),
    targeted: front.classList.contains("cc-destination") ? 1 : 0,
    scoring: front.querySelector(".cc-strength.cc-scored") ? 1 : 0,
  };
}

async function start(front: HTMLElement): Promise<Field | null> {
  const runtime = await gpuRuntime();
  if (!runtime || !front.isConnected) return null;

  const canvas = document.createElement("canvas");
  canvas.className = "cc-battlefield";
  canvas.setAttribute("aria-hidden", "true");
  front.prepend(canvas);
  const context = webgpuContext(canvas);
  if (!context) {
    canvas.remove();
    return null;
  }

  const { device, format } = runtime;
  context.configure({ device, format, alphaMode: "premultiplied" });
  const module = device.createShaderModule({ code: battlefieldShader });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const usage = bufferUsage();
  const uniform = device.createBuffer({ size: 48, usage: usage.uniform | usage.copyDst });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });
  const theme = themeOf(front);
  const themeIndex = theme === "sea" ? 0 : theme === "land" ? 1 : 2;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const started = performance.now();
  let frame = 0;
  let stopped = false;

  const fit = () => {
    const box = front.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 1.5);
    const width = Math.max(2, Math.round(box.width * dpr));
    const height = Math.max(2, Math.round(box.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  };
  const resize = new ResizeObserver(fit);
  resize.observe(front);
  fit();
  canvas.classList.add("active");

  const draw = (now: number) => {
    if (stopped || !canvas.isConnected) return;
    const current = state(front);
    device.queue.writeBuffer(uniform, 0, new Float32Array([
      canvas.width, canvas.height,
      (now - started) / 1000, current.own, current.enemy,
      current.targeted, current.scoring, themeIndex, reduced.matches ? 0 : 1,
    ]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.remove();
    },
  };
}

/** Attach GPU fields to whichever game table is currently mounted. */
export function installBattlefields(root: ParentNode = document) {
  const fields = new Map<HTMLElement, Field>();
  let syncing = false;

  const sync = () => {
    syncing = false;
    const fronts = new Set(root.querySelectorAll<HTMLElement>(".cc-front"));
    for (const [front, field] of fields) {
      if (fronts.has(front)) continue;
      field.stop();
      fields.delete(front);
    }
    for (const front of fronts) {
      if (fields.has(front) || front.querySelector(".cc-battlefield")) continue;
      void start(front).then((field) => {
        if (!field) return;
        if (!front.isConnected) { field.stop(); return; }
        fields.set(front, field);
      });
    }
  };
  const schedule = () => {
    if (syncing) return;
    syncing = true;
    requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
  schedule();

  return () => {
    observer.disconnect();
    for (const field of fields.values()) field.stop();
    fields.clear();
  };
}
