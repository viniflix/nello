import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://afyoidxrshkmplxhcyeh.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeW9pZHhyc2hrbXBseGhjeWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTY1MDYsImV4cCI6MjA3MDAzMjUwNn0.xt3aH-MBg3N_BPpX8w8EpxpETWhlc0RiQsM-4T5AwsE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);