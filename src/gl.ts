export type GL = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * Per-context texture bookkeeping. Kept in a WeakMap instead of being
 * monkey-patched onto the GL context (`gl.state`), so it type-checks and
 * is garbage-collected together with the context.
 */
export interface GLState {
	activeTextureUnit: number;
	textureUnits: (number | undefined)[];
	flipY: boolean;
}

const states = new WeakMap<GL, GLState>();

export function getGLState(gl: GL): GLState {
	let state = states.get(gl);

	if (!state) {
		state = { activeTextureUnit: 0, textureUnits: [], flipY: false };
		states.set(gl, state);
	}

	return state;
}

export function isWebGL2(gl: GL): gl is WebGL2RenderingContext {
	return typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
}
