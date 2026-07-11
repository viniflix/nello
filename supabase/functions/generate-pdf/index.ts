import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = await req.json();
    const title = sanitize(body?.title || "Documento");
    const inputLines = Array.isArray(body?.lines) ? body.lines : [];
    const lines = inputLines.map(sanitize).filter(Boolean).slice(0, 1200);
    const fileName = sanitize(body?.fileName || `documento-${Date.now()}.pdf`);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4 in points
    const { width, height } = page.getSize();
    const margin = 48;
    let y = height - margin;

    const newPage = () => {
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});

