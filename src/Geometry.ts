import type { GL } from "./gl.ts";

export interface GeometryAttribute {
	data: number[] | Float32Array;
	/** Components per vertex. Defaults to 2. */
	size?: number;
}

export type GeometryAttributes = Record<string, GeometryAttribute>;

export interface GeometryOptions {
	attributes?: GeometryAttributes;
}

/** A single oversized triangle that covers the whole viewport. */
function createDefaultAttributes(): GeometryAttributes {
	return {
		position: { data: [-1, -1, 3, -1, -1, 3], size: 2 },
		uv: { data: [0, 0, 2, 0, 0, 2], size: 2 },
	};
}

const DEFAULT_SIZE = 2;

export class Geometry {
	readonly gl: GL;
	attributes: GeometryAttributes;
	buffers: Record<string, WebGLBuffer>;
	/** Number of vertices, derived from `position` (or the first attribute). */
	vertexCount: number;
	destroyed = false;

	constructor(gl: GL, { attributes = createDefaultAttributes() }: GeometryOptions = {}) {
		this.gl = gl;
		this.attributes = attributes;
		this.buffers = {};

		for (const name of Object.keys(attributes)) {
			const buffer = gl.createBuffer();

			if (!buffer) {
				this.destroy();
				throw new Error(`fragment-gl.Geometry: could not create a buffer for "${name}".`);
			}

			const { data } = attributes[name];

			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				data instanceof Float32Array ? data : new Float32Array(data),
				gl.STATIC_DRAW,
			);

			this.buffers[name] = buffer;
		}

		const reference = attributes.position ?? Object.values(attributes)[0];

		this.vertexCount = reference
			? Math.floor(reference.data.length / (reference.size ?? DEFAULT_SIZE))
			: 0;
	}

	destroy(): void {
		for (const buffer of Object.values(this.buffers)) {
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, 1, this.gl.STATIC_DRAW);
			this.gl.deleteBuffer(buffer);
		}

		this.buffers = {};
		this.attributes = {};
		this.vertexCount = 0;
		this.destroyed = true;
	}
}

export { DEFAULT_SIZE as DEFAULT_ATTRIBUTE_SIZE };
