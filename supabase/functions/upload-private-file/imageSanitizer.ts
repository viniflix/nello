// Node tests use the exact same decoder with the pinned package. Production
// supplies the module's WASM bytes using Deno.readFile inside the Edge handler.
import { ImageMagick, MagickFormat, ResourceLimits, initializeImageMagick } from '@imagemagick/magick-wasm';
import { inspectImageEnvelope, MAX_IMAGE_PIXELS } from './imageEnvelope.ts';

let initialized: Promise<void> | undefined;
export function initializeImageSanitizer(wasm: Uint8Array) {
  initialized ??= initializeImageMagick(wasm).then(() => {
    ResourceLimits.disk = 0n;
    ResourceLimits.memory = 128n * 1024n * 1024n;
    ResourceLimits.maxMemoryRequest = 128n * 1024n * 1024n;
    ResourceLimits.width = 8192n; ResourceLimits.height = 8192n;
    ResourceLimits.area = BigInt(MAX_IMAGE_PIXELS);
    // Decoder/encoder operations use temporary image instances even for a
    // single frame. The API reads and writes one image, never a collection.
    ResourceLimits.listLength = 8n;
    ResourceLimits.maxProfileSize = 1024n * 1024n;
  });
  return initialized;
}

export async function sanitizeImage(bytes: Uint8Array, mime: string, maxBytes: number, avatar = false) {
  if (!initialized) throw new Error('image_decoder_not_initialized');
  if (!bytes.length || bytes.length > maxBytes) throw new Error('upload_size_exceeded');
  const envelope = inspectImageEnvelope(bytes, mime);
  await initialized;
  const format = mime === 'image/png' ? MagickFormat.Png : mime === 'image/jpeg' ? MagickFormat.Jpeg : MagickFormat.WebP;
  const output = ImageMagick.read(bytes, image => {
    if (image.format !== format || image.width !== envelope.width || image.height !== envelope.height) throw new Error('invalid_image');
    image.autoOrient();
    image.strip();
    if (avatar && (image.width > 1024 || image.height > 1024)) image.resize(1024, 1024);
    return image.write(format, data => new Uint8Array(data));
  });
  if (!output.length || output.length > maxBytes) throw new Error('processed_image_size_exceeded');
  inspectImageEnvelope(output, mime);
  return output;
}
