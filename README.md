# 임차목적물 검토 업무진척도 현황판

빌드 도구나 서버 관리 없이, **정적 파일(HTML/CSS/JS) + Supabase(DB·인증·파일저장)** 조합으로 동작하는
업무진척도 게시판입니다. 초반에 사용자가 적은 단계에 맞춰 아래와 같이 구성했습니다.

- 프론트엔드: 순수 HTML/CSS/JS (프레임워크 없음, 빌드 과정 없음) → Vercel/Netlify 등에 그대로 호스팅
- 백엔드: Supabase (Postgres DB + 로그인/인증 + 파일 저장소) → 서버 직접 운영/관리 불필요
- 비용: 두 서비스 모두 무료 티어로 시작 가능 (아래 "비용" 참고)

## 핵심 기능

- 검토 건 등록 / 조회 / 수정 (제목, 임차목적물 주소, 비고, 처리기한)
- 진척도(상태) 표시 및 필터링 — 접수 / 서류검토중 / 현장확인중 / 검토완료 / 보류
- 담당자별 로그인 및 권한 구분 — 등록자·담당자·관리자만 수정/삭제 가능 (DB 정책으로 강제)
- 계약서 등 첨부파일 업로드/다운로드
- 상태 변경 이력 자동 기록

---

## 1단계. Supabase 프로젝트 만들기 (DB + 로그인 + 파일저장)

1. https://supabase.com 에서 무료 계정 생성 후 **New project** 클릭
2. 프로젝트 이름, 데이터베이스 비밀번호, 리전(서울에 가까운 `Northeast Asia (Seoul)` 권장)을 설정하고 생성 (1~2분 소요)
3. 생성이 끝나면 좌측 메뉴의 **SQL Editor** 로 이동해 `sql/schema.sql` 파일 내용을 전체 복사해 붙여넣고 **Run** 실행
   - 이 스크립트가 테이블 4개(profiles, cases, attachments, status_history), 자동 트리거, 권한 정책(RLS), 첨부파일 저장소 버킷까지 한 번에 생성합니다.
4. 좌측 메뉴 **Project Settings → API** 에서 다음 두 값을 복사해 둡니다.
   - `Project URL`
   - `anon public` key

## 2단계. 앱 설정값 채우기

`js/config.js` 파일을 열어 아래 두 줄을 방금 복사한 값으로 바꿔주세요.

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

필요하면 `APP_TITLE`(화면 제목), `STATUS_OPTIONS`(진척도 단계와 색상)도 이 파일에서 바로 수정할 수 있습니다.
`STATUS_OPTIONS` 값을 바꾸는 경우 `sql/schema.sql` 의 `cases` 테이블 `status` 체크 제약 조건도 함께 맞춰주세요.

## 3단계. 담당자 계정 만들기

초반에는 회원가입을 막아두고(기본값), 관리자가 계정을 직접 만들어주는 방식을 권장합니다.

1. Supabase Dashboard → **Authentication → Users → Add user** 에서 담당자 이메일/비밀번호로 계정 생성
   - 계정이 생성되면 트리거가 자동으로 `profiles` 테이블에 프로필을 만듭니다(기본 권한 `member`).
2. 관리자로 지정할 계정은 **SQL Editor** 에서 아래 쿼리를 실행합니다.

```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = '관리자이메일@example.com');
```

> 팀원이 늘어나면 `js/config.js` 의 `ALLOW_SELF_SIGNUP` 을 `true` 로 바꿔 자체 회원가입 화면을 노출할 수도 있습니다.

## 4단계. 호스팅 배포 (Vercel 권장)

빌드 과정이 없는 정적 사이트이므로 배포가 매우 간단합니다.

**Vercel (추천, 무료)**
1. 이 프로젝트 폴더를 GitHub 저장소로 올립니다.
2. https://vercel.com 에서 **Add New → Project** → 방금 만든 저장소 선택
3. Framework Preset은 **Other**로 두고, Build Command/Output Directory는 비워둔 채 **Deploy** 클릭
4. 배포가 끝나면 `xxx.vercel.app` 주소가 발급됩니다. (원하는 경우 커스텀 도메인 연결 가능)

**Netlify를 쓰는 경우**: 저장소 연결 없이도 프로젝트 폴더를 Netlify 배포 화면에 드래그 앤 드롭하면 즉시 배포됩니다.

## 로컬에서 미리 확인하기

Node.js가 설치되어 있다면 아래 명령으로 로컬에서 바로 열어볼 수 있습니다 (별도 빌드 불필요).

```bash
npx http-server -p 8080
# 브라우저에서 http://localhost:8080 접속
```

---

## 폴더 구조

```
lease-tracker/
├── index.html          # 전체 화면 (로그인 + 게시판 + 등록/상세 모달)
├── css/styles.css       # 스타일
├── js/
│   ├── config.js         # Supabase 접속정보, 진척도 상태값 등 (필수 수정)
│   ├── client.js         # Supabase 클라이언트 초기화
│   ├── api.js            # DB/스토리지 CRUD 함수 모음
│   └── app.js             # 화면 렌더링, 이벤트 처리
└── sql/schema.sql        # Supabase에 실행할 테이블/권한 스크립트
```

## 권한 동작 방식

- 로그인한 모든 담당자는 전체 목록을 조회할 수 있습니다.
- **등록(작성자)**, **담당자로 지정된 사람**, **관리자(admin)** 만 해당 건을 수정/삭제할 수 있습니다.
- 이 규칙은 화면(UI)뿐 아니라 Supabase의 Row Level Security로 서버 단에서도 강제되어, 브라우저 개발자 도구를 조작해도 우회할 수 없습니다.

## 비용 (2026년 8월 기준, 변동 가능)

- **Vercel**: 개인/소규모 팀 무료 Hobby 플랜으로 충분 (트래픽이 커지면 유료 전환 고려)
- **Supabase**: 무료 Free 플랜 — DB 500MB, 파일저장소 1GB, 월간 활성 사용자 5만 명까지 포함
  - 무료 플랜은 7일간 사용이 없으면 프로젝트가 일시 정지(pause)될 수 있으니, 사용자가 늘어나면 유료 플랜(월 $25~) 전환을 검토하세요.

사용자가 늘어나거나 트래픽이 많아지면 같은 코드 그대로 유료 플랜으로 전환하거나, AWS/네이버클라우드 등으로 이전할 수 있도록 표준 웹 기술(Postgres + REST)로만 구성했습니다.
