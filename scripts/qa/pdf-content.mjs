import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
/** Decode actual server PDF content streams; compressed bytes are not searchable text. */
export async function inspectPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const text = pdf.context.enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFRawStream)
    .flatMap(([, stream]) => {
      const decoded = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      return [...decoded.matchAll(/<([0-9a-f]+)>\s*Tj/gi)]
        .map(match => new TextDecoder('windows-1252').decode(Buffer.from(match[1], 'hex')));
    }).join('\n');
  return { pages: pdf.getPageCount(), text };
}
