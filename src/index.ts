import { Geometry } from "./Geometry.ts";
import { Texture } from "./Texture.ts";
import type { TextureOptions } from "./Texture.ts";
import { Program, defaultFragment, defaultVertex } from "./Program.ts";
import type { Uniform, Uniforms } from "./Program.ts";
import { Renderer } from "./Renderer.ts";
import { FBO } from "./FBO.ts";
import type { SizeOptions } from "./Renderer.ts";
import type { GL } from "./gl.ts";

export { Geometry, Texture, Program, Renderer, FBO, defaultFragment, defaultVertex };
export type { FBOOptions } from "./FBO.ts";
export type { GL, Uniform, Uniforms, TextureOptions };
export type { GeometryAttribute, GeometryAttributes } from "./Geometry.ts";
export type { RendererOptions, RenderOptions } from "./Renderer.ts";

export interface FragmentOptions {
	canvas?: HTMLCanvasElement;
	shader?: string;
	vertex?: string;
	uniforms?: Uniforms;
}

export type ResizeParams = SizeOptions;

export interface Frag {
	readonly gl: GL;
	readonly renderer: Renderer;
	readonly canvas: HTMLCanvasElement;
	readonly program: Program;
	/** Fragment shader source (alias of `fragmentShader`). */
	shader: string;
	fragmentShader: string;
	vertexShader: string;
	uniforms: Uniforms;
	texture(params?: TextureOptions): Texture;
	resize(params?: ResizeParams): void;
	render(): void;
	destroy(): void;
}

export function fragment({
	canvas,
	shader = defaultFragment,
	vertex = defaultVertex,
	uniforms = {},
}: FragmentOptions = {}): Frag {
	const renderer = new Renderer({ canvas });
	const geometry = new Geometry(renderer.gl);
	const program = new Program(renderer.gl, {
		vertex,
		fragment: shader,
		uniforms,
	});
	const textures = new Set<Texture>();

	const frag: Frag = {
		gl: renderer.gl,
		renderer: renderer,
		canvas: renderer.canvas,
		program,

		texture(params = {}) {
			const texture = new Texture(renderer.gl, params);
			textures.add(texture);
			return texture;
		},

		// Width, height and pixelRatio each fall back to the last values used.
		resize(params = {}) {
			renderer.setSize(params);
		},

		render() {
			renderer.render({ geometry, program });
		},

		destroy() {
			geometry.destroy();
			program.destroy();
			program.uniforms = {};
			textures.forEach((texture) => texture.destroy());
			textures.clear();
			renderer.destroy();
		},

		get shader() {
			return program.fragmentShader;
		},
		set shader(source: string) {
			program.fragmentShader = source;
		},

		get fragmentShader() {
			return program.fragmentShader;
		},
		set fragmentShader(source: string) {
			program.fragmentShader = source;
		},

		get vertexShader() {
			return program.vertexShader;
		},
		set vertexShader(source: string) {
			program.vertexShader = source;
		},

		get uniforms() {
			return program.uniforms;
		},
		set uniforms(value: Uniforms) {
			program.uniforms = value;
		},
	};

	return frag;
}
