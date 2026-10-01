import { sanitizeCspReport } from '../operations/security/csp-report.mjs';

let nextLog = 0;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).end();
  }
  if (!/^application\/(csp-report|reports\+json|json)(?:\s*;|$)/i.test(request.headers['content-type'] || '')) return response.status(415).end();
  if (Number(request.headers['content-length']) > 4096) return response.status(413).end();
  let body;
  try {
    if (request.body !== undefined) {
      if (Buffer.byteLength(typeof request.body === 'string' ? request.body : JSON.stringify(request.body)) > 4096) return response.status(413).end();
      body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } else {
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += Buffer.byteLength(chunk);
        if (length > 4096) return response.status(413).end();
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch { return response.status(400).end(); }
  const reports = sanitizeCspReport(body);
  // Bound amplification per warm instance. This is log suppression, not a
  // distributed security quota; all reports remain explicitly untrusted.
  if (reports.length && Date.now() >= nextLog) {
    nextLog = Date.now() + 10000;
    console.warn(JSON.stringify({ event: 'csp_violation_untrusted', reports }));
  }
  return response.status(204).end();
}
