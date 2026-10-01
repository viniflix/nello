import { RequestError } from '../_shared/http.ts';
import { sanitizeImage } from './imageSanitizer.ts';
import { validatePdf } from './pdfValidation.ts';
import { validateMedia } from './mediaValidation.ts';

export type Reservation = { id: string; bucket: string; path: string; status: string; size: number; mime: string; sha256?: string };
export type UploadContext = { reservation: Reservation; admin: any; initializeImages: () => Promise<void>; mediaWasmPath?: string };
const maximum = (bucket: string) => bucket === 'chat_media' ? 20 * 1024 * 1024 : bucket === 'clinical-attachments' ? 15 * 1024 * 1024 : ['avatars', 'patient-photos', 'document-assets'].includes(bucket) ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

export async function processPrivateUpload(req: Request, { reservation, admin, initializeImages, mediaWasmPath }: UploadContext) {
  if (reservation.status === 'confirmed') return Response.json(reservation);
  let stored = false;
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length || bytes.length !== Number(reservation.size) || bytes.length > maximum(reservation.bucket)) throw new RequestError(422, 'upload_size_mismatch');
    let verified: Uint8Array;
    if (['image/jpeg', 'image/png', 'image/webp'].includes(reservation.mime)) {
      await initializeImages();
      verified = await sanitizeImage(bytes, reservation.mime, maximum(reservation.bucket), reservation.bucket === 'avatars');
    } else if (reservation.mime === 'application/pdf') verified = await validatePdf(bytes, maximum(reservation.bucket));
    else verified = await validateMedia(bytes, reservation.mime, mediaWasmPath);
    const sourceHash = await sha256(bytes);
    const hash = await sha256(verified);
    const { error: uploadError } = await admin.storage.from(reservation.bucket).upload(reservation.path, verified, {
      contentType: reservation.mime, upsert: false, cacheControl: '60',
    });
    if (uploadError) throw new RequestError(503, 'storage_upload_failed');
    stored = true;
    const { data, error } = await admin.rpc('finish_storage_upload', {
      p_reservation_id: reservation.id, p_sha256: hash, p_source_sha256: sourceHash, p_size: verified.length,
    });
    if (error || data?.status !== 'confirmed') throw new RequestError(503, 'upload_confirmation_failed');
    return Response.json(data);
  } catch (error) {
    // Only the object written by this request is eligible for compensating delete.
    // Never delete a pre-existing object after an overwrite conflict.
    // A timed-out confirmation may have committed. Claim failure in SQL first;
    // confirmed/bound objects must never be compensating-delete candidates.
    const { data: failureClaim, error: claimError } = await admin.rpc('fail_storage_upload', {
      p_reservation_id: reservation.id, p_failure_code: stored ? 'cleanup_required' : 'validation_or_upload_failed',
    });
    if (stored && !claimError && failureClaim === true) {
      const { error: deletionError } = await admin.storage.from(reservation.bucket).remove([reservation.path]);
      if (!deletionError) await admin.rpc('fail_storage_upload', {
        p_reservation_id: reservation.id, p_failure_code: 'validation_or_upload_failed',
      });
    }
    if (error instanceof RequestError) throw error;
    throw new RequestError(422, 'uploaded_content_invalid');
  }
}
