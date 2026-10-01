// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ImageMagick, MagickFormat, MagickColors } from '@imagemagick/magick-wasm';
import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib';
import { inspectImageEnvelope } from '../../supabase/functions/upload-private-file/imageEnvelope';
import { initializeImageSanitizer, sanitizeImage } from '../../supabase/functions/upload-private-file/imageSanitizer';
import { validatePdf } from '../../supabase/functions/upload-private-file/pdfValidation';

const limit = 5 * 1024 * 1024;
beforeAll(async () => {
  await initializeImageSanitizer(new Uint8Array(readFileSync('node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm')));
}, 30000);
const image = (format: MagickFormat, width = 20, height = 10) => ImageMagick.read(MagickColors.Red, width, height, data => {
  data.comment = 'SYNTHETIC_PRIVATE_METADATA';
  return data.write(format, output => new Uint8Array(output));
});

describe('server image decode and reencode', () => {
  it.each([['image/png', MagickFormat.Png], ['image/jpeg', MagickFormat.Jpeg], ['image/webp', MagickFormat.WebP]])
    ('fully decodes %s and removes the original metadata', async (mime, format) => {
      const input = image(format);
      const output = await sanitizeImage(input, mime, limit);
      expect(inspectImageEnvelope(output, mime)).toEqual({ width: 20, height: 10 });
      ImageMagick.read(output, decoded => {
        expect(decoded.comment).toBeNull();
        expect(decoded.getProfile('exif')).toBeNull();
        expect(decoded.width).toBe(20);
        expect(decoded.height).toBe(10);
      });
    });
  it('rejects a signature-only PNG that the old check accepted', async () => {
    await expect(sanitizeImage(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]), 'image/png', limit)).rejects.toThrow();
  });
  it('rejects fake MIME before image decoding', async () => {
    await expect(sanitizeImage(image(MagickFormat.Png), 'image/jpeg', limit)).rejects.toThrow('invalid_image');
  });
  it('rejects excessive dimensions before allocating pixels', () => {
    const input = image(MagickFormat.Png);
    new DataView(input.buffer).setUint32(16, 100000);
    expect(() => inspectImageEnvelope(input, 'image/png')).toThrow('image_dimensions_exceeded');
  });
  it('rejects truncated pixel data even when the header has plausible dimensions', async () => {
    const input = image(MagickFormat.Png).subarray(0, 40);
    expect(inspectImageEnvelope(input, 'image/png')).toEqual({ width: 20, height: 10 });
    await expect(sanitizeImage(input, 'image/png', limit)).rejects.toThrow();
  });
  it('discards extra polyglot bytes instead of persisting the original payload', async () => {
    const original = image(MagickFormat.Jpeg);
    const script = new TextEncoder().encode('<script>SYNTHETIC_PAYLOAD</script>');
    const input = new Uint8Array(original.length + script.length); input.set(original); input.set(script, original.length);
    const output = await sanitizeImage(input, 'image/jpeg', limit);
    expect(new TextDecoder().decode(output)).not.toContain('SYNTHETIC_PAYLOAD');
    expect(output.at(-2)).toBe(255); expect(output.at(-1)).toBe(217);
  });
  it('bounds avatar dimensions while preserving the aspect ratio', async () => {
    const input = image(MagickFormat.Jpeg, 1400, 700);
    const output = await sanitizeImage(input, 'image/jpeg', limit, true);
    expect(inspectImageEnvelope(output, 'image/jpeg')).toEqual({ width: 1024, height: 512 });
  });
});

describe('server PDF object graph validation', () => {
  it('preserves the bytes of a valid report instead of rewriting it', async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    const input = await doc.save();
    expect(await validatePdf(input, limit)).toBe(input);
  });
  it.each(['JavaScript', 'Launch', 'EmbeddedFiles', 'XFA', 'OpenAction'])('rejects %s even in compressed PDF objects', async key => {
    const doc = await PDFDocument.create(); doc.addPage();
    const object = doc.context.obj({ [key]: PDFHexString.fromText('SYNTHETIC_ACTIVE_CONTENT') });
    doc.context.register(object);
    const input = await doc.save({ useObjectStreams: true });
    await expect(validatePdf(input, limit)).rejects.toThrow('pdf_active_content_forbidden');
  });
  it('rejects action type names as well as dictionary keys', async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    doc.context.register(doc.context.obj({ S: PDFName.of('JavaScript') }));
    await expect(validatePdf(await doc.save(), limit)).rejects.toThrow('pdf_active_content_forbidden');
  });
  it('rejects HTML disguised as a PDF and appended executable content', async () => {
    await expect(validatePdf(new TextEncoder().encode('<html>not a report</html>'), limit)).rejects.toThrow('invalid_pdf');
    const doc = await PDFDocument.create(); doc.addPage();
    const original = await doc.save();
    const appendix = new TextEncoder().encode('<script>SYNTHETIC_PAYLOAD</script>');
    const input = new Uint8Array(original.length + appendix.length); input.set(original); input.set(appendix, original.length);
    await expect(validatePdf(input, limit)).rejects.toThrow('invalid_pdf');
  });
});
