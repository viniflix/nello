// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateMedia } from '../../supabase/functions/upload-private-file/mediaValidation';
import { validateMediaEnvelope } from '../../supabase/functions/upload-private-file/mediaEnvelope';
function wave() {
  const bytes = new Uint8Array(44 + 16000); const view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) bytes.set(new TextEncoder().encode(text), offset);
  view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, 16000, true);
  return bytes;
}
describe('real media parsing', () => {
  it.each([
    ['audio/mpeg', 'synthetic-audio.mp3'], ['audio/ogg', 'synthetic-audio.ogg'],
    ['audio/mp4', 'synthetic-audio.m4a'], ['audio/webm', 'synthetic-audio.webm'],
    ['audio/webm', 'synthetic-recorder-audio.webm'],
    ['video/mp4', 'synthetic-video.mp4'], ['video/quicktime', 'synthetic-video.mov'],
    ['video/webm', 'synthetic-video.webm'],
  ])('parses a complete synthetic %s stream', async (mime, name) => {
    const bytes = new Uint8Array(readFileSync(`src/__tests__/fixtures/storage/${name}`));
    expect(await validateMedia(bytes, mime)).toEqual(bytes);
    const truncated = bytes.subarray(0, bytes.length - 13);
    await expect(validateMedia(truncated, mime)).rejects.toThrow();
  });
  it('accepts a complete synthetic PCM WAV with an actual audio stream', async () => {
    const bytes = wave(); expect(await validateMedia(bytes, 'audio/wav')).toEqual(bytes);
  });
  it('refuses WAV falsely labelled as video', async () => {
    await expect(validateMedia(wave(), 'video/mp4')).rejects.toThrow();
  });
  it('rejects truncation and an appended executable payload', async () => {
    const bytes = wave();
    await expect(validateMedia(bytes.subarray(0, bytes.length - 1), 'audio/wav')).rejects.toThrow();
    const polyglot = new Uint8Array(bytes.length + 12); polyglot.set(bytes); polyglot.set(new TextEncoder().encode('<script/>'), bytes.length);
    await expect(validateMedia(polyglot, 'audio/wav')).rejects.toThrow();
  });
  it.each(['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'video/mp4', 'video/webm', 'video/quicktime'])('rejects a signature without stream framing: %s', mime => {
    expect(() => validateMediaEnvelope(new TextEncoder().encode('ftypOggSRIFFWAVEID3fake'), mime)).toThrow();
  });
});
