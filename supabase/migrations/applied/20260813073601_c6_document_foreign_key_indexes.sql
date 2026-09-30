-- C6.8: covering indexes for every new foreign key reported by Advisor.
-- These are intentionally narrow and non-destructive; existing read-path indexes remain.
create index if not exists document_identity_events_identity_idx on public.professional_document_identity_events(identity_id);
create index if not exists document_identity_events_actor_idx on public.professional_document_identity_events(actor_id);
create index if not exists document_identities_verification_idx on public.professional_document_identities(verification_id);
create index if not exists document_identities_created_by_idx on public.professional_document_identities(created_by);
create index if not exists document_asset_uploads_identity_idx on public.document_asset_uploads(identity_id);
create index if not exists document_asset_uploads_created_identity_idx on public.document_asset_uploads(created_identity_id);
create index if not exists document_layouts_active_version_idx on public.document_layouts(code,active_version);
create index if not exists document_artifacts_layout_version_idx on public.document_artifacts(layout_code,layout_version);
create index if not exists document_artifacts_professional_idx on public.document_artifacts(professional_id);
create index if not exists document_artifacts_preparer_idx on public.document_artifacts(preparer_id);
create index if not exists document_artifacts_supervisor_idx on public.document_artifacts(supervisor_id);
create index if not exists document_artifacts_identity_idx on public.document_artifacts(identity_id);
create index if not exists document_artifacts_finalized_by_idx on public.document_artifacts(finalized_by);
create index if not exists document_artifacts_signed_by_idx on public.document_artifacts(signed_by);
create index if not exists document_artifacts_invalidated_by_idx on public.document_artifacts(invalidated_by);
create index if not exists document_artifacts_supersedes_idx on public.document_artifacts(supersedes_id);
create index if not exists document_artifact_events_artifact_idx on public.document_artifact_events(artifact_id);
create index if not exists document_artifact_events_actor_idx on public.document_artifact_events(actor_id);
