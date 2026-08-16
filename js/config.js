// ============================================================================
// 설정 파일
// Supabase 프로젝트를 만든 뒤 아래 두 값만 채워 넣으면 됩니다.
// Supabase Dashboard > Project Settings > API 에서 확인할 수 있습니다.
// ============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // 회사/팀 이름 등 화면 상단에 표시할 제목
  APP_TITLE: "임차목적물 검토 업무진척도 현황판",

  // 진척도 상태 값과 표시 색상 (sql/schema.sql 의 check 제약과 맞춰서 관리하세요)
  STATUS_OPTIONS: [
    { value: "접수", color: "#64748b" },
    { value: "서류검토중", color: "#2563eb" },
    { value: "현장확인중", color: "#d97706" },
    { value: "검토완료", color: "#16a34a" },
    { value: "보류", color: "#dc2626" },
  ],

  // 회원가입 화면 노출 여부. 초반에는 관리자가 Supabase Dashboard(Authentication > Users)에서
  // 직접 계정을 만들어주는 방식을 권장하므로 기본값은 false 입니다.
  ALLOW_SELF_SIGNUP: false,
};
