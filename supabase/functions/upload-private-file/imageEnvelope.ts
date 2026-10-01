export const MAX_IMAGE_PIXELS = 16_777_216;
export const MAX_IMAGE_DIMENSION = 8192;
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

// Parse dimensions before allocating the decoder's pixel buffers. This is a
// preflight, not a substitute for the subsequent full decode and reencode.
export function inspectImageEnvelope(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  if (mime === 'image/png') {
    if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
        || view.getUint32(8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') throw new Error('invalid_image');
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mime === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('invalid_image');
    let offset = 2;
    let segments = 0;
    while (offset < bytes.length && ++segments <= 1024) {
      if (bytes[offset++] !== 255) throw new Error('invalid_image');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw new Error('invalid_image');
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('invalid_image');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8 || bytes[offset + 2] !== 8) throw new Error('invalid_image');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (mime === 'image/webp') {
    if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP'
        || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('invalid_image');
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') {
      if (bytes[20] & 2) throw new Error('animated_image_not_supported');
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
    }
  } else throw new Error('unsupported_image_type');
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
      || width * height > MAX_IMAGE_PIXELS) throw new Error('image_dimensions_exceeded');
  return { width, height };
}
