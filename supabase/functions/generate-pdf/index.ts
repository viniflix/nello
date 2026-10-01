import { edgeBoundary, RequestError } from '../_shared/http.ts';
import { activeActor } from '../_shared/actor.ts';
import { consumeQuota } from '../_shared/quota.ts';
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {};

const sanitize = (value: unknown) =>
  String(value ?? "").replace(/[^\S\r\n]+/g, " ").trim();

const wrapText = (text: string, maxChars = 90) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

serve(edgeBoundary(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const actor = await activeActor(req, ['nutritionist', 'patient', 'admin']);
  await consumeQuota(actor.id, 'pdf');
  try {
    const body = await req.json();
    if (!body || !Array.isArray(body.lines) || body.lines.length > 1200
      || body.lines.some((line: unknown) => typeof line !== 'string' || line.length > 1000)
      || (body.title != null && (typeof body.title !== 'string' || body.title.length > 160))
      || (body.fileName != null && (typeof body.fileName !== 'string' || body.fileName.length > 160))) {
      return new Response(JSON.stringify({ error: 'invalid_pdf_request' }), { status: 400 });
    }
    const title = sanitize(body?.title || "Documento");
    const inputLines = Array.isArray(body?.lines) ? body.lines : [];
    const lines = inputLines.map(sanitize).filter(Boolean).slice(0, 1200);
    const fileName = sanitize(body?.fileName || `documento-${Date.now()}.pdf`);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595.28, 841.89]);
    const { height } = page.getSize();
    const margin = 48;
    let y = height - margin;

    const newPage = () => {
      if (pdfDoc.getPageCount() >= 50) throw new RequestError(413, 'pdf_too_large');
      page = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin;
    };

    page.drawText(title, {
      x: margin,
      y,
      size: 18,
      font: boldFont,
      color: rgb(0.2, 0.35, 0.2),
    });
    y -= 26;

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    page.drawText(`Gerado em: ${now}`, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    y -= 20;

    for (const rawLine of lines) {
      const wrapped = wrapText(rawLine, 95);
      for (const line of wrapped) {
        if (y < margin + 20) newPage();
        page.drawText(line, {
          x: margin,
          y,
          size: 11,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 14;
      }
      y -= 2;
    }

    const bytes = await pdfDoc.save();
    // New clients request bytes; old open sessions retain the bounded JSON contract.
    if (body.format === 'binary') {
      return new Response(bytes, { status: 200, headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      } });
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    const base64Pdf = btoa(binary);

    return new Response(JSON.stringify({ fileName, base64Pdf }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    if (error instanceof RequestError) throw error;
    return new Response(
      JSON.stringify({ error: error instanceof SyntaxError ? 'invalid_request' : 'pdf_generation_failed' }),
      {
        status: error instanceof SyntaxError ? 400 : 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}));
