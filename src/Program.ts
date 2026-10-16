import type { GL } from "./gl.js";
import type { Texture } from "./Texture.ts";

export type Vec2 = [number, number] | Float32Array;
export type Vec3 = [number, number, number] | Float32Array;
export type Vec4 = [number, number, number, number] | Float32Array;
export type NumberList = number[] | Float32Array;

export type Uniform =
	| { type: "float"; value: number }
	| { type: "int"; value: number }
	| { type: "bool"; value: boolean | number }
	| { type: "vec2"; value: Vec2 }
	| { type: "vec3"; value: Vec3 }
	| { type: "vec4"; value: Vec4 }
	| { type: "mat2" | "mat3" | "mat4"; value: NumberList }
	/** Flat arrays: `float[]`, `vec2[]` (x0,y0,x1,y1,...), etc. */
	| { type: "float[]" | "vec2[]" | "vec3[]" | "vec4[]"; value: NumberList }
	| { type: "sampler2D"; value: Texture | null };

export type Uniforms = Record<string, Uniform>;

export interface ProgramOptions {
	vertex?: string;
	fragment?: string;
	uniforms?: Uniforms;
}

function createShader(gl: GL, type: number, source: string, label: string): WebGLShader | null {
	const shader = gl.createShader(type);

	if (!shader) {
		console.error(`fragment-gl.Program: could not create ${label} shader.`);
		return null;
	}

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		return shader;
	}

	console.error(
		`fragment-gl.Program: ${label} shader failed to compile:\n${gl.getShaderInfoLog(shader)}`,
	);
	gl.deleteShader(shader);

	return null;
}

let P_ID = 0;

const defaultVertex = /* glsl */ `
    attribute vec4 position;
    attribute vec2 uv;

    varying vec2 vUv;

    void main(){
        vUv = uv;
        gl_Position = position;
    }
`;

const defaultFragment = /* glsl */ `
    precision highp float;

    varying vec2 vUv;

    void main() {
        gl_FragColor = vec4(vec3(0., 1., 0.), 1.);
    }
`;

export class Program {
	readonly gl: GL;
	readonly id: number;
	uniforms: Uniforms;
	/** Set to true to force a recompile on the next render. */
	needsUpdate = true;
	/** True when a successfully linked program is available. */
	ready = false;
	attributesLocations: Record<string, number> = {};

	private _program: WebGLProgram | null = null;
	private _vertex: string;
	private _fragment: string;
	private uniformLocations = new Map<string, WebGLUniformLocation | null>();

	constructor(
		gl: GL,
		{ vertex = defaultVertex, fragment = defaultFragment, uniforms = {} }: ProgramOptions = {},
	) {
		this.gl = gl;
		this.id = P_ID++;
		this._vertex = vertex;
		this._fragment = fragment;
		this.uniforms = uniforms;

		this.compile();
	}

	/** Vertex shader source. Assigning schedules a recompile. */
	get vertexShader(): string {
		return this._vertex;
	}

	set vertexShader(source: string) {
		if (source === this._vertex) return;
		this._vertex = source;
		this.needsUpdate = true;
	}

	/** Fragment shader source. Assigning schedules a recompile. */
	get fragmentShader(): string {
		return this._fragment;
	}

	set fragmentShader(source: string) {
		if (source === this._fragment) return;

		this._fragment = source;
		this.needsUpdate = true;
	}

	/** The linked WebGL program, or null if none has linked yet. */
	get glProgram(): WebGLProgram | null {
		return this._program;
	}

	/**
	 * Recompiles if needed. Returns whether a usable program exists.
	 * A failed recompile keeps the previous working program, so a typo
	 * while live-editing a shader doesn't blank the canvas.
	 */
	update(): boolean {
		if (this.needsUpdate) this.compile();
		return this.ready;
	}

	compile(): boolean {
		const { gl } = this;

		this.needsUpdate = false;

		const vertexShader = createShader(gl, gl.VERTEX_SHADER, this._vertex, "vertex");
		const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, this._fragment, "fragment");

		if (!vertexShader || !fragmentShader) {
			if (vertexShader) gl.deleteShader(vertexShader);
			if (fragmentShader) gl.deleteShader(fragmentShader);
			return false;
		}

		// A fresh program per attempt: a failed link can't poison later ones.
		const program = gl.createProgram();

		if (!program) {
			gl.deleteShader(vertexShader);
			gl.deleteShader(fragmentShader);
			console.error("fragment-gl.Program: could not create a program.");
			return false;
		}

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
		const log = gl.getProgramInfoLog(program);

		// Shaders are no longer needed once linked (or failed).
		gl.detachShader(program, vertexShader);
		gl.detachShader(program, fragmentShader);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);

		if (!linked) {
			console.error(`fragment-gl.Program: link failed:\n${log}`);
			gl.deleteProgram(program);
			return false;
		}

		if (log) {
			console.warn(`fragment-gl.Program: Program Info Log: ${log}`);
		}

		if (this._program) gl.deleteProgram(this._program);

		this._program = program;
		this.uniformLocations.clear();

		const attributesLocations: Record<string, number> = {};
		const count: number = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

		for (let index = 0; index < count; index++) {
			const attribute = gl.getActiveAttrib(program, index);
			if (!attribute) continue;

			const location = gl.getAttribLocation(program, attribute.name);
			// -1 means built-in or inactive: nothing to bind.
			if (location === -1) continue;

			attributesLocations[attribute.name] = location;
		}

		this.attributesLocations = attributesLocations;
		this.ready = true;

		return true;
	}

	/**
	 * Looks up (and caches) a uniform location. Looked up lazily so uniforms
	 * added after construction work, and replacing `uniforms` needs no relink.
	 */
	getUniformLocation(name: string): WebGLUniformLocation | null {
		if (!this._program) return null;

		if (!this.uniformLocations.has(name)) {
			this.uniformLocations.set(name, this.gl.getUniformLocation(this._program, name));
		}

		return this.uniformLocations.get(name) ?? null;
	}

	destroy(): void {
		if (this._program) this.gl.deleteProgram(this._program);

		this._program = null;
		this.ready = false;
		this.attributesLocations = {};
		this.uniformLocations.clear();
	}
}

export { defaultVertex, defaultFragment };
