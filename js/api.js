// ============================================================================
// 데이터 액세스 레이어 (Supabase 테이블/스토리지 CRUD 래퍼)
// ============================================================================
window.Api = (function () {
  const sb = () => {
    if (!window.sb) {
      throw new Error(
        "Supabase 클라이언트가 초기화되지 않았습니다. js/config.js 설정과 네트워크 연결(CDN 스크립트 로드)을 확인하세요."
      );
    }
    return window.sb;
  };

  async function getSession() {
    const { data, error } = await sb().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await sb().auth.signOut();
    if (error) throw error;
  }

  async function getMyProfile(userId) {
    const { data, error } = await sb().from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data;
  }

  async function listProfiles() {
    const { data, error } = await sb().from("profiles").select("id, name, role").order("name");
    if (error) throw error;
    return data;
  }

  async function listCases({ status = null, search = "" } = {}) {
    let query = sb()
      .from("cases")
      .select(
        `id, title, property_address, status, description, due_date, created_at, updated_at,
         guest_name, guest_contact,
         assignee:assignee_id ( id, name ),
         creator:created_by ( id, name )`
      )
      .order("updated_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (search) query = query.or(`title.ilike.%${search}%,property_address.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async function getCase(id) {
    const { data, error } = await sb()
      .from("cases")
      .select(
        `id, title, property_address, status, description, due_date, created_at, updated_at,
         assignee_id, created_by, guest_name, guest_contact,
         assignee:assignee_id ( id, name ),
         creator:created_by ( id, name )`
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async function submitGuestCase({ guest_name, guest_contact, title, property_address, description }) {
    const { data, error } = await sb()
      .from("cases")
      .insert({ guest_name, guest_contact, title, property_address, description })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function lookupGuestCases(guestName, guestContact) {
    const { data, error } = await sb().rpc("lookup_my_cases", {
      p_name: guestName,
      p_contact: guestContact,
    });
    if (error) throw error;
    return data;
  }

  async function createCase(payload) {
    const { data, error } = await sb().from("cases").insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function updateCase(id, payload) {
    const { data, error } = await sb().from("cases").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteCase(id) {
    const { error } = await sb().from("cases").delete().eq("id", id);
    if (error) throw error;
  }

  async function listAttachments(caseId) {
    const { data, error } = await sb()
      .from("attachments")
      .select("id, file_name, file_path, created_at, uploaded_by:uploaded_by ( name )")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function uploadAttachment(caseId, file, userId) {
    const path = `${caseId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await sb().storage.from("attachments").upload(path, file);
    if (uploadError) throw uploadError;

    const { data, error } = await sb()
      .from("attachments")
      .insert({ case_id: caseId, file_path: path, file_name: file.name, uploaded_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function downloadAttachmentUrl(path) {
    const { data, error } = await sb().storage.from("attachments").createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  }

  async function deleteAttachment(id, path) {
    const { error: storageError } = await sb().storage.from("attachments").remove([path]);
    if (storageError) throw storageError;
    const { error } = await sb().from("attachments").delete().eq("id", id);
    if (error) throw error;
  }

  async function listStatusHistory(caseId) {
    const { data, error } = await sb()
      .from("status_history")
      .select("id, old_status, new_status, changed_at, changed_by:changed_by ( name )")
      .eq("case_id", caseId)
      .order("changed_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  return {
    getSession,
    signIn,
    signOut,
    getMyProfile,
    listProfiles,
    listCases,
    getCase,
    submitGuestCase,
    lookupGuestCases,
    createCase,
    updateCase,
    deleteCase,
    listAttachments,
    uploadAttachment,
    downloadAttachmentUrl,
    deleteAttachment,
    listStatusHistory,
  };
})();
