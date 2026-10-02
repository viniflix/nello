-- Reviewed source-pinned professional food and public capability contracts.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('save_reviewed_custom_food(uuid,jsonb,jsonb,jsonb,boolean,bigint,uuid,uuid)',false,true,array['search_path=""']::text[],'aa5cd3d4ad8b13b4f1eb2aab90e589d1',true),
('get_anamnesis_draft_revision(uuid)',true,true,array['search_path=""']::text[],'71685964a966d834f73c396d8a8a7bac',true),
('save_anamnesis_draft_revision(uuid,jsonb,boolean,timestamp with time zone)',true,true,array['search_path=""']::text[],'28a08a9297f682f556cfcdc08ae77abc',true),
('complete_anamnesis_revision(uuid,jsonb,boolean,timestamp with time zone,uuid)',true,true,array['search_path=""']::text[],'e9afbe218dd4aece49380e19dc7e0b54',true);
