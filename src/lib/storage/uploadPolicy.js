const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'mp4',
  'video/webm': 'webm', 'video/quicktime': 'mov' };
export function fileExtensionForMime(mime) {
  const extension = MIME_EXTENSIONS[mime];
  if (!extension) throw new Error('invalid_upload_selection');
  return extension;
}
export const CHAT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_POLICIES = Object.freeze({
  avatars: { maxBytes: 5 * 1024 * 1024, mimeTypes: IMAGE_TYPES },
  'financial-docs': { maxBytes: 10 * 1024 * 1024, mimeTypes: [...IMAGE_TYPES, 'application/pdf'] },
  chat_media: { maxBytes: CHAT_UPLOAD_MAX_BYTES, mimeTypes: [...IMAGE_TYPES, 'application/pdf',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
    'video/mp4', 'video/webm', 'video/quicktime'] },
});

// UX preflight only. The server must independently inspect the actual bytes.
export function validateUploadSelection(bucket, file) {
  const policy = UPLOAD_POLICIES[bucket];
  if (!policy || !file || !Number.isSafeInteger(file.size) || file.size < 1
      || file.size > policy.maxBytes || !policy.mimeTypes.includes(file.type)) {
    throw new Error('invalid_upload_selection');
  }
}
