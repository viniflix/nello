// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
it('closes direct clinical privileges while retaining supported inserts, updates and trusted RPCs',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table growth_records(id int,weight int);create table meal_plans(id int);create table diet_templates(id int);
 create table lab_results(id int,value int);create table energy_expenditure_calculations(id int,value int);
 grant all on all tables in schema public to anon,authenticated;
 create function public.qa_revise_lab() returns void language sql security definer as $$update public.lab_results set value=2 where id=1;$$;
 insert into lab_results values(1,1);set role anon;select * from growth_records;reset role;`);
 await db.exec(readFileSync('supabase/migrations/releases/20260930155500_restrict_anonymous_clinical_table_privileges.sql','utf8'));
 await db.exec('set role anon;');for(const table of ['growth_records','meal_plans','diet_templates']) await expect(db.query('select * from '+table)).rejects.toMatchObject({code:'42501'});
 for(const table of ['growth_records','meal_plans','diet_templates','lab_results','energy_expenditure_calculations'])await expect(db.exec('truncate '+table)).rejects.toMatchObject({code:'42501'});await db.exec('reset role;set role authenticated;');
 await db.exec('insert into growth_records values(1,60);update growth_records set weight=61;insert into energy_expenditure_calculations values(1,2000);select public.qa_revise_lab();');
 for(const statement of ['delete from growth_records','update lab_results set value=3','update energy_expenditure_calculations set value=3'])await expect(db.exec(statement)).rejects.toMatchObject({code:'42501'});
 for(const table of ['growth_records','meal_plans','diet_templates','lab_results','energy_expenditure_calculations'])await expect(db.exec('truncate '+table)).rejects.toMatchObject({code:'42501'});
 await db.exec('reset role;');expect((await db.query('select value from lab_results')).rows[0].value).toBe(2);
 }finally{await db.close();}
});
