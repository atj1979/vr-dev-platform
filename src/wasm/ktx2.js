function wasmUrl() {
  const base = import.meta.env?.BASE_URL || '/';
  return `${base}wasm/basis_encoder.wasm`;
}

/**
 * Encode an image to KTX2. Pass PNG bytes in the browser, or raw RGBA plus
 * width and height (the test path and any caller that already has pixels).
 * The Basis encoder is fetched only when this function runs.
 */
export async function encodeImageToKtx2(bytes, options = {}) {
  const { encodeToKTX2 } = await import('ktx2-encoder');
  const encodeOptions = {
    isUASTC: false,
    isKTX2File: true,
    generateMipmap: true,
    needSupercompression: false,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
    qualityLevel: 90,
    compressionLevel: 1,
    ...options,
  };
  if (typeof window !== 'undefined' && !encodeOptions.wasmUrl) encodeOptions.wasmUrl = wasmUrl();
  if (options.width && options.height && !encodeOptions.imageDecoder) {
    const { width, height } = options;
    encodeOptions.imageDecoder = async () => ({
      width,
      height,
      data: bytes,
    });
  }
  return encodeToKTX2(bytes, encodeOptions);
}
