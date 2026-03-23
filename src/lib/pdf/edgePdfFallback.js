import { supabase } from '@/lib/customSupabaseClient';

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fallback server-side PDF generation via Supabase Edge Function.
 * Use this when client-side generators fail due CSP/runtime quirks.
 */
export async function generatePdfViaEdge({ title, fileName, lines = [] }) {
  const payload = {
    title: title || 'Documento',
    fileName: fileName || `documento-${Date.now()}.pdf`,
    lines: Array.isArray(lines) ? lines.slice(0, 1200) : [],
  };

  const { data, error } = await supabase.functions.invoke('generate-pdf', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Falha ao gerar PDF no servidor');
  }

  if (!data?.base64Pdf || !data?.fileName) {
    throw new Error('Resposta inválida da função de PDF');
  }

  const blob = base64ToBlob(data.base64Pdf);
  triggerDownload(blob, data.fileName);
}

