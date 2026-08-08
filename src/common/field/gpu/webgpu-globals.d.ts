/**
 * webgpu-globals.d.ts
 *
 * TypeScript 7's `lib.dom.d.ts` ships the WebGPU *interfaces* (GPUDevice,
 * GPUTexture, GPUCanvasContext, …) but not the flag namespaces the API is
 * configured with. Declaring those here is cheaper and less fragile than pulling
 * in `@webgpu/types`, which would redeclare all 107 interfaces and collide with
 * the built-in ones.
 *
 * The other gap — a `getContext("webgpu")` overload — is deliberately *not*
 * patched here. Augmenting `HTMLCanvasElement` puts the new overload ahead of the
 * built-ins in resolution order, which breaks any code that forwards
 * `getContext(id, ...args)` generically (the fleet's `tests/setup.ts` canvas mock
 * does exactly that). `requestCanvasContext` in WebGpuSupport.ts does the cast in
 * one place instead.
 *
 * Nothing in this file describes behaviour — it is purely the missing half of an
 * existing type declaration. If a future TypeScript release fills these in, this
 * file can be deleted and `npm run check` will say so.
 */

declare const GPUBufferUsage: {
  readonly MAP_READ: 0x0001;
  readonly MAP_WRITE: 0x0002;
  readonly COPY_SRC: 0x0004;
  readonly COPY_DST: 0x0008;
  readonly INDEX: 0x0010;
  readonly VERTEX: 0x0020;
  readonly UNIFORM: 0x0040;
  readonly STORAGE: 0x0080;
  readonly INDIRECT: 0x0100;
  readonly QUERY_RESOLVE: 0x0200;
};

declare const GPUTextureUsage: {
  readonly COPY_SRC: 0x01;
  readonly COPY_DST: 0x02;
  readonly TEXTURE_BINDING: 0x04;
  readonly STORAGE_BINDING: 0x08;
  readonly RENDER_ATTACHMENT: 0x10;
};

declare const GPUShaderStage: {
  readonly VERTEX: 0x1;
  readonly FRAGMENT: 0x2;
  readonly COMPUTE: 0x4;
};

declare const GPUMapMode: {
  readonly READ: 0x0001;
  readonly WRITE: 0x0002;
};

declare const GPUColorWrite: {
  readonly RED: 0x1;
  readonly GREEN: 0x2;
  readonly BLUE: 0x4;
  readonly ALPHA: 0x8;
  readonly ALL: 0xf;
};
