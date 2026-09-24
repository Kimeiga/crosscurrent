<script lang="ts">
  import { onMount } from "svelte";
  import { battlefieldShader, bufferUsage, gpuRuntime, webgpuContext, type FrontTheme } from "./gpu";

  export let theme: FrontTheme;
  export let own = 0;
  export let enemy = 0;
  export let targeted = false;
  export let scoring = false;

  let canvas: HTMLCanvasElement;
  let active = false;
  let frame = 0;

  onMount(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    let reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => { reduced = media.matches; };
    media.addEventListener("change", updateMotion);

    void (async () => {
      const runtime = await gpuRuntime();
      const context = webgpuContext(canvas);
      if (!runtime || !context || disposed) return;
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
      const themeIndex = theme === "sea" ? 0 : theme === "land" ? 1 : 2;
      const started = performance.now();

      const size = () => {
        const box = canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio, 1.5);
        const width = Math.max(2, Math.round(box.width * dpr));
        const height = Math.max(2, Math.round(box.height * dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      };
      resize = new ResizeObserver(size);
      resize.observe(canvas);
      size();
      active = true;

      const draw = (now: number) => {
        if (disposed) return;
        const values = new Float32Array([
          canvas.width, canvas.height,
          (now - started) / 1000, own, enemy, targeted ? 1 : 0, scoring ? 1 : 0, themeIndex, reduced ? 0 : 1,
        ]);
        device.queue.writeBuffer(uniform, 0, values);
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
    })();

    return () => {
      disposed = true;
      active = false;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      media.removeEventListener("change", updateMotion);
    };
  });
</script>

<canvas bind:this={canvas} class:active class="cc-battlefield" aria-hidden="true"></canvas>