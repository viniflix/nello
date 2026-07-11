import { createClient } from '@supabase/supabase-js';
import { createSupabaseClientOptions } from './clientConfig';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Missing Supabase environment variables. Please check your .env file.");
}

// Supabase Client — HipoZero
// A chave 'anon' é pública por design e segura para uso no front-end.
// A segurança real é garantida pelas Políticas de Segurança (RLS) no banco de dados.
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  createSupabaseClientOptions(),
);
