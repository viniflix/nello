import { supabase } from './client';

// Every domain uses the SAME authenticated transport. No extra session, token or cache.
// These boundaries express ownership; RLS/RPC authorization remains server-side.
export const identityClient = supabase;
export const patientClient = supabase;
export const clinicalClient = supabase;
export const nutritionClient = supabase;
export const agendaClient = supabase;
export const financeClient = supabase;
export const filesClient = supabase;
export const communicationClient = supabase;
