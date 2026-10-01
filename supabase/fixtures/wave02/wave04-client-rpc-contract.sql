-- Reviewed Wave 4: own-auth.uid receipts; service-only atomic quota.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('get_my_privacy_preferences()',false,true,array['search_path=""']::text[],'018e049878b92280e752817cb5af2529',true),
('record_my_privacy_choice(text,boolean,boolean)',false,true,array['search_path=""']::text[],'86d1c900c6b588f32622749515ed0745',true),
('consume_patient_creation_quota(uuid)',false,false,array['search_path=""']::text[],'292d8c57105ed7fad06a7e3dd36a7e9c',true),
('prepare_patient_auth_invitation(text,uuid)',false,false,array['search_path=""']::text[],'2c4e0d6247c5d51b490166f5f1fe81bc',true),
('renew_patient_invitation(uuid)',false,true,array['search_path=""']::text[],'88b7891634b52f7391e95d0ffb446ad5',true);
