-- Reviewed Agenda notice API: owner-scoped sync, service-only processor.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values('sync_appointment_notification_schedule(bigint,boolean)',false,true,array['search_path=""']::text[],'6d892020070c49bb96696f54cb3dc01e',true);
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values('process_appointment_notifications(integer)',false,false,array['search_path=""']::text[],'1a482dd8259fe71533235b39a0e506fe',true);
