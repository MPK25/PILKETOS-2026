create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  identifier text unique not null,
  full_name text not null,
  role text not null default 'user' check (role in ('user','admin')),
  voter_type text not null check (voter_type in ('murid','guru')),
  created_at timestamptz not null default now()
);

create table if not exists public.voters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  identifier text unique not null,
  full_name text not null,
  gender text,
  major text,
  grade text,
  voter_type text not null check (voter_type in ('murid','guru')),
  is_active boolean not null default true,
  has_voted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint valid_major check (major is null or major in ('LP','TKR','TOI','TSM','TKJ','DPIB')),
  constraint valid_grade check (grade is null or grade in ('X','XI','XII'))
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  number integer unique not null check (number between 1 and 3),
  name text not null,
  members text not null,
  photo_url text,
  vision text not null,
  mission text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.election_settings (
  id integer primary key default 1 check (id = 1),
  title text not null default 'PEMILIHAN KETUA OSIS',
  is_open boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.election_settings (id) values (1) on conflict (id) do nothing;

-- Kotak suara tidak menyimpan identitas pemilih.
create table if not exists public.ballot_box (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id),
  cast_at timestamptz not null default now()
);

-- Tanda terima hanya menyimpan identitas; tidak menyimpan kandidat.
create table if not exists public.vote_receipts (
  voter_id uuid primary key references public.voters(id) on delete cascade,
  cast_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

alter table public.profiles enable row level security;
alter table public.voters enable row level security;
alter table public.candidates enable row level security;
alter table public.election_settings enable row level security;
alter table public.ballot_box enable row level security;
alter table public.vote_receipts enable row level security;

create policy "profile self or admin read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage voters" on public.voters for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "voter read own record" on public.voters for select to authenticated using (user_id = auth.uid());
create policy "candidates visible" on public.candidates for select to anon, authenticated using (is_active or public.is_admin());
create policy "admin manage candidates" on public.candidates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings readable" on public.election_settings for select to anon, authenticated using (true);
create policy "admin manage settings" on public.election_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Tidak ada policy SELECT/INSERT untuk ballot_box dan vote_receipts. Hanya RPC terkontrol yang dapat menulis/menghitung.

create or replace function public.cast_vote(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_voter public.voters%rowtype; v_candidate public.candidates%rowtype;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Akun admin tidak dapat memilih.'; end if;
  select * into v_voter from public.voters where user_id=auth.uid() for update;
  if not found or not v_voter.is_active then raise exception 'Akun pemilih tidak aktif atau tidak terdaftar.'; end if;
  if exists(select 1 from public.vote_receipts where voter_id=v_voter.id) then raise exception 'Akun ini sudah menggunakan hak suara.'; end if;
  if not exists(select 1 from public.election_settings where id=1 and is_open=true) then raise exception 'Pemilihan belum dibuka atau sudah ditutup.'; end if;
  select * into v_candidate from public.candidates where id=p_candidate_id and is_active=true;
  if not found then raise exception 'Pasangan calon tidak tersedia.'; end if;
  insert into public.ballot_box(candidate_id) values (p_candidate_id);
  insert into public.vote_receipts(voter_id) values (v_voter.id);
  update public.voters set has_voted=true where id=v_voter.id;
  return jsonb_build_object('success',true,'message','Suara berhasil dicatat. Terima kasih telah berpartisipasi.');
end; $$;
revoke all on function public.cast_vote(uuid) from public;
grant execute on function public.cast_vote(uuid) to authenticated;

create or replace function public.admin_vote_summary()
returns table(candidate_id uuid, candidate_number integer, candidate_name text, total_votes bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
  return query select c.id,c.number,c.name,count(b.id)::bigint
  from public.candidates c left join public.ballot_box b on b.candidate_id=c.id
  group by c.id,c.number,c.name order by c.number;
end; $$;
revoke all on function public.admin_vote_summary() from public;
grant execute on function public.admin_vote_summary() to authenticated;

create or replace function public.admin_reset_votes()
returns void language plpgsql security definer set search_path = public
as $$
begin
 if not public.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
 delete from public.ballot_box;
 delete from public.vote_receipts;
 update public.voters set has_voted=false;
end; $$;
revoke all on function public.admin_reset_votes() from public;
grant execute on function public.admin_reset_votes() to authenticated;
