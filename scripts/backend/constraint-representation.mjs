// PostgreSQL 17 makeAndExpr flattens consecutive AND nodes on parsing a dump.
// Recognize only the two captured spellings of this exact baseline CHECK.
// No generic parenthesis removal: mixed operators, constants, casts, regex,
// validation flags and every other constraint must remain exact.
// https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/gram.y
const nested = "CHECK ((((length(storage_path) >= 10) AND (length(storage_path) <= 500)) AND (storage_path ~ '^[A-Za-z0-9/_-]+$'::text)))";
const flat = "CHECK (((length(storage_path) >= 10) AND (length(storage_path) <= 500) AND (storage_path ~ '^[A-Za-z0-9/_-]+$'::text)))";
export function canonicalConstraint(row) {
  if (row.schema === 'public' && row.table === 'clinical_attachments'
      && row.name === 'clinical_attachments_path_check'
      && [nested, flat].includes(row.definition)) return { ...row, definition: flat };
  return row;
}
