import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkFood() {
    // Attempt to sign up a dummy user
    const email = 'test_food_query@example.com';
    const password = 'password123';
    
    let { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password
    });
    
    if (authErr) {
        console.log("Sign up failed (maybe already exists), attempting sign in...");
        const res = await supabase.auth.signInWithPassword({
            email,
            password
        });
        authData = res.data;
        if (res.error) console.error("Sign in error:", res.error);
    }
    
    console.log("User:", authData?.user?.id);

    console.log("Searching for 'Aveia em flocos'...");
    const { data: aveia, error: errAveia } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', '%Aveia em flocos%');
    if (errAveia) console.error("Error aveia:", errAveia);
    console.log("Aveia results:", JSON.stringify(aveia, null, 2));

    console.log("\nSearching for 'Arroz, integral, cozido'...");
    const { data: arroz, error: errArroz } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', '%Arroz, integral, cozido%');
    if (errArroz) console.error("Error arroz:", errArroz);
    console.log("Arroz results:", JSON.stringify(arroz, null, 2));

    console.log("\nSearching for 'Feijão'...");
    const { data: feijao, error: errFeijao } = await supabase
        .from('foods')
        .select('id, name')
        .ilike('name', 'Feijão%')
        .limit(10);
    if (errFeijao) console.error("Error feijao:", errFeijao);
    console.log("Feijão results:", JSON.stringify(feijao, null, 2));

    console.log("\nSearching for 'Salmão, filé, com pele, fresco, grelhado'...");
    const { data: salmao, error: errSalmao } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', '%Salmão, filé, com pele, fresco, grelhado%');
    if (errSalmao) console.error("Error salmao:", errSalmao);
    console.log("Salmão results:", JSON.stringify(salmao, null, 2));
}

checkFood();
