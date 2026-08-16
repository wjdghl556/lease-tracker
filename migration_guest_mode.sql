-- ============================================================================
-- 마이그레이션: 게스트(비로그인) 등록 + 조회 모드 추가
-- 이미 schema.sql 을 실행한 기존 프로젝트에 이 파일을 추가로 실행하세요.
-- Supabase Dashboard > SQL Editor > New query 에 전체를 붙여넣고 Run 하시면 됩니다.
-- ============================================================================

-- 0. 관리자 여부를 확인하는 헬퍼 함수
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

-- 1. cases 테이블: 로그인 없이도(게스트) 등록할 수 있도록 컬럼/제약 변경
alter table public.cases alter column created_by drop not null;
alter table public.cases alter column created_by drop default;

alter table public.cases add column if not exists guest_name text;
alter table public.cases add column if not exists guest_contact text;

alter table public.cases drop constraint if exists cases_owner_check;
alter table public.cases add constraint cases_owner_check
  check (
    (created_by is not null)
    or (guest_name is not null and guest_contact is not null)
  );

-- 2. cases 테이블 보안 규칙(RLS) 재설정
--    - 관리자만 전체 목록을 조회/수정/삭제할 수 있습니다.
--    - 게스트(비로그인)는 등록만 할 수 있고, 목록을 직접 조회할 수는 없습니다.
--      (게스트는 아래 6번의 "조회 전용 함수"를 통해서만 본인 글을 확인합니다)
drop policy if exists "cases_select_authenticated" on public.cases;
drop policy if exists "cases_insert_authenticated" on public.cases;
drop policy if exists "cases_update_owner_or_admin" on public.cases;
drop policy if exists "cases_delete_owner_or_admin" on public.cases;

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

-- 3. attachments / status_history 는 이제 관리자만 조회/기록합니다
drop policy if exists "attachments_select_authenticated" on public.attachments;
drop policy if exists "attachments_insert_authenticated" on public.attachments;
drop policy if exists "attachments_delete_owner_or_admin" on public.attachments;

create policy "attachments_select_admin" on public.attachments
  for select to authenticated using (public.is_admin());

create policy "attachments_insert_admin" on public.attachments
  for insert to authenticated with check (public.is_admin());

create policy "attachments_delete_admin" on public.attachments
  for delete to authenticated using (public.is_admin());

drop policy if exists "status_history_select_authenticated" on public.status_history;

create policy "status_history_select_admin" on public.status_history
  for select to authenticated using (public.is_admin());

-- 4. 진척도 변경 이력을 남기는 트리거 함수가 게스트(비로그인) 등록 시에도
--    문제 없이 동작하도록 security definer 로 변경 (RLS를 우회해서 기록만 남김)
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

-- 5. updated_at 자동 갱신 트리거도 동일한 이유로 security definer 로 변경
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

-- 6. 게스트 전용 조회 함수: 이름 + 연락처가 정확히 일치하는 본인 글만 반환합니다.
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
-- 여기까지 실행하면 끝입니다. "Success" 메시지가 뜨면 정상 적용된 것입니다.
-- ============================================================================
