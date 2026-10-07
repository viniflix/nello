-- Reviewed administrative APIs: AAL2, action-specific roles, CAS and aggregate-only reads.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('admin_incident_state(text)',false,true,array['search_path=""']::text[],'18a0d5b839bc102de85f13ceff058763',true),
('admin_triage_incident(text,bigint,text,text)',false,true,array['search_path=""']::text[],'9e48d0d46fdcd50409f73e1d44cd6a05',true),
('admin_operational_briefing()',false,true,array['search_path=""']::text[],'c540e083f214fe0a731a75400bc9ae8b',true);
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values('admin_product_analytics(integer)',false,true,array['search_path=""']::text[],'fdadee3a0867dff98a24132dfaa041e9',true);
update wave02_client_rpc_contract set definition_md5='82a20b2ccc16395c92ab63c0d437fd45',body_only=true where signature='admin_operational_briefing()';
update wave02_client_rpc_contract set definition_md5='c327b987e630c319b8f01376494e7e54',body_only=true where signature='admin_workflow_overview()';
