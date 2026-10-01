-- Explicit bounded/capability upload entry points; no Storage bytes written by the caller.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('reserve_storage_upload(text,text,text,bigint,uuid,uuid)',true,true,array['search_path=""']::text[],'7f694b5110b85cc15b45896d1a415140',true),
('claim_storage_upload(uuid,uuid)',true,true,array['search_path=""']::text[],'af0a449c6e71e4caf125d34f1157d35d',true),
('abandon_storage_upload(text,text)',false,true,array['search_path=""']::text[],'3b6a8569c48d0872987e9827b4960b63',true);
