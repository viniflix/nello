import { renderSavedClinicalPdf, downloadSavedClinicalPdf } from '@/lib/pdf/savedClinicalPdf';

// The server fetches the immutable record with the caller JWT, never a client payload.
export async function renderCanonicalDocumentPdf(artifact) {
  if (!artifact?.canonical_payload || !artifact?.sha256) throw new Error('canonical_document_required');
  return renderSavedClinicalPdf('documentArtifactId',artifact.id);
}
export async function downloadCanonicalDocumentPdf(artifact) {
  if (!artifact?.canonical_payload || !artifact?.sha256) throw new Error('canonical_document_required');
  return downloadSavedClinicalPdf('documentArtifactId',artifact.id);
}
