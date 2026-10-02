-- Reviewed active-care reads and historical-owner reactivation; anonymous access is denied.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('get_active_feed_patients()',false,true,array['search_path=""']::text[],'1fbcefdb7982dd56e0b7955236b61fc8',true),
('get_my_feed_task_states()',false,true,array['search_path=""']::text[],'7a3ea8647df48ef5e06eaa353c34c99d',true),
('start_care_episode(uuid,text)',false,true,array['search_path=""']::text[],'caa25081804d6760e1314a5055412bd7',true);
