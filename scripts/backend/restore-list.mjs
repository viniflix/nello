// pg_cron is installed in exactly one provider-configured database. It is not an
// application authorization object and cannot be restored in a QA clone.
// Everything else in the archive, including ownership and ACLs, is retained.
export function applicationRestoreList(toc) {
  let extensionCount = 0;
  const excluded = [];
  const lines = toc.split(/\r?\n/).map(line => {
    if (/^\d+; \d+ \d+ EXTENSION - pg_cron(?:\s|$)/.test(line)) {
      extensionCount += 1;
      excluded.push(line);
      return '; ' + line;
    }
    if (/^\d+; \d+ \d+ COMMENT - EXTENSION pg_cron(?:\s|$)/.test(line)) {
      excluded.push(line);
      return '; ' + line;
    }
    return line;
  });
  if (extensionCount !== 1) throw Error(`Expected exactly one pg_cron extension in the QA archive, found ${extensionCount}`);
  return { text: lines.join('\n'), excluded };
}
