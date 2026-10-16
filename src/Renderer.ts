import type { GL } from "./gl.ts";
import type { Geometry } from "./Geometry.ts";
import { DEFAULT_ATTRIBUTE_SIZE } from "./Geometry.ts";
import type { Program } from "./Program.ts";
import type { Uniform } from "./Program.ts";

export interface RendererOptions {
	canvas?: HTMLCanvasElement;
	antialias?: boolean;
	alpha?: boolean;
	depth?: boolean;
	stencil?: boolean;
	premultipliedAlpha?: boolean;
	/**
	 * Keeps the drawing buffer readable after compositing (screenshots,
	 * `toDataURL`). Costs some performance. Defaults to true.
	 */
	preserveDrawingBuffer?: boolean;
	pixelRatio?: number;
	webgl?: 1 | 2;
}

export interface RenderOptions {
	geometry: Geometry;
	program: Program;
	primitiveType?: number;
	offset?: number;
	/** Defaults to the geometry's vertex count. */
	count?: number;
}

export interface SizeOptions {
	width?: number;
	height?: number;
	pixelRatio?: number;
}

export interface RendererState {
	viewport: { width: number; height: number };
	pixelRatio: number;
	width: number;
	height: number;
}

export class Renderer {
	readonly canvas: HTMLCanvasElement;
	readonly gl: GL;
	state: RendererState;

	constructor({
		canvas = document.createElement("canvas"),
		antialias = false,
		alpha = true,
		depth = false,
		stencil = false,
		premultipliedAlpha = false,
		preserveDrawingBuffer = true,
		pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio : 1,
		webgl = 2,
	}: RendererOptions = {}) {
		const attributes: WebGLContextAttributes = {
			depth,
			stencil,
			antialias,
			alpha,
			premultipliedAlpha,
			preserveDrawingBuffer,
		};

		this.canvas = canvas;
		this.canvas.setAttribute("data-engine", "fragment-gl");

		let gl: GL | null = null;

		if (webgl === 2) gl = canvas.getContext("webgl2", attributes);
		if (!gl) {
			gl =
				canvas.getContext("webgl", attributes) ||
				(canvas.getContext("experimental-webgl", attributes) as WebGLRenderingContext | null);
		}

		if (!gl) {
			throw new Error(
				"fragment-gl.Renderer: WebGL is not supported or the context could not be created.",
			);
		}

		this.gl = gl;

		this.state = {
			viewport: { width: 0, height: 0 },
			pixelRatio,
			width: 0,
			height: 0,
		};
	}

	render({
		geometry,
		program,
		primitiveType = this.gl.TRIANGLES,
		offset = 0,
		count = geometry.vertexCount,
	}: RenderOptions): void {
		const { gl } = this;

		if (geometry.destroyed) {
			throw new Error("fragment-gl.Renderer: geometry has been destroyed.");
		}

		// Recompiles if needed. If there's no usable program (compile error
		// already logged), skip the frame and keep the last good image.
		const programObject = program.update() ? program.glProgram : null;
		if (!programObject) return;

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(programObject);

		for (const name in program.attributesLocations) {
			const location = program.attributesLocations[name];
			const buffer = geometry.buffers[name];

			if (!buffer) {
				console.warn(
					`missing-attribute:${program.id}:${name}`,
					`shader uses attribute "${name}" but the geometry doesn't provide it.`,
				);
				gl.disableVertexAttribArray(location);
				continue;
			}

			const size = geometry.attributes[name]?.size ?? DEFAULT_ATTRIBUTE_SIZE;

			gl.enableVertexAttribArray(location);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
		}

		let textureUnit = 0;

		for (const name in program.uniforms) {
			const location = program.getUniformLocation(name);
			if (!location) continue;

			textureUnit += this.setUniform(name, location, program.uniforms[name], textureUnit);
		}

		gl.drawArrays(primitiveType, offset, count);
	}

	/** Returns how many texture units were consumed (0 or 1). */
	private setUniform(
		name: string,
		location: WebGLUniformLocation,
		uniform: Uniform,
		textureUnit: number,
	): number {
		const { gl } = this;

		switch (uniform.type) {
			case "float":
				gl.uniform1f(location, uniform.value);
				return 0;
			case "int":
				gl.uniform1i(location, uniform.value);
				return 0;
			case "bool":
				gl.uniform1i(location, uniform.value ? 1 : 0);
				return 0;
			case "vec2":
				gl.uniform2f(location, uniform.value[0], uniform.value[1]);
				return 0;
			case "vec3":
				gl.uniform3f(location, uniform.value[0], uniform.value[1], uniform.value[2]);
				return 0;
			case "vec4":
				gl.uniform4f(
					location,
					uniform.value[0],
					uniform.value[1],
					uniform.value[2],
					uniform.value[3],
				);
				return 0;
			case "mat2":
				gl.uniformMatrix2fv(location, false, uniform.value);
				return 0;
			case "mat3":
				gl.uniformMatrix3fv(location, false, uniform.value);
				return 0;
			case "mat4":
				gl.uniformMatrix4fv(location, false, uniform.value);
				return 0;
			case "float[]":
				gl.uniform1fv(location, uniform.value);
				return 0;
			case "vec2[]":
				gl.uniform2fv(location, uniform.value);
				return 0;
			case "vec3[]":
				gl.uniform3fv(location, uniform.value);
				return 0;
			case "vec4[]":
				gl.uniform4fv(location, uniform.value);
				return 0;
			case "sampler2D":
				if (!uniform.value) return 0;

				uniform.value.update(textureUnit);
				gl.uniform1i(location, textureUnit);
				return 1;
			default:
				// Only reachable from untyped (JS) callers.
				console.warn(
					`unknown-uniform:${name}`,
					`uniform "${name}" has unsupported type "${String((uniform as { type?: unknown }).type)}".`,
				);
				return 0;
		}
	}

	setPixelRatio(pixelRatio: number = this.state.pixelRatio): void {
		if (this.state.pixelRatio !== pixelRatio) {
			this.setSize({ pixelRatio });
		}
	}

	/** Pixel ratio can be passed here too, so a resize only happens once. */
	setSize({
		width = this.state.width,
		height = this.state.height,
		pixelRatio = this.state.pixelRatio,
	}: SizeOptions = {}): void {
		this.state.width = width;
		this.state.height = height;
		this.state.pixelRatio = pixelRatio;

		this.canvas.width = Math.floor(width * pixelRatio);
		this.canvas.height = Math.floor(height * pixelRatio);

		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;

		this.setViewport();
	}

	setViewport({
		width = this.state.width,
		height = this.state.height,
	}: { width?: number; height?: number } = {}): void {
		const w = Math.floor(width * this.state.pixelRatio);
		const h = Math.floor(height * this.state.pixelRatio);

		if (this.state.viewport.width !== w || this.state.viewport.height !== h) {
			this.gl.viewport(0, 0, w, h);

			this.state.viewport.width = w;
			this.state.viewport.height = h;
		}
	}

	destroy(): void {
		this.gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
