import { Geometry } from "./Geometry.ts";
import { Texture } from "./Texture.ts";
import type { TextureOptions } from "./Texture.ts";
import { Program } from "./Program.ts";
import type { ProgramOptions } from "./Program.ts";
import type { Renderer } from "./Renderer.ts";
import type { GL } from "./gl.ts";

export interface FBOOptions
	extends
		ProgramOptions,
		Pick<
			TextureOptions,
			| "name"
			| "type"
			| "wrapS"
			| "wrapT"
			| "generateMipmaps"
			| "format"
			| "internalFormat"
			| "minFilter"
			| "magFilter"
		> {
	width?: number;
	height?: number;
}

export class FBO {
	readonly gl: GL;
	readonly renderer: Renderer;
	readonly geometry: Geometry;
	readonly program: Program;
	readonly texture: Texture;
	framebuffer: WebGLFramebuffer | null = null;
	width: number;
	height: number;
	destroyed = false;

	constructor(
		renderer: Renderer,
		{
			name = "",
			vertex,
			fragment,
			uniforms,
			width = 512,
			height = 512,
			type,
			wrapS,
			wrapT,
			generateMipmaps = false,
			format,
			internalFormat,
			minFilter,
			magFilter,
		}: FBOOptions = {},
	) {
		const { gl } = renderer;

		this.gl = gl;
		this.renderer = renderer;
		this.width = width;
		this.height = height;

		this.geometry = new Geometry(gl);

		this.program = new Program(gl, { vertex, fragment, uniforms });

		this.texture = new Texture(gl, {
			name,
			width,
			height,
			type,
			wrapS,
			wrapT,
			generateMipmaps,
			format,
			internalFormat,
			minFilter,
			magFilter,
		});

		const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;

		try {
			this.texture.update();

			const framebuffer = gl.createFramebuffer();

			if (!framebuffer || !this.texture.glTexture) {
				throw new Error("fragment-gl.FBO: could not create framebuffer.");
			}

			this.framebuffer = framebuffer;

			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				this.texture.glTexture,
				0,
			);

			const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

			if (status !== gl.FRAMEBUFFER_COMPLETE) {
				throw new Error(
					`fragment-gl.FBO: framebuffer is incomplete (status 0x${status.toString(16)}). ` +
						"Float/half-float targets need EXT_color_buffer_float (WebGL2) " +
						"or WEBGL_color_buffer_float / EXT_color_buffer_half_float (WebGL1) to be enabled.",
				);
			}
		} catch (error) {
			this.destroy();
			throw error;
		} finally {
			gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
		}
	}

	resize(width: number, height: number): void {
		if (this.destroyed) return;

		this.width = width;
		this.height = height;
		this.texture.resize(width, height);
	}

	render(): void {
		if (this.destroyed || !this.framebuffer) return;

		const { gl } = this;

		const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
		const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.width, this.height);

		try {
			this.renderer.render({
				geometry: this.geometry,
				program: this.program,
			});
		} finally {
			gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
			gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
		}
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		this.texture.destroy();
		this.program.destroy();
		this.geometry.destroy();

		if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
		this.framebuffer = null;
	}
}
