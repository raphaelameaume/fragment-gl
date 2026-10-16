# fragment-gl

A tiny library for running fragment shaders on a canvas with WebGL 1/2. Built with [Vite+](https://viteplus.dev/)

- Zero dependencies, written in TypeScript
- Uses WebGL2 and falls back to WebGL1 automatically
- Typed uniforms (floats, vectors, matrices, arrays, textures)
- Hot-reload friendly: if a new shader fails to compile, the last working one keeps rendering
- Render-to-texture with `FBO`

## Installation

```bash
npm install fragment-gl
```

```bash
pnpm add fragment-gl
```

```bash
yarn add fragment-gl
```

## Usage

### Quick start

```ts
import { fragment, type Uniforms } from "fragment-gl";

const uniforms = {
	uTime: { type: "float", value: 0 },
	uColor: { type: "vec3", value: [1, 0.4, 0.2] },
} satisfies Uniforms;

const frag = fragment({
	canvas: document.querySelector("canvas")!, // optional, one is created if omitted
	uniforms,
	shader: /* glsl */ `
		precision highp float;

		varying vec2 vUv;
		uniform float uTime;
		uniform vec3 uColor;

		void main() {
			float pulse = 0.5 + 0.5 * sin(uTime + vUv.x * 6.2831);
			gl_FragColor = vec4(uColor * pulse, 1.0);
		}
	`,
});

frag.resize({ width: 800, height: 600, pixelRatio: window.devicePixelRatio });

function loop(t: number) {
	uniforms.uTime.value = t / 1000;
	frag.render();
	requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

The default vertex shader draws a single full-screen triangle and exposes a `vUv` varying (`0..1` across the canvas). It is written in GLSL ES 1.00 (`attribute` / `varying` / `gl_FragColor`), which works in both WebGL1 and WebGL2 contexts. If you want `#version 300 es` shaders, provide your own `vertex` as well.

### Textures

```ts
const image = new Image();
image.src = "/photo.jpg";

const frag = fragment({
	shader: /* glsl */ `
		precision highp float;
		varying vec2 vUv;
		uniform sampler2D uTexture;

		void main() {
			gl_FragColor = texture2D(uTexture, vUv);
		}
	`,
	uniforms: {
		uTexture: { type: "sampler2D", value: null },
	},
});

frag.uniforms.uTexture.value = frag.texture({ image });
```

An image or video that has not loaded yet is replaced by an empty placeholder and picked up automatically once it has a size. Set `texture.needsUpdate = true` after changing `texture.image` or drawing a new video frame.

### Live shader editing

```ts
frag.shader = newSource; // recompiles on the next render()
```

Compile and link errors are logged to the console. The previous working program keeps running, so a typo while editing never blanks the canvas.

### Render to texture (FBO)

`FBO` renders a fragment shader into a texture that you can use as a `sampler2D` in another pass. It works with the lower-level `Renderer`, `Geometry` and `Program` classes:

```ts
import { Renderer, Geometry, Program, FBO } from "fragment-gl";

const renderer = new Renderer({ canvas });
renderer.setSize({ width: 800, height: 600 });

const pass = new FBO(renderer, {
	width: 512,
	height: 512,
	fragment: /* glsl */ `
		precision highp float;
		varying vec2 vUv;
		void main() {
			gl_FragColor = vec4(vUv, 0.0, 1.0);
		}
	`,
});

const geometry = new Geometry(renderer.gl);
const program = new Program(renderer.gl, {
	fragment: /* glsl */ `
		precision highp float;
		varying vec2 vUv;
		uniform sampler2D uPass;
		void main() {
			gl_FragColor = texture2D(uPass, vUv);
		}
	`,
	uniforms: { uPass: { type: "sampler2D", value: pass.texture } },
});

function loop() {
	pass.render();
	renderer.render({ geometry, program });
	requestAnimationFrame(loop);
}

loop();
```

Float and half-float targets (`type: gl.FLOAT`, `internalFormat: gl.RGBA32F`, ...) require the matching color-buffer extension (for example `EXT_color_buffer_float` on WebGL2). If the framebuffer is incomplete, the `FBO` constructor throws a descriptive error. An FBO cannot sample its own texture; use two FBOs and swap them for ping-pong effects.

### Cleaning up

```ts
frag.destroy(); // frees the geometry, program, textures and loses the GL context
```

## API

### `fragment(options?)`

| Option     | Type                | Description                                           |
| ---------- | ------------------- | ----------------------------------------------------- |
| `canvas`   | `HTMLCanvasElement` | Canvas to draw on. Created if omitted.                |
| `shader`   | `string`            | Fragment shader source.                               |
| `vertex`   | `string`            | Vertex shader source. Defaults to a full-screen quad. |
| `uniforms` | `Uniforms`          | Uniform definitions (see below).                      |

Returns a `Frag` object:

| Member                                  | Description                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `gl`, `canvas`, `program`               | The underlying GL context, canvas and `Program`.                              |
| `shader` / `fragmentShader`             | Get or set the fragment shader source.                                        |
| `vertexShader`                          | Get or set the vertex shader source.                                          |
| `uniforms`                              | Get or set the uniforms object.                                               |
| `texture(options?)`                     | Creates a `Texture` that is destroyed together with the `Frag`.               |
| `resize({ width, height, pixelRatio })` | Sets the canvas size in CSS pixels. Omitted values keep their previous value. |
| `render()`                              | Draws one frame.                                                              |
| `destroy()`                             | Releases GPU resources.                                                       |

### Uniforms

Each uniform is `{ type, value }`. The shader uniform name is the object key.

| `type`                                  | `value`                                   |
| --------------------------------------- | ----------------------------------------- |
| `float`, `int`                          | `number`                                  |
| `bool`                                  | `boolean \| number`                       |
| `vec2`, `vec3`, `vec4`                  | tuple or `Float32Array`                   |
| `mat2`, `mat3`, `mat4`                  | `number[] \| Float32Array` (column-major) |
| `float[]`, `vec2[]`, `vec3[]`, `vec4[]` | flat `number[] \| Float32Array`           |
| `sampler2D`                             | `Texture \| null`                         |

Uniform locations are looked up lazily, so you can add uniforms to the object at any time.

### Lower-level classes

`Renderer`, `Geometry`, `Program`, `Texture` and `FBO` are exported for custom setups. Notable options:

- `new Renderer({ canvas, webgl: 1 | 2, alpha, antialias, preserveDrawingBuffer, pixelRatio })`. `preserveDrawingBuffer` defaults to `true` so you can use `toDataURL()`. Set it to `false` for a bit more performance.
- `new Geometry(gl, { attributes: { position: { data, size } } })` with `size` defaulting to 2 components. The vertex count is derived from the `position` attribute.
- `new Program(gl, { vertex, fragment, uniforms })`. Assign `program.fragment` or `program.vertex` to trigger a recompile.

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```
