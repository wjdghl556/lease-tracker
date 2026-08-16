-- ============================================================================
-- 임차목적물 검토 업무진척도 현황판 - Supabase 스키마 (게스트 등록 모드)
-- Supabase 프로젝트를 새로 만든 뒤 "SQL Editor"에 이 파일 전체를 붙여넣고 실행하세요.
--
-- 접근 방식:
--   - 관리자: 이메일/비밀번호로 로그인, 전체 요청을 조회/수정/삭제할 수 있습니다.
--   - 게스트: 로그인 없이 요청을 등록할 수 있고, 등록 시 입력한 "이름 + 연락처"로
--             나중에 본인이 등록한 요청만 조회할 수 있습니다.
-- ============================================================================

-- 1. 관리자 프로필 테이블 (auth.users 와 1:1, 로그인하는 관리자만 여기 등록됩니다)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is '로그인하는 관리자 정보 (이름, 권한)';

-- 신규 가입(auth.users insert) 시 profiles 행을 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, '관리자'), '@', 1)),
    'admin'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 관리자 여부를 확인하는 헬퍼 함수 (RLS 정책에서 재사용)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 2. 임차목적물 검토 건 테이블 (관리자 등록 또는 게스트 등록)
create table if not exists public.cases (
  id bigint generated always as identity primary key,
  title text not null,
  property_address text,
  status text not null default '접수'
    check (status in ('접수', '서류검토중', '검토완료', '보류')),
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete restrict,
  guest_name text,
  guest_contact text,
  description text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_owner_check check (
    (created_by is not null)
    or (guest_name is not null and guest_contact is not null)
  )
);

comment on table public.cases is '임차목적물 검토 건 (관리자 등록 또는 게스트 등록)';

-- updated_at 자동 갱신 (게스트의 익명 등록에도 동작하도록 security definer)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cases_updated_at on public.cases;
create trigger trg_cases_updated_at
  before update on public.cases
  for each row execute procedure public.set_updated_at();

-- 3. 첨부파일 메타데이터 테이블 (실제 파일은 Storage 버킷에 저장, 관리자 전용)
create table if not exists public.attachments (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.attachments is '검토 건에 첨부된 파일 (계약서 등) 메타데이터';

-- 4. 상태 변경 이력 (진척도 히스토리, 관리자만 조회)
create table if not exists public.status_history (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

-- 게스트의 익명 등록에도 이력이 남도록 security definer
create or replace function public.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.status_history (case_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    insert into public.status_history (case_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cases_status_history on public.cases;
create trigger trg_cases_status_history
  after insert or update on public.cases
  for each row execute procedure public.log_status_change();

-- 5. 게스트 전용 조회 함수: 이름 + 연락처가 정확히 일치하는 본인 글만 반환
create or replace function public.lookup_my_cases(p_name text, p_contact text)
returns setof public.cases
language sql
stable
security definer
set search_path = public
as $$
  select * from public.cases
  where guest_name = p_name and guest_contact = p_contact
  order by updated_at desc;
$$;

grant execute on function public.lookup_my_cases(text, text) to anon, authenticated;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.attachments enable row level security;
alter table public.status_history enable row level security;

-- profiles: 로그인한 관리자는 전체 프로필 조회 가능(담당자 배정 드롭다운용), 본인 것만 수정
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- cases: 관리자만 전체 조회/수정/삭제. 게스트(비로그인)는 등록만 가능하고,
-- 조회는 위의 lookup_my_cases() 함수를 통해서만 할 수 있습니다.
create policy "cases_select_admin" on public.cases
  for select to authenticated using (public.is_admin());

create policy "cases_insert_admin" on public.cases
  for insert to authenticated with check (public.is_admin() and auth.uid() = created_by);

create policy "cases_insert_guest" on public.cases
  for insert to anon with check (
    created_by is null and guest_name is not null and guest_contact is not null
  );

create policy "cases_update_admin" on public.cases
  for update to authenticated using (public.is_admin());

create policy "cases_delete_admin" on public.cases
  for delete to authenticated using (public.is_admin());

-- attachments: 관리자만 조회/업로드/삭제
create policy "attachments_select_admin" on public.attachments
  for select to authenticated using (public.is_admin());

create policy "attachments_insert_admin" on public.attachments
  for insert to authenticated with check (public.is_admin());

create policy "attachments_delete_admin" on public.attachments
  for delete to authenticated using (public.is_admin());

-- status_history: 관리자만 조회 (기록은 트리거로만 자동 생성됨)
create policy "status_history_select_admin" on public.status_history
  for select to authenticated using (public.is_admin());

-- ============================================================================
-- Storage: 첨부파일용 버킷 (관리자만 사용)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "storage_attachments_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments');

create policy "storage_attachments_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

create policy "storage_attachments_delete_owner"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner = auth.uid());

-- ============================================================================
-- (선택) 관리자 1명 지정 예시 - 본인 가입 후 아래 UPDATE 문의 이메일을 바꿔 실행하세요.
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@example.com');
-- ============================================================================
