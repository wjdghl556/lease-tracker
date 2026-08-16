// ============================================================================
// 설정 파일
// Supabase 프로젝트를 만든 뒤 아래 두 값만 채워 넣으면 됩니다.
// Supabase Dashboard > Project Settings > API 에서 확인할 수 있습니다.
// ============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://yceqhlewlkbqnovfokmx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_JUf91YuLMviXzowPRr9dfg_Os9g1IZN",

  // 회사/팀 이름 등 화면 상단에 표시할 제목
  APP_TITLE: "임차목적물 검토 업무진척도 현황판",

  // 진척도 상태 값과 표시 색상 (sql/schema.sql 의 check 제약과 맞춰서 관리하세요)
  STATUS_OPTIONS: [
    { value: "접수", color: "#64748b" },
    { value: "서류검토중", color: "#2563eb" },
    { value: "검토완료", color: "#16a34a" },
    { value: "보류", color: "#dc2626" },
  ],
};
