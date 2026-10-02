/* global BigInt */
export function mergeChatMessages(...pages) {
  const byId = new Map();
  for (const message of pages.flat()) if (message?.id != null) byId.set(String(message.id), message);
  return [...byId.values()].sort((a, b) => {
    const time = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (time) return time;
    const left = BigInt(a.id), right = BigInt(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function reconcileChatPage(previous, page) {
  const incoming = mergeChatMessages(page?.messages || []);
  const last = previous.messages.at(-1);
  // A long offline interval can exceed one page. Restart the cursor instead
  // of merging two disjoint windows and silently hiding the missing messages.
  const overlap = !last || incoming.some(message => String(message.id) === String(last.id));
  return { messages: overlap ? mergeChatMessages(previous.messages, incoming) : incoming,
    hasMore: overlap && previous.messages.length >= incoming.length ? previous.hasMore : page?.has_more === true };
}
