export function isPowerOf2(value: number): boolean {
	// 0 is not a power of two (the old `(v & (v - 1)) === 0` said it was).
	return value > 0 && (value & (value - 1)) === 0;
}

export interface Size {
	width: number;
	height: number;
}

/** Real pixel size of any texture source (`.width` is wrong for img/video). */
export function getSourceSize(source: TexImageSource): Size {
	if ("videoWidth" in source) {
		return { width: source.videoWidth, height: source.videoHeight };
	}
	if ("naturalWidth" in source) {
		return { width: source.naturalWidth, height: source.naturalHeight };
	}
	if ("displayWidth" in source) {
		return { width: source.displayWidth, height: source.displayHeight };
	}
	return { width: source.width, height: source.height };
}

const warned = new Set<string>();

export function warnOnce(key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	console.warn(`fragment-gl: ${message}`);
}
