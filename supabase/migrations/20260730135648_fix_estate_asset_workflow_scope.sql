-- An estate asset workflow belongs to the asset subproject, while the asset row
-- belongs to the root estate project. The former composite FK incorrectly
-- required both project ids to be identical and blocked every asset workflow.
alter table public.workflow_instances
  drop constraint if exists workflow_instances_estate_asset_id_project_id_fkey;

alter table public.workflow_instances
  add constraint workflow_instances_estate_asset_id_fkey
  foreign key (estate_asset_id)
  references public.estate_assets(id)
  on delete restrict;
