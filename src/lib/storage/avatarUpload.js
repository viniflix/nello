import { uploadVerifiedFile } from './verifiedUpload';
import { privateFileReference } from './privateFiles';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export async function uploadAvatarFile(ownerId, file) {
  const extension = EXTENSIONS[file?.type];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId || '') || !extension || !file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('Envie uma imagem JPG, PNG ou WebP de até 5 MB.');
  }
  const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  await uploadVerifiedFile('avatars', path, file);
  return privateFileReference('avatars', path);
}
