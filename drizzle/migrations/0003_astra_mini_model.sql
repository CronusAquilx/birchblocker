insert into public.models (id, provider, display_name, description, context_length, capabilities, usage_multiplier, config, sort_order)
values ('astra-mini','builtin','Astra Mini','Homemade · Free · Runs inside Astra with no outside AI.',2048,array['chat','streaming'],0,'{}',-1)
on conflict (id) do nothing;
alter table public.threads alter column model_id set default 'astra-mini';