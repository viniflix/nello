export const MAX_JAVASCRIPT_CHUNK_BYTES = 1_600_000;

export function evaluateBundle(files) {
  const violations = [];

  for (const file of files) {
    if (file.path.endsWith('.js') && file.size > MAX_JAVASCRIPT_CHUNK_BYTES) {
      violations.push(
        `${file.path} exceeds the ${MAX_JAVASCRIPT_CHUNK_BYTES} byte JavaScript chunk budget (${file.size} bytes)`,
      );
    }

    if (file.path.endsWith('.map')) {
      violations.push(`${file.path} must not be published`);
    }
  }

  return violations;
}
