// The authentication boundary only needs synchronous erasure. Keep the draft
// editor helpers out of the initial login bundle.
export const draftEntries = new Map();
export const clearMemoryDrafts = () => draftEntries.clear();
