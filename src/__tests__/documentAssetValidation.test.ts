import { describe, expect, it } from 'vitest';
import { detectImageMime, verifyDocumentAssetBytes } from '../../supabase/functions/confirm-document-asset/assetValidation';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);

describe('trusted document asset verification', () => {
  it('hashes the downloaded bytes rather than accepting a browser digest', async () => {
    const result = await verifyDocumentAssetBytes(png, 'image/png', png.length);
    const digest = await crypto.subtle.digest('SHA-256', png);
    const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(result).toEqual({ sha256: expected, sizeBytes: png.length, mimeType: 'image/png' });
  });

  it('rejects a claimed PNG when the stored bytes are another format', async () => {
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    expect(detectImageMime(html)).toBeNull();
    await expect(verifyDocumentAssetBytes(html, 'image/png', html.length)).rejects.toThrow('document_asset_type_mismatch');
  });

  it('rejects size mismatch, empty files and oversized files', async () => {
    await expect(verifyDocumentAssetBytes(png, 'image/png', png.length + 1)).rejects.toThrow('document_asset_size_mismatch');
    await expect(verifyDocumentAssetBytes(new Uint8Array(), 'image/png', 0)).rejects.toThrow('document_asset_size_mismatch');
    await expect(verifyDocumentAssetBytes(new Uint8Array(5 * 1024 * 1024 + 1), 'image/png', 5 * 1024 * 1024 + 1)).rejects.toThrow('document_asset_size_mismatch');
  });

  it('recognizes JPEG and WebP signatures and rejects a damaged WebP length', () => {
    expect(detectImageMime(Uint8Array.from([255, 216, 255, 0, 255, 217]))).toBe('image/jpeg');
    const webp = new Uint8Array(16);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp[4] = 8;
    webp.set(new TextEncoder().encode('WEBP'), 8);
    expect(detectImageMime(webp)).toBe('image/webp');
    webp[4] = 9;
    expect(detectImageMime(webp)).toBeNull();
  });
});
