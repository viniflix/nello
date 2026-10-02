-- Private realtime and account-bound operations, source-pinned bodies.
insert into wave02_client_rpc_contract(signature,anonymous,authenticated,config,definition_md5,body_only) values
('get_realtime_inbox(uuid)',false,true,array['search_path=""']::text[],'797d0bf9cec935398d1ea98a6f6a9cf1',true),
('get_chat_presence(uuid)',false,true,array['search_path=""']::text[],'b36cfa7c14b0d0c86b289e5ae1ec6ea7',true),
('update_chat_presence(uuid,uuid,boolean,boolean,uuid)',false,true,array['search_path=""']::text[],'7b127a0aee96f2f89d1eef7ae395f305',true),
('send_chat_message(uuid,text,text,text,uuid,uuid)',false,true,array['search_path=""']::text[],'6279f1c388e5d886c22915d230dc1c19',true),
('list_chat_messages(uuid,timestamp with time zone,bigint,integer,uuid)',false,true,array['search_path=""']::text[],'3ffb6baccf2e3e0cee1f2c881c232e1c',true),
('mark_chat_read(uuid,bigint,uuid)',false,true,array['search_path=""']::text[],'8b037a9849c0e6cf4d823f7f8c9c6f16',true),
('mutate_own_notifications(bigint[],boolean,uuid)',false,true,array['search_path=""']::text[],'8c42c4444ce56c9fb2680fd07864f4ab',true),
('mark_all_notifications_read(uuid)',false,true,array['search_path=""']::text[],'3b53044cfed9f95d633a963606565417',true);
