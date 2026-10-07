import { boundedJson, normalizeReceived, mailboxAddress, MAILBOX, UUID } from './contracts.js';

// Inject transports for adversarial tests; production never accepts a provider URL.
export function supportGateway({ apiKey, fetcher, rpc, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  async function provider(path, options = {}) {
    if (!apiKey) throw Error('resend_not_configured');
    const response = await fetcher(`https://api.resend.com${path}`, { ...options, redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) { const failure = Error('resend_unavailable'); failure.status = response.status; throw failure; }
    return boundedJson(response);
  }
  async function receive(id) {
    if (!UUID.test(id)) throw Error('invalid_received_id');
    const message = normalizeReceived(await provider(`/emails/receiving/${id}`));
    if (!message) return { ignored: true };
    return rpc('support_receive', message, true);
  }
  async function sync(cursor = null) {
    const query = new URLSearchParams({ limit: '3' }); if (cursor) query.set('after', cursor);
    const list = await provider(`/emails/receiving?${query}`);
    if (!Array.isArray(list.data) || list.data.length > 3 || typeof list.has_more !== 'boolean') throw Error('invalid_receiving_page');
    let imported = 0;
    for (const message of list.data) {
      if (!UUID.test(message.id) || !Array.isArray(message.to)) throw Error('invalid_receiving_summary');
      // Do not retrieve private bodies addressed to another mailbox.
      if (!message.to.some(value => mailboxAddress(value) === MAILBOX)) continue;
      await pause(550); const result = await receive(message.id); if (!result.ignored && !result.replayed) imported++;
    }
    const next = list.has_more ? list.data.at(-1)?.id : null;
    if (list.has_more && !UUID.test(next || '')) throw Error('invalid_receiving_cursor');
    return { imported, has_more: list.has_more, cursor: next, checked_at: new Date().toISOString() };
  }
  async function send(messageId) {
    // Check configuration BEFORE obtaining a lease; an absent key leaves intent queued.
    if (!apiKey) throw Error('resend_not_configured');
    const claim = await rpc('admin_support_claim', { p_message: messageId }, false);
    let state = 'unknown'; let providerId = null;
    try {
      const result = await provider('/emails', { method: 'POST', headers: { 'Idempotency-Key': claim.idempotency_key }, body: JSON.stringify({ from: `Nello Suporte <${MAILBOX}>`, to: [claim.to], subject: `Re: ${claim.subject}`, text: claim.body, reply_to: MAILBOX }) });
      if (!UUID.test(result.id || '')) throw Error('invalid_send_receipt');
      state = 'sent'; providerId = result.id;
    } catch (error) {
      // A transport failure or ambiguous provider response may have accepted mail.
      if ([400, 401, 403, 422, 429].includes(error.status)) state = 'failed';
    }
    const receipt = await rpc('support_delivery_record', { p_message: messageId, p_lease: claim.lease, p_state: state, p_provider: providerId }, true);
    if (receipt?.success !== true || receipt.state !== state) throw Error('delivery_not_recorded');
    return { state, accepted: state === 'sent', checked_at: new Date().toISOString() };
  }
  return { provider, receive, sync, send };
}
