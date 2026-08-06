do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'generate-overdue-attention-notices';

    perform cron.schedule(
      'generate-overdue-attention-notices',
      '*/5 * * * *',
      'select public.generate_overdue_attention_notices()'
    );
  end if;
exception
  when undefined_table or invalid_schema_name then null;
end;
$$;
