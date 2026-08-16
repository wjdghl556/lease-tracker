// ============================================================================
// Supabase 클라이언트 초기화
// index.html 에서 @supabase/supabase-js CDN 스크립트 이후에 로드됩니다.
// ============================================================================
(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

  if (!window.supabase || !window.supabase.createClient) {
    console.error(
      "Supabase 라이브러리를 불러오지 못했습니다. 네트워크 연결 또는 CDN 스크립트 태그를 확인하세요."
    );
    return;
  }

  if (SUPABASE_URL.includes("YOUR-PROJECT-REF") || SUPABASE_ANON_KEY.includes("YOUR-ANON")) {
    console.warn(
      "js/config.js 의 SUPABASE_URL / SUPABASE_ANON_KEY 를 실제 프로젝트 값으로 채워주세요."
    );
  }

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
})();
