-- ============================================================================
-- 임차목적물 검토 업무진척도 현황판 - Supabase 스키마
-- Supabase 프로젝트 생성 후 "SQL Editor"에 이 파일 전체를 붙여넣고 실행하세요.
-- ============================================================================

-- 1. 담당자 프로필 테이블 (auth.users 와 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is '로그인 담당자 정보 (이름, 권한)';

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
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'member'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. 임차목적물 검토 건 테이블
create table if not exists public.cases (
  id bigint generated always as identity primary key,
  title text not null,
  property_address text,
  status text not null default '접수'
    check (status in ('접수', '서류검토중', '현장확인중', '검토완료', '보류')),
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  description text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cases is '임차목적물 검토 건 (업무진척도 게시판의 게시글)';

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
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

-- 3. 첨부파일 메타데이터 테이블 (실제 파일은 Storage 버킷에 저장)
create table if not exists public.attachments (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.attachments is '검토 건에 첨부된 파일 (계약서 등) 메타데이터';

-- 4. 상태 변경 이력 (진척도 히스토리 - 선택 기능이지만 감사 추적에 유용)
create table if not exists public.status_history (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create or replace function public.log_status_change()
returns trigger
language plpgsql
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

-- ============================================================================
-- Row Level Security (RLS)
-- 정책: 로그인한 담당자는 전체 목록을 볼 수 있고, 본인이 등록했거나(created_by)
-- 담당자로 지정된(assignee_id) 건, 또는 admin 권한만 수정/삭제할 수 있습니다.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.attachments enable row level security;
alter table public.status_history enable row level security;

-- profiles: 로그인한 사용자는 전체 프로필 조회 가능(담당자 배정 드롭다운용), 본인 것만 수정
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- cases: 로그인한 사용자는 전체 조회, 등록은 누구나, 수정/삭제는 작성자/담당자/관리자만
create policy "cases_select_authenticated" on public.cases
  for select to authenticated using (true);

create policy "cases_insert_authenticated" on public.cases
  for insert to authenticated with check (auth.uid() = created_by);

create policy "cases_update_owner_or_admin" on public.cases
  for update to authenticated using (
    auth.uid() = created_by
    or auth.uid() = assignee_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "cases_delete_owner_or_admin" on public.cases
  for delete to authenticated using (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- attachments: 로그인한 사용자는 전체 조회, 업로드는 누구나, 삭제는 업로더/관리자만
create policy "attachments_select_authenticated" on public.attachments
  for select to authenticated using (true);

create policy "attachments_insert_authenticated" on public.attachments
  for insert to authenticated with check (auth.uid() = uploaded_by);

create policy "attachments_delete_owner_or_admin" on public.attachments
  for delete to authenticated using (
    auth.uid() = uploaded_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- status_history: 조회만 가능 (트리거로만 기록됨)
create policy "status_history_select_authenticated" on public.status_history
  for select to authenticated using (true);

-- ============================================================================
-- Storage: 첨부파일용 버킷 (Dashboard > Storage 에서 생성해도 되지만 SQL로도 가능)
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
