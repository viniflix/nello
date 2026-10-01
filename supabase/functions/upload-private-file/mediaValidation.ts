import mediaInfoFactory from 'mediainfo.js';
import { validateMediaEnvelope } from './mediaEnvelope.ts';

const formats: Record<string, string[]> = {
  'audio/mpeg': ['MPEG Audio'], 'audio/wav': ['Wave'], 'audio/ogg': ['Ogg'],
  'audio/webm': ['WebM'], 'video/webm': ['WebM'],
  'audio/mp4': ['MPEG-4'], 'video/mp4': ['MPEG-4'], 'video/quicktime': ['MPEG-4'],
};
const invalid = () => { throw new Error('uploaded_media_content_invalid'); };
export async function validateMedia(bytes: Uint8Array, mime: string, wasmPath?: string) {
  validateMediaEnvelope(bytes, mime);
  // One parser per request: no cross-request mutable decoder state.
  const parser = await mediaInfoFactory({ format: 'object', full: true, coverData: false, chunkSize: 64 * 1024,
    ...(wasmPath ? { locateFile: () => wasmPath } : {}),
  });
  try {
    let chunks = 0; let total = 0;
    const result = await parser.analyzeData(bytes.length, (size, offset) => {
      if (++chunks > 1024 || offset < 0 || size < 1 || offset > bytes.length || (total += size) > 64 * 1024 * 1024) return invalid();
      return bytes.subarray(offset, Math.min(bytes.length, offset + size));
    });
    const tracks = result?.media?.track || [];
    const general = tracks.find(track => track['@type'] === 'General');
    const audio = tracks.filter(track => track['@type'] === 'Audio');
    const video = tracks.filter(track => track['@type'] === 'Video');
    if (!general || !formats[mime]?.includes(String(general.Format)) || Number(general.FileSize) !== bytes.length
      || general.IsTruncated === 'Yes' || tracks.length > 4
      || tracks.some(track => !['General', 'Video', 'Audio'].includes(track['@type']))
      || (!audio.length && !video.length) || (mime.startsWith('audio/') && video.length)
      || (mime.startsWith('video/') && video.length !== 1) || audio.length > 2) invalid();
    for (const track of [...audio, ...video]) {
      if (!Number.isFinite(Number(track.Duration)) || Number(track.Duration) <= 0 || Number(track.Duration) > 7200 || track.IsTruncated === 'Yes') invalid();
      if (track['@type'] === 'Audio') {
        if (!['MPEG Audio', 'AAC', 'PCM', 'ADPCM', 'Opus', 'Vorbis'].includes(String(track.Format))
          || Number(track.Channels) < 1 || Number(track.Channels) > 8
          || Number(track.SamplingRate) < 8000 || Number(track.SamplingRate) > 192000) invalid();
      } else if (!['AVC', 'HEVC', 'VP8', 'VP9', 'AV1', 'MPEG-4 Visual'].includes(String(track.Format))
        || Number(track.Width) < 1 || Number(track.Height) < 1 || Number(track.Width) > 4096 || Number(track.Height) > 4096
        || Number(track.Width) * Number(track.Height) > 16_777_216) invalid();
    }
    return bytes;
  } finally { parser.close(); }
}
