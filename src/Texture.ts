import { getGLState, isWebGL2, type GL, type GLState } from "./gl.ts";
import { getSourceSize, isPowerOf2 } from "./utils.ts";

let TEXTURE_ID = 0;

export interface TextureOptions {
	image?: TexImageSource | null;
	name?: string;
	width?: number;
	height?: number;
	target?: number;
	type?: number;
	wrapS?: number;
	wrapT?: number;
	generateMipmaps?: boolean;
	format?: number;
	internalFormat?: number;
	minFilter?: number;
	magFilter?: number;
	flipY?: boolean;
}

export class Texture {
	readonly gl: GL;
	readonly id: number;
	image: TexImageSource | null;
	name: string;
	width: number;
	height: number;
	target: number;
	type: number;
	wrapS: number;
	wrapT: number;
	generateMipmaps: boolean;
	format: number;
	internalFormat: number;
	minFilter: number;
	magFilter: number;
	flipY: boolean;
	needsUpdate = true;
	destroyed = false;
	glTexture: WebGLTexture | null;

	private readonly state: GLState;

	constructor(
		gl: GL,
		{
			image = null,
			name = "",
			width = 1,
			height = 1,
			target = gl.TEXTURE_2D,
			type = gl.UNSIGNED_BYTE,
			wrapS = gl.CLAMP_TO_EDGE,
			wrapT = gl.CLAMP_TO_EDGE,
			generateMipmaps = true,
			format = gl.RGBA,
			internalFormat = format,
			minFilter = generateMipmaps ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR,
			magFilter = gl.LINEAR,
			flipY = target === gl.TEXTURE_2D,
		}: TextureOptions = {},
	) {
		const glTexture = gl.createTexture();

		if (!glTexture) {
			throw new Error("fragment-gl.Texture: could not create a texture.");
		}

		this.gl = gl;
		this.state = getGLState(gl);
		this.glTexture = glTexture;
		this.id = TEXTURE_ID++;

		this.image = image;
		this.name = name;
		this.width = width;
		this.height = height;
		this.target = target;
		this.type = type;
		this.wrapS = wrapS;
		this.wrapT = wrapT;
		this.generateMipmaps = generateMipmaps;
		this.format = format;
		this.internalFormat = internalFormat;
		this.minFilter = minFilter;
		this.magFilter = magFilter;
		this.flipY = flipY;
	}

	bind(): void {
		if (!this.glTexture) return;

		const { state } = this;

		if (state.textureUnits[state.activeTextureUnit] === this.id) return;

		this.gl.bindTexture(this.target, this.glTexture);
		state.textureUnits[state.activeTextureUnit] = this.id;
	}

	update(textureUnit = 0): void {
		if (this.destroyed || !this.glTexture) return;

		const { gl, state } = this;

		if (this.needsUpdate || state.textureUnits[textureUnit] !== this.id) {
			if (state.activeTextureUnit !== textureUnit) {
				state.activeTextureUnit = textureUnit;
				gl.activeTexture(gl.TEXTURE0 + textureUnit);
			}

			this.bind();
		}

		if (!this.needsUpdate) return;

		this.needsUpdate = false;

		if (this.flipY !== state.flipY) {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
			state.flipY = this.flipY;
		}

		// Effective settings for this upload. The user's own properties
		// are never overwritten by the fallbacks below.
		let wrapS = this.wrapS;
		let wrapT = this.wrapT;
		let minFilter = this.minFilter;
		let mipmaps = this.generateMipmaps;
		let source = this.image;

		// Size of what is actually uploaded: the image, or the empty storage.
		let width = this.width;
		let height = this.height;

		if (source) {
			const size = getSourceSize(source);

			if (size.width === 0 || size.height === 0) {
				// Image/video not loaded yet: allocate empty storage and retry
				// on the next render instead of uploading a 0x0 texture.
				source = null;
				this.needsUpdate = true;
			} else {
				width = size.width;
				height = size.height;
			}
		}

		// WebGL1 only: NPOT textures need clamp and no mipmaps. This applies
		// to empty render-target storage too, not only to images.
		if (!isWebGL2(gl) && (!isPowerOf2(width) || !isPowerOf2(height))) {
			mipmaps = false;
			wrapS = wrapT = gl.CLAMP_TO_EDGE;
		}

		if (!source) {
			// A mipmap filter on a texture without mipmaps is "incomplete"
			// and samples as black.
			mipmaps = false;
		}

		if (!mipmaps) {
			minFilter = this.toNonMipmapFilter(minFilter);
		}

		gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, wrapS);
		gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, wrapT);
		gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, minFilter);
		gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, this.magFilter);

		if (source) {
			gl.texImage2D(this.target, 0, this.internalFormat, this.format, this.type, source);

			if (mipmaps) {
				gl.generateMipmap(this.target);
			}
		} else {
			gl.texImage2D(
				this.target,
				0,
				this.internalFormat,
				width,
				height,
				0,
				this.format,
				this.type,
				null,
			);
		}
	}

	resize(width: number, height: number): void {
		if (width === this.width && height === this.height) return;

		this.width = width;
		this.height = height;
		this.needsUpdate = true;
		this.update();
	}

	destroy(): void {
		if (this.destroyed) return;

		const { textureUnits } = this.state;

		for (let unit = 0; unit < textureUnits.length; unit++) {
			if (textureUnits[unit] === this.id) textureUnits[unit] = undefined;
		}

		if (this.glTexture) this.gl.deleteTexture(this.glTexture);

		this.glTexture = null;
		this.image = null;
		this.destroyed = true;
	}

	private toNonMipmapFilter(filter: number): number {
		const { gl } = this;

		switch (filter) {
			case gl.NEAREST_MIPMAP_NEAREST:
				return gl.NEAREST;
			case gl.NEAREST_MIPMAP_LINEAR:
			case gl.LINEAR_MIPMAP_NEAREST:
			case gl.LINEAR_MIPMAP_LINEAR:
				return gl.LINEAR;
			default:
				return filter;
		}
	}
}
