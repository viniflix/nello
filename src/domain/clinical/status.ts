export const confirmedAnamnesisStatuses = ['submitted', 'validated'] as const;
export function isConfirmedAnamnesis(status: unknown): boolean { return confirmedAnamnesisStatuses.some(value => value === status); }
