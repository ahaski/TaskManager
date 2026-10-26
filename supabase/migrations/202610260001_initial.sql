-- Apply in Supabase SQL Editor, or with `supabase db push` after linking a project.
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '' check (length(name)<=100), timezone text not null default 'Asia/Jerusalem',
 theme text not null default 'light' check(theme in ('light','dark')),
 reminders_enabled boolean not null default false, reminders_enabled_at timestamptz
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=3000),
 color text not null default 'indigo' check(color in ('indigo','teal','amber','rose')), archived boolean not null default false,
 created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),description text not null default '' check(length(description)<=10000),
 project_id uuid, status text not null default 'todo' check(status in ('todo','progress','waiting','done')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),due_at timestamptz,reminder_at timestamptz,
 subtasks jsonb not null default '[]' check(jsonb_typeof(subtasks)='array' and jsonb_array_length(subtasks)<=100),
 comments jsonb not null default '[]' check(jsonb_typeof(comments)='array' and jsonb_array_length(comments)<=500),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(project_id,user_id) references public.projects(id,user_id), unique(id,user_id)
);
create index tasks_owner_due on public.tasks(user_id,due_at);
create index tasks_owner_project on public.tasks(user_id,project_id);
create table public.push_subscriptions (
 endpoint text primary key check(length(endpoint)<=2048),user_id uuid not null references auth.users(id) on delete cascade,
 keys jsonb not null,created_at timestamptz not null default now()
);
create table public.reminder_jobs (
 id uuid primary key default gen_random_uuid(),task_id uuid unique not null,user_id uuid not null,
 scheduled_at timestamptz not null,state text not null default 'queued' check(state in ('queued','sending','sent','failed','skipped')),
 attempted_at timestamptz,last_error text,foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade
);
create index reminder_jobs_due on public.reminder_jobs(scheduled_at) where state='queued';
create function public.validate_profile() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone';end if;
 if new.reminders_enabled and (TG_OP='INSERT' or not old.reminders_enabled) then new.reminders_enabled_at=now();
 elsif TG_OP='UPDATE' then new.reminders_enabled_at=old.reminders_enabled_at;
 else new.reminders_enabled_at=null;end if;
 return new;
end;$$;
create trigger validate_profile before insert or update on public.profiles for each row execute function public.validate_profile();
create function public.touch_task() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end;$$;
create trigger touch_task before update on public.tasks for each row execute function public.touch_task();
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_jobs enable row level security;
create policy owner_profiles on public.profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_projects on public.projects for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_tasks on public.tasks for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- Subscriptions are written by the authenticated API after validation; user clients may only read/delete their own.
create policy owner_push_read on public.push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy owner_push_delete on public.push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);
create policy owner_jobs_read on public.reminder_jobs for select to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.profiles,public.projects,public.tasks to authenticated;
grant select,delete on public.push_subscriptions to authenticated;
revoke insert,update on public.push_subscriptions from authenticated,anon;
revoke all on public.reminder_jobs from authenticated,anon;
grant select on public.reminder_jobs to authenticated;
grant all on public.profiles,public.projects,public.tasks,public.push_subscriptions,public.reminder_jobs to service_role;
-- Claims use SKIP LOCKED to prevent duplicate dispatch across overlapping cron invocations.
-- Claimed jobs are never automatically retried after ambiguous delivery (at-most-once policy).
create function public.claim_reminder_jobs(batch_size integer default 10) returns setof public.reminder_jobs
language sql security definer set search_path='' as $$
 update public.reminder_jobs j set state='sending',attempted_at=now()
 where j.id in (
  select q.id from public.reminder_jobs q
  join public.tasks t on t.id=q.task_id and t.user_id=q.user_id
  join public.profiles p on p.user_id=q.user_id
  where q.state='queued' and q.scheduled_at<=now() and q.scheduled_at>now()-interval '10 minutes'
   and p.reminders_enabled and q.scheduled_at>=p.reminders_enabled_at
   and t.status<>'done' and t.reminder_at=q.scheduled_at
  order by q.scheduled_at for update of q skip locked limit greatest(1,least(batch_size,10))
 ) returning j.*;
$$;
revoke all on function public.claim_reminder_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_reminder_jobs(integer) to service_role;
