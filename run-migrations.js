/**
 * Script para executar migrations no Supabase
 *
 * NOTA: Este script requer SERVICE_ROLE_KEY com permissões administrativas.
 * Se não funcionar, execute manualmente no Supabase Dashboard:
 * 1. Acesse: https://supabase.com/dashboard/project/afyoidxrshkmplxhcyeh/sql/new
 * 2. Cole e execute cada migration na ordem
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://afyoidxrshkmplxhcyeh.supabase.co';

// Tente usar SERVICE_ROLE_KEY se disponível, senão use ANON_KEY
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeW9pZHhyc2hrbXBseGhjeWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTY1MDYsImV4cCI6MjA3MDAzMjUwNn0.xt3aH-MBg3N_BPpX8w8EpxpETWhlc0RiQsM-4T5AwsE';

const supabase = createClient(supabaseUrl, supabaseKey);

const migrations = [
    'supabase/migrations/20251120_lab_results.sql',
    'supabase/migrations/20251120_lab_results_pdf_support.sql'
];

async function runMigrations() {
    console.log('🚀 Iniciando execução das migrations...\n');

    for (const migrationPath of migrations) {
        const fullPath = path.join(__dirname, migrationPath);

        try {
            console.log(`📄 Lendo: ${migrationPath}`);
            const sqlContent = await fs.readFile(fullPath, 'utf-8');

            console.log(`⚙️  Executando migration...`);
            const { data, error } = await supabase.rpc('exec_sql', {
                sql_query: sqlContent
            });

            if (error) {
                throw error;
            }

            console.log(`✅ Migration executada com sucesso!\n`);
        } catch (error) {
            console.error(`❌ Erro ao executar ${migrationPath}:`);
            console.error(error.message);

            if (error.message.includes('function') || error.message.includes('permission')) {
                console.log('\n⚠️  ATENÇÃO: A execução automática falhou.');
                console.log('📋 Execute manualmente no Supabase Dashboard:\n');
                console.log(`1. Acesse: ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`);
                console.log(`2. Abra o arquivo: ${migrationPath}`);
                console.log('3. Cole o conteúdo completo no SQL Editor');
                console.log('4. Clique em "Run" para executar\n');
            }

            return;
        }
    }

    console.log('🎉 Todas as migrations foram executadas com sucesso!');
}

runMigrations().catch(console.error);
