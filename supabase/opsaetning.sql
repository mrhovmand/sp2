-- SP2 Dåsekontrol – opsætning af fælles database i Supabase
-- Kopiér HELE filen ind i Supabase → SQL Editor → New query, og tryk Run.
-- Kan køres flere gange uden at ødelægge noget.

-- 1. Tabeller (registreringer, navne/tagnoter, materialeliste)
create table if not exists public.regs (
  id text primary key,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.meta (
  key text primary key,
  value jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.materials (
  id text primary key,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists regs_updated_idx on public.regs (updated_at);
create index if not exists meta_updated_idx on public.meta (updated_at);
create index if not exists materials_updated_idx on public.materials (updated_at);

-- 2. Serveren sætter selv tidsstemplet ved hver ændring
create or replace function public.sp2_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists regs_touch on public.regs;
create trigger regs_touch before insert or update on public.regs for each row execute function public.sp2_touch();
drop trigger if exists meta_touch on public.meta;
create trigger meta_touch before insert or update on public.meta for each row execute function public.sp2_touch();
drop trigger if exists materials_touch on public.materials;
create trigger materials_touch before insert or update on public.materials for each row execute function public.sp2_touch();

-- 3. Kun den fælles bruger må læse og skrive (Row Level Security)
alter table public.regs enable row level security;
alter table public.meta enable row level security;
alter table public.materials enable row level security;
drop policy if exists sp2_team on public.regs;
create policy sp2_team on public.regs for all to authenticated
  using ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk')
  with check ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk');
drop policy if exists sp2_team on public.meta;
create policy sp2_team on public.meta for all to authenticated
  using ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk')
  with check ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk');
drop policy if exists sp2_team on public.materials;
create policy sp2_team on public.materials for all to authenticated
  using ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk')
  with check ((auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk');

-- 3b. Rettigheder til Data API (RLS ovenfor afgør, hvad der faktisk kan ses).
-- anon må kun læse, og ser intet pga. RLS – bruges kun til at holde projektet vågent.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.regs, public.meta, public.materials to authenticated;
grant select on public.regs to anon;

-- 4. Privat mappe til billeder (højst 5 MB pr. billede, kun JPEG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists sp2_team_photos on storage.objects;
create policy sp2_team_photos on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk')
  with check (bucket_id = 'photos' and (auth.jwt() ->> 'email') = 'team@sp2-daasekontrol.dk');
