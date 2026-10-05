-- Reviewed administrative APIs: AAL2, action-specific roles, CAS and aggregate-only reads.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('admin_incident_state(text)',false,true,array['search_path=""']::text[],'18a0d5b839bc102de85f13ceff058763',true),
('admin_triage_incident(text,bigint,text,text)',false,true,array['search_path=""']::text[],'9e48d0d46fdcd50409f73e1d44cd6a05',true),
('admin_operational_briefing()',false,true,array['search_path=""']::text[],'c540e083f214fe0a731a75400bc9ae8b',true);
