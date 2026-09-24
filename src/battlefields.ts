import {
  battlefieldShader,
  GPU_BUFFER_USAGE,
  gpuRuntime,
  webgpuContext,
  type FrontTheme,
} from "./gpu";

interface Field {
  stop(): void;
}

interface RunningField {
  canvas: HTMLCanvasElement;
  stop: () => void;
}

function themeOf(front: HTMLElement): FrontTheme {
  if (front.classList.contains("sea")) return "sea";
  if (front.classList.contains("land")) return "land";
  return "air";
}

function strength(front: HTMLElement, selector: string) {
  return Number(front.querySelector(selector)?.textContent?.trim() ?? 0) || 0;
}

function currentState(front: HTMLElement) {
  return {
    own: strength(front, ".cc-own-strength strong"),
    enemy: strength(front, ".cc-enemy-strength strong"),
    targeted: front.classList.contains("cc-destination") ? 1 : 0,
    scoring: front.querySelector(".cc-strength.cc-scored") ? 1 : 0,
  };
}

function makeCanvas(front: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.dataset.crosscurrentBattlefield = "";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    opacity: "0.92",
    zIndex: "-1",
  });
  front.style.isolation = "isolate";
  front.prepend(canvas);
  return canvas;
}

function fitCanvas(canvas: HTMLCanvasElement, front: HTMLElement) {
  const box = front.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 1.5);
  canvas.width = Math.max(2, Math.round(box.width * dpr));
  canvas.height = Math.max(2, Math.round(box.height * dpr));
}

function stopField(
  canvas: HTMLCanvasElement,
  resize: ResizeObserver,
  frame: number,
) {
  cancelAnimationFrame(frame);
  resize.disconnect();
  canvas.remove();
}

function themeIndex(front: HTMLElement) {
  const theme = themeOf(front);
  return theme === "sea" ? 0 : theme === "land" ? 1 : 2;
}

async function start(front: HTMLElement): Promise<Field | null> {
  const runtime = await gpuRuntime();
  if (!runtime || !front.isConnected) return null;

  const canvas = makeCanvas(front);
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
  const uniform = device.createBuffer({
    size: 48,
    usage: GPU_BUFFER_USAGE.uniform | GPU_BUFFER_USAGE.copyDst,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });
  const theme = themeIndex(front);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const started = performance.now();
  let frame = 0;
  let stopped = false;

  const resize = new ResizeObserver(() => fitCanvas(canvas, front));
  resize.observe(front);
  fitCanvas(canvas, front);

  const draw = (now: number) => {
    if (stopped || !canvas.isConnected) return;

    const state = currentState(front);
    canvas.style.filter = state.targeted
      ? "saturate(1.2) brightness(1.18)"
      : "";
    device.queue.writeBuffer(
      uniform,
      0,
      new Float32Array([
        canvas.width,
        canvas.height,
        (now - started) / 1000,
        state.own,
        state.enemy,
        state.targeted,
        state.scoring,
        theme,
        reduced.matches ? 0 : 1,
      ]),
    );

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
      stopField(canvas, resize, frame);
    },
  };
}

function pruneFields(
  fronts: Set<HTMLElement>,
  fields: Map<HTMLElement, Field>,
) {
  for (const [front, field] of fields) {
    if (fronts.has(front)) continue;
    field.stop();
    fields.delete(front);
  }
}

function attachField(front: HTMLElement, fields: Map<HTMLElement, Field>) {
  if (
    fields.has(front) ||
    front.querySelector("[data-crosscurrent-battlefield]")
  )
    return;

  void start(front).then((field) => {
    if (!field) return;
    if (!front.isConnected) {
      field.stop();
      return;
    }
    fields.set(front, field);
  });
}

function attachFields(
  fronts: Set<HTMLElement>,
  fields: Map<HTMLElement, Field>,
) {
  for (const front of fronts) attachField(front, fields);
}

/** Attach GPU fields to whichever game table is currently mounted. */
export function installBattlefields(root: Document | Element = document) {
  const fields = new Map<HTMLElement, Field>();
  let scheduled = false;

  const sync = () => {
    scheduled = false;
    const fronts = new Set(root.querySelectorAll<HTMLElement>(".cc-front"));
    pruneFields(fronts, fields);
    attachFields(fronts, fields);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(
    root === document ? document.documentElement : root,
    { childList: true, subtree: true },
  );
  schedule();

  return () => {
    observer.disconnect();
    for (const field of fields.values()) field.stop();
    fields.clear();
  };
}
