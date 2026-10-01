// Strict framing complements the maintained media parser. It rejects appended
// payloads/truncation rather than trusting a filename or container signature.
const fail = () => { throw new Error('invalid_media_container'); };
const text = (b: Uint8Array, p: number, n: number) => String.fromCharCode(...b.subarray(p, p + n));
export function validateMediaEnvelope(b: Uint8Array, mime: string) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 12 || b.length > 20 * 1024 * 1024) fail();
  if (mime === 'audio/wav') {
    if (text(b, 0, 4) !== 'RIFF' || text(b, 8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== b.length) fail();
    let p = 12; let format = false; let data = false;
    while (p < b.length) {
      if (p + 8 > b.length) fail();
      const tag = text(b, p, 4); const size = view.getUint32(p + 4, true);
      if (p + 8 + size > b.length || !['fmt ', 'data', 'fact', 'LIST', 'JUNK', 'bext', 'iXML'].includes(tag)) fail();
      if (tag === 'fmt ') { if (size < 16) fail(); format = true; }
      if (tag === 'data') { if (!size) fail(); data = true; }
      p += 8 + size + (size % 2);
    }
    if (p !== b.length || !format || !data) fail();
  } else if (['audio/mp4', 'video/mp4', 'video/quicktime'].includes(mime)) {
    let p = 0; let frames = 0; const tags: string[] = [];
    while (p < b.length) {
      if (p + 8 > b.length || ++frames > 10_000) fail();
      let size = view.getUint32(p); const tag = text(b, p + 4, 4); let header = 8;
      if (size === 1) { if (p + 16 > b.length) fail(); size = Number(view.getBigUint64(p + 8)); header = 16; }
      if (size === 0) size = b.length - p;
      if (!Number.isSafeInteger(size) || size < header || p + size > b.length
        || !['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'moof', 'mfra', 'sidx', 'styp', 'pdin'].includes(tag)) fail();
      tags.push(tag); p += size;
    }
    if (tags[0] !== 'ftyp' || !tags.includes('moov') || !tags.includes('mdat')) fail();
  } else if (mime === 'audio/ogg') {
    let p = 0; let pages = 0;
    while (p < b.length) {
      if (++pages > 100_000 || p + 27 > b.length || text(b, p, 4) !== 'OggS' || b[p + 4] !== 0) fail();
      const segments = b[p + 26]; let size = 0;
      if (p + 27 + segments > b.length) fail();
      for (let i = 0; i < segments; i++) size += b[p + 27 + i];
      p += 27 + segments + size; if (p > b.length) fail();
    }
  } else if (mime === 'audio/mpeg') {
    let p = 0; let frames = 0;
    if (text(b, 0, 3) === 'ID3') {
      if (b[3] < 2 || b[3] > 4 || b.subarray(6, 10).some(v => v >= 128)) fail();
      p = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + ((b[5] & 16) ? 10 : 0);
    }
    const rates1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const rates2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    while (p < b.length) {
      if (b.length - p === 128 && text(b, p, 3) === 'TAG') { p += 128; break; }
      if (p + 4 > b.length || b[p] !== 255 || (b[p + 1] & 224) !== 224) fail();
      const version = (b[p + 1] >> 3) & 3; const layer = (b[p + 1] >> 1) & 3;
      const rateIndex = b[p + 2] >> 4; const sampleIndex = (b[p + 2] >> 2) & 3;
      if (version === 1 || layer !== 1 || !rateIndex || rateIndex === 15 || sampleIndex === 3) fail();
      const sample = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
      const rate = (version === 3 ? rates1 : rates2)[rateIndex] * 1000;
      p += Math.floor((version === 3 ? 144 : 72) * rate / sample) + ((b[p + 2] >> 1) & 1);
      if (p > b.length || ++frames > 200_000) fail();
    }
    if (frames < 2 || p !== b.length) fail();
  } else if (mime === 'audio/webm' || mime === 'video/webm') {
    // EBML top-level header + one Segment. Browser MediaRecorder emits an
    // unknown-size Segment, which is bounded by the HTTP body, not a seek.
    const vint = (p: number, id = false): { value: number; length: number; unknown: boolean } => {
      if (p >= b.length || b[p] === 0) return fail();
      let length = 1; let mask = 128;
      while (!(b[p] & mask)) { mask >>= 1; length++; }
      if (length > (id ? 4 : 8) || p + length > b.length) return fail();
      let value = id ? b[p] : b[p] & (mask - 1); let unknown = !id && value === mask - 1;
      for (let i = 1; i < length; i++) { value = value * 256 + b[p + i]; unknown = unknown && b[p + i] === 255; }
      if (!unknown && !Number.isSafeInteger(value)) fail();
      return { value, length, unknown };
    };
    const header = vint(0, true); const headerSize = vint(header.length);
    if (header.value !== 0x1a45dfa3 || headerSize.unknown) fail();
    let p = header.length + headerSize.length + headerSize.value;
    const segment = vint(p, true); p += segment.length; const size = vint(p); p += size.length;
    if (segment.value !== 0x18538067 || (!size.unknown && p + size.value !== b.length)) fail();
    let elements = 0; let tracks = false; let clusters = false;
    while (p < b.length) {
      if (++elements > 100_000) fail();
      const id = vint(p, true); p += id.length; const length = vint(p); p += length.length;
      if (![0x114d9b74, 0x1549a966, 0x1654ae6b, 0x1f43b675, 0x1c53bb6b, 0x1254c367, 0xec, 0xbf].includes(id.value)) fail();
      tracks ||= id.value === 0x1654ae6b; clusters ||= id.value === 0x1f43b675;
      if (id.value === 0x1f43b675) {
        const end = length.unknown ? b.length : p + length.value;
        if (end > b.length) fail();
        while (p < end) {
          const child = vint(p, true);
          if (length.unknown && [0x1f43b675, 0x1c53bb6b, 0x1254c367].includes(child.value)) break;
          p += child.length; const childSize = vint(p); p += childSize.length;
          if (childSize.unknown || ![0xe7, 0xa3, 0xa0, 0xa7, 0xab, 0x5854, 0xaf, 0xec, 0xbf].includes(child.value)
            || p + childSize.value > end || ++elements > 100_000) fail();
          if (child.value === 0xa3 && childSize.value < 4) fail();
          p += childSize.value;
        }
      } else {
        if (length.unknown) fail();
        p += length.value; if (p > b.length) fail();
      }
    }
    if (!tracks || !clusters) fail();
  } else fail();
}
