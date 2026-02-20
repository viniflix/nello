export const logSupabaseError = (context, error) => {
  console.error(`[Supabase] ${context}:`, error);
};

