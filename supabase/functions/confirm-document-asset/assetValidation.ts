const IMAGE_SIGNATURES: Array<{ mime: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    mime: 'image/png',
    matches: (bytes) => bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value),
  },
  {
    mime: 'image/jpeg',
    matches: (bytes) => bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9,
  },
  {
    mime: 'image/webp',
    matches: (bytes) => bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
      && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 === bytes.length,
  },
];

export function detectImageMime(bytes: Uint8Array): string | null {
  return IMAGE_SIGNATURES.find(({ matches }) => matches(bytes))?.mime ?? null;
}

export async function verifyDocumentAssetBytes(
  bytes: Uint8Array,
  expectedMime: string,
  expectedSize: number,
): Promise<{ sha256: string; sizeBytes: number; mimeType: string }> {
  if (bytes.length < 1 || bytes.length > 5 * 1024 * 1024 || bytes.length !== expectedSize) {
    throw new Error('document_asset_size_mismatch');
  }
  const mimeType = detectImageMime(bytes);
  if (!mimeType || mimeType !== expectedMime) {
    throw new Error('document_asset_type_mismatch');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { sha256, sizeBytes: bytes.length, mimeType };
}
