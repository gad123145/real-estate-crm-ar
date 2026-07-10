create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  reminder_lead_minutes integer not null default 30 check (reminder_lead_minutes between 0 and 1440),
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_push_subscriptions_user_id_idx
  on public.crm_push_subscriptions(user_id);

alter table public.crm_push_subscriptions enable row level security;

create policy "Users can read their push subscriptions"
  on public.crm_push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their push subscriptions"
  on public.crm_push_subscriptions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their push subscriptions"
  on public.crm_push_subscriptions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their push subscriptions"
  on public.crm_push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.crm_push_subscriptions to authenticated;

create table if not exists public.crm_push_deliveries (
  appointment_id uuid not null references public.crm_appointments(id) on delete cascade,
  subscription_id uuid not null references public.crm_push_subscriptions(id) on delete cascade,
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (appointment_id, subscription_id, scheduled_for)
);

alter table public.crm_push_deliveries enable row level security;
revoke all on public.crm_push_deliveries from anon, authenticated;

select cron.schedule(
  'send-appointment-push-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-appointment-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apiKey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
      ),
      body := jsonb_build_object('triggered_at', now()),
      timeout_milliseconds := 15000
    );
  $job$
);
