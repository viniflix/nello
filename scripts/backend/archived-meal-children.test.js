// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';

it('preserves draft edits and blocks inserts, moves, updates and deletes in archived prescriptions',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private;create role anon;create role authenticated;
   create table meal_plans(id bigint primary key,prescription_status text);
   create table meal_plan_meals(id bigint primary key,meal_plan_id bigint references meal_plans);
   create table meal_plan_foods(id bigint primary key,meal_plan_meal_id bigint references meal_plan_meals,quantity numeric);
   create table meal_plan_food_substitutions(id bigint primary key,meal_plan_food_id bigint references meal_plan_foods,quantity numeric);
   insert into meal_plans values(1,'draft'),(2,'archived'),(3,'invalidated');
   insert into meal_plan_meals values(11,1),(22,2),(33,3);
   insert into meal_plan_foods values(111,11,100),(222,22,100),(333,33,100);
   insert into meal_plan_food_substitutions values(1111,111,100),(2222,222,100);
   grant select,insert,update,delete on all tables in schema public to authenticated;`);
  const migration=readFileSync('supabase/migrations/releases/20260930203000_clinical_adversarial_boundaries.sql','utf8');
  const trigger=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION private.prevent_archived_meal_child_mutation()'),migration.lastIndexOf('commit;'));
  await db.exec(trigger);
  await db.exec(`set role authenticated;insert into meal_plan_meals values(12,1);
   insert into meal_plan_foods values(112,12,80);update meal_plan_foods set quantity=90 where id=112;
   insert into meal_plan_food_substitutions values(1121,112,90);delete from meal_plan_food_substitutions where id=1121;`);
  const rejected=[
   'insert into meal_plan_meals values(23,2)',
   'insert into meal_plan_foods values(223,22,80)',
   'insert into meal_plan_food_substitutions values(2223,222,80)',
   'update meal_plan_meals set meal_plan_id=2 where id=12',
   'update meal_plan_foods set meal_plan_meal_id=22 where id=112',
   'update meal_plan_foods set meal_plan_meal_id=11 where id=222',
   'update meal_plan_foods set quantity=90 where id=222',
   'delete from meal_plan_foods where id=222',
   'delete from meal_plan_meals where id=22',
   'update meal_plan_food_substitutions set quantity=90 where id=2222',
   'insert into meal_plan_foods values(334,33,80)',
  ];
  for(const sql of rejected)await expect(db.exec(sql),sql).rejects.toMatchObject({code:'23514',message:'archived_meal_plan_is_immutable'});
  expect((await db.query('select quantity from meal_plan_foods where id=112')).rows[0].quantity).toBe('90');
 }finally{await db.close();}
},20000);
