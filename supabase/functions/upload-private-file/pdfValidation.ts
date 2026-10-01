import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRef, PDFStream } from 'pdf-lib';

const PROHIBITED = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'EmbeddedFiles',
  'Filespec', 'EF', 'XFA', 'RichMedia', 'Movie', 'Sound', 'SubmitForm', 'ImportData',
  'GoToR', 'GoToE', 'OpenAction', 'AA']);

export async function validatePdf(bytes: Uint8Array, maxBytes: number) {
  if (!bytes.length || bytes.length > maxBytes) throw new Error('upload_size_exceeded');
  const first = new TextDecoder().decode(bytes.subarray(0, 8));
  const end = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
  if (!/^%PDF-1\.[0-7]/.test(first) || !/%%EOF\s*$/.test(end)) throw new Error('invalid_pdf');
  const document = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  if (document.isEncrypted || document.getPageCount() < 1 || document.getPageCount() > 250) throw new Error('unsupported_pdf');
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > 10_000) throw new Error('pdf_complexity_exceeded');
  const visited = new Set<unknown>();
  let count = 0;
  const walk = (object: unknown, depth = 0) => {
    if (depth > 64 || ++count > 100_000) throw new Error('pdf_complexity_exceeded');
    if (!object || visited.has(object)) return;
    visited.add(object);
    if (object instanceof PDFName) {
      if (PROHIBITED.has(object.decodeText())) throw new Error('pdf_active_content_forbidden');
    } else if (object instanceof PDFRef) walk(document.context.lookup(object), depth + 1);
    else if (object instanceof PDFStream) walk(object.dict, depth + 1);
    else if (object instanceof PDFArray) {
      for (const item of object.asArray()) walk(item, depth + 1);
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) { walk(key, depth + 1); walk(value, depth + 1); }
    }
  };
  for (const [, object] of objects) walk(object);
  // Preserve the signed/original PDF bytes. Validation never silently rewrites
  // a clinical report or invalidates an existing digital signature.
  return bytes;
}
