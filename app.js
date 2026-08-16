// ============================================================================
// 화면 렌더링 및 상태 관리 (프레임워크 없이 순수 JS로 작성)
// ============================================================================
(function () {
  const cfg = window.APP_CONFIG;
  const el = (id) => document.getElementById(id);

  const VIEWS = ["guest-home", "guest-submit-view", "guest-lookup-view", "login-view", "app-view"];

  const state = {
    session: null,
    profile: null,
    profiles: [],
    cases: [],
    filterStatus: "",
    search: "",
    activeCaseId: null,
  };

  function statusColor(status) {
    const found = cfg.STATUS_OPTIONS.find((s) => s.value === status);
    return found ? found.color : "#64748b";
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showToast(message, isError = false) {
    const toast = el("toast");
    toast.textContent = message;
    toast.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => (toast.className = "toast"), 3200);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function showView(name) {
    VIEWS.forEach((v) => el(v).classList.toggle("hidden", v !== name));
  }

  // ---- 초기화 / 인증 ----------------------------------------------------------

  async function init() {
    document.title = cfg.APP_TITLE;
    el("app-title").textContent = cfg.APP_TITLE;
    el("home-title").textContent = cfg.APP_TITLE;
    el("login-title").textContent = "관리자 로그인";
    buildStatusFilterOptions();
    buildFormStatusOptions();
    bindEvents();

    try {
      state.session = await Api.getSession();
    } catch (e) {
      console.error(e);
    }

    if (state.session) {
      await enterApp();
    } else {
      showView("guest-home");
    }

    if (window.sb) {
      window.sb.auth.onAuthStateChange((event, session) => {
        state.session = session;
        if (event === "SIGNED_OUT") showView("guest-home");
      });
    }
  }

  async function enterApp() {
    try {
      state.profile = await Api.getMyProfile(state.session.user.id);
    } catch (e) {
      showToast("프로필을 불러오지 못했습니다: " + e.message, true);
      return;
    }
    showView("app-view");
    el("user-name").textContent = `${state.profile.name}${
      state.profile.role === "admin" ? " (관리자)" : ""
    }`;

    try {
      state.profiles = await Api.listProfiles();
      buildAssigneeOptions();
    } catch (e) {
      console.error(e);
    }

    await refreshCases();
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    const email = el("login-email").value.trim();
    const password = el("login-password").value;
    const btn = el("login-submit");
    btn.disabled = true;
    btn.textContent = "로그인 중...";
    try {
      const data = await Api.signIn(email, password);
      state.session = data.session;
      await enterApp();
    } catch (e) {
      showToast("로그인 실패: " + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  }

  async function handleLogout() {
    await Api.signOut();
    state.profile = null;
    state.cases = [];
    showView("guest-home");
  }

  // ---- 게스트: 새 요청 등록 ---------------------------------------------------

  function resetGuestSubmitView() {
    el("guest-submit-form").reset();
    el("guest-submit-form-wrap").classList.remove("hidden");
    el("guest-submit-success-wrap").classList.add("hidden");
  }

  async function handleGuestSubmit(ev) {
    ev.preventDefault();
    const payload = {
      guest_name: el("guest-name").value.trim(),
      guest_contact: el("guest-contact").value.trim(),
      title: el("guest-title").value.trim(),
      property_address: el("guest-address").value.trim(),
      description: el("guest-description").value.trim(),
    };

    if (!payload.guest_name || !payload.guest_contact || !payload.title) {
      showToast("이름, 연락처, 제목은 필수입니다.", true);
      return;
    }

    const btn = el("guest-submit-btn");
    btn.disabled = true;
    try {
      await Api.submitGuestCase(payload);
      el("guest-submit-summary-name").textContent = payload.guest_name;
      el("guest-submit-summary-contact").textContent = payload.guest_contact;
      el("guest-submit-form-wrap").classList.add("hidden");
      el("guest-submit-success-wrap").classList.remove("hidden");
    } catch (e) {
      showToast("등록 실패: " + e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  // ---- 게스트: 내 요청 조회 ---------------------------------------------------

  function resetGuestLookupView() {
    el("guest-lookup-form").reset();
    el("guest-lookup-results").innerHTML = "";
  }

  async function handleGuestLookup(ev) {
    ev.preventDefault();
    const name = el("lookup-name").value.trim();
    const contact = el("lookup-contact").value.trim();
    if (!name || !contact) {
      showToast("이름과 연락처를 입력해주세요.", true);
      return;
    }

    const resultsWrap = el("guest-lookup-results");
    resultsWrap.innerHTML = `<p class="muted">조회 중...</p>`;
    try {
      const rows = await Api.lookupGuestCases(name, contact);
      if (!rows || rows.length === 0) {
        resultsWrap.innerHTML = `<p class="muted">일치하는 요청 내역이 없습니다. 이름/연락처를 다시 확인해주세요.</p>`;
        return;
      }
      resultsWrap.innerHTML = "";
      rows.forEach((c) => {
        const div = document.createElement("div");
        div.className = "lookup-item";
        div.innerHTML = `
          <div class="lookup-item-head">
            <strong>${escapeHtml(c.title)}</strong>
            <span class="badge" style="--badge-color:${statusColor(c.status)}">${c.status}</span>
          </div>
          <div class="cell-sub">${escapeHtml(c.property_address || "")}</div>
          ${c.description ? `<p class="lookup-desc">${escapeHtml(c.description)}</p>` : ""}
          <div class="muted">접수일 ${fmtDate(c.created_at)} · 최근 업데이트 ${fmtDateTime(c.updated_at)}</div>
        `;
        resultsWrap.appendChild(div);
      });
    } catch (e) {
      resultsWrap.innerHTML = "";
      showToast("조회 실패: " + e.message, true);
    }
  }

  // ---- 관리자: 목록 / 필터 -----------------------------------------------------

  function buildStatusFilterOptions() {
    const wrap = el("status-filter");
    wrap.innerHTML = `<button class="chip active" data-status="">전체</button>`;
    cfg.STATUS_OPTIONS.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.status = s.value;
      btn.textContent = s.value;
      btn.style.setProperty("--chip-color", s.color);
      wrap.appendChild(btn);
    });
    wrap.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".chip");
      if (!btn) return;
      wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      state.filterStatus = btn.dataset.status;
      refreshCases();
    });
  }

  function buildFormStatusOptions() {
    const sel = el("form-status");
    sel.innerHTML = "";
    cfg.STATUS_OPTIONS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.value;
      opt.textContent = s.value;
      sel.appendChild(opt);
    });
  }

  function buildAssigneeOptions() {
    ["form-assignee", "filter-assignee"].forEach((id) => {
      const sel = el(id);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = id === "filter-assignee" ? `<option value="">담당자 전체</option>` : `<option value="">미지정</option>`;
      state.profiles.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      if (current) sel.value = current;
    });
  }

  async function refreshCases() {
    el("board-loading").classList.remove("hidden");
    try {
      state.cases = await Api.listCases({ status: state.filterStatus, search: state.search });
      renderBoard();
    } catch (e) {
      showToast("목록을 불러오지 못했습니다: " + e.message, true);
    } finally {
      el("board-loading").classList.add("hidden");
    }
  }

  function renderBoard() {
    const tbody = el("board-body");
    tbody.innerHTML = "";

    let rows = state.cases;
    const assigneeFilter = el("filter-assignee").value;
    if (assigneeFilter) {
      rows = rows.filter((c) => c.assignee && c.assignee.id === assigneeFilter);
    }

    el("board-count").textContent = `총 ${rows.length}건`;

    if (rows.length === 0) {
      el("board-empty").classList.remove("hidden");
    } else {
      el("board-empty").classList.add("hidden");
    }

    rows.forEach((c) => {
      const requesterCell = c.guest_name
        ? `${escapeHtml(c.guest_name)} <span class="tag-guest">고객</span>`
        : escapeHtml(c.creator ? c.creator.name : "관리자");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="cell-title">
          <a href="#" data-open="${c.id}">${escapeHtml(c.title)}</a>
          <div class="cell-sub">${escapeHtml(c.property_address || "")}</div>
        </td>
        <td><span class="badge" style="--badge-color:${statusColor(c.status)}">${c.status}</span></td>
        <td>${c.assignee ? escapeHtml(c.assignee.name) : '<span class="muted">미지정</span>'}</td>
        <td>${requesterCell}</td>
        <td>${fmtDate(c.due_date)}</td>
        <td>${fmtDateTime(c.updated_at)}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-open]").forEach((a) => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        openDetail(Number(a.dataset.open));
      });
    });
  }

  let searchTimer = null;
  function handleSearchInput(ev) {
    state.search = ev.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshCases, 350);
  }

  // ---- 관리자: 등록 / 수정 모달 -------------------------------------------------

  function openNewCaseModal() {
    el("modal-title").textContent = "검토 건 등록";
    el("case-form").reset();
    el("form-case-id").value = "";
    el("form-status-row").classList.add("hidden");
    el("requester-info").classList.add("hidden");
    el("delete-case-btn").classList.add("hidden");
    el("case-modal").classList.remove("hidden");
  }

  async function openDetail(id) {
    try {
      const c = await Api.getCase(id);
      state.activeCaseId = id;
      el("modal-title").textContent = "검토 건 상세";
      el("form-case-id").value = c.id;
      el("form-title").value = c.title;
      el("form-address").value = c.property_address || "";
      el("form-description").value = c.description || "";
      el("form-due-date").value = c.due_date || "";
      el("form-assignee").value = c.assignee_id || "";
      el("form-status").value = c.status;
      el("form-status-row").classList.remove("hidden");

      const requesterInfo = el("requester-info");
      requesterInfo.textContent = c.guest_name
        ? `신청자: ${c.guest_name} (${c.guest_contact}) · 고객 신청`
        : `등록자: ${c.creator ? c.creator.name : "관리자"} · 관리자 등록`;
      requesterInfo.classList.remove("hidden");

      el("delete-case-btn").classList.remove("hidden");

      el("case-modal").classList.remove("hidden");
      await renderAttachments(id);
      await renderHistory(id);
    } catch (e) {
      showToast("상세 정보를 불러오지 못했습니다: " + e.message, true);
    }
  }

  async function renderAttachments(caseId) {
    const list = el("attachment-list");
    list.innerHTML = `<li class="muted">불러오는 중...</li>`;
    try {
      const attachments = await Api.listAttachments(caseId);
      if (attachments.length === 0) {
        list.innerHTML = `<li class="muted">첨부된 파일이 없습니다.</li>`;
        return;
      }
      list.innerHTML = "";
      attachments.forEach((a) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <a href="#" data-download="${a.file_path}">${escapeHtml(a.file_name)}</a>
          <span class="muted"> · ${a.uploaded_by ? escapeHtml(a.uploaded_by.name) : ""} · ${fmtDateTime(a.created_at)}</span>
          <button class="icon-btn" data-remove-attachment="${a.id}" data-path="${a.file_path}" title="삭제">✕</button>
        `;
        list.appendChild(li);
      });
      list.querySelectorAll("[data-download]").forEach((a) =>
        a.addEventListener("click", async (ev) => {
          ev.preventDefault();
          try {
            const url = await Api.downloadAttachmentUrl(a.dataset.download);
            window.open(url, "_blank");
          } catch (e) {
            showToast("다운로드 실패: " + e.message, true);
          }
        })
      );
      list.querySelectorAll("[data-remove-attachment]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (!confirm("첨부파일을 삭제하시겠습니까?")) return;
          try {
            await Api.deleteAttachment(btn.dataset.removeAttachment, btn.dataset.path);
            renderAttachments(caseId);
          } catch (e) {
            showToast("삭제 실패: " + e.message, true);
          }
        })
      );
    } catch (e) {
      list.innerHTML = `<li class="muted">첨부파일을 불러오지 못했습니다.</li>`;
    }
  }

  async function renderHistory(caseId) {
    const wrap = el("status-history");
    wrap.innerHTML = "";
    try {
      const history = await Api.listStatusHistory(caseId);
      history.forEach((h) => {
        const div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = `<span class="muted">${fmtDateTime(h.changed_at)}</span> ${
          h.old_status ? `${h.old_status} → ` : "등록: "
        }<strong>${h.new_status}</strong> <span class="muted">(${h.changed_by ? escapeHtml(h.changed_by.name) : "-"})</span>`;
        wrap.appendChild(div);
      });
    } catch (e) {
      // 이력은 부가 정보이므로 실패해도 조용히 무시
    }
  }

  function closeModal() {
    el("case-modal").classList.add("hidden");
    state.activeCaseId = null;
    el("attachment-file").value = "";
  }

  async function handleCaseSubmit(ev) {
    ev.preventDefault();
    const id = el("form-case-id").value;
    const payload = {
      title: el("form-title").value.trim(),
      property_address: el("form-address").value.trim(),
      description: el("form-description").value.trim(),
      due_date: el("form-due-date").value || null,
      assignee_id: el("form-assignee").value || null,
    };

    if (!payload.title) {
      showToast("제목을 입력해주세요.", true);
      return;
    }

    try {
      if (id) {
        payload.status = el("form-status").value;
        await Api.updateCase(Number(id), payload);
        showToast("수정되었습니다.");
      } else {
        payload.created_by = state.profile.id;
        const created = await Api.createCase(payload);
        showToast("등록되었습니다.");
        state.activeCaseId = created.id;
      }

      const fileInput = el("attachment-file");
      if (state.activeCaseId && fileInput.files.length > 0) {
        for (const file of fileInput.files) {
          await Api.uploadAttachment(state.activeCaseId, file, state.profile.id);
        }
      }

      closeModal();
      await refreshCases();
    } catch (e) {
      showToast("저장 실패: " + e.message, true);
    }
  }

  async function handleDeleteCase() {
    const id = el("form-case-id").value;
    if (!id) return;
    if (!confirm("이 검토 건을 삭제하시겠습니까? 첨부파일도 함께 삭제됩니다.")) return;
    try {
      await Api.deleteCase(Number(id));
      showToast("삭제되었습니다.");
      closeModal();
      await refreshCases();
    } catch (e) {
      showToast("삭제 실패: " + e.message, true);
    }
  }

  async function handleAttachOnly() {
    const id = el("form-case-id").value;
    const fileInput = el("attachment-file");
    if (!id || fileInput.files.length === 0) return;
    try {
      for (const file of fileInput.files) {
        await Api.uploadAttachment(Number(id), file, state.profile.id);
      }
      fileInput.value = "";
      await renderAttachments(Number(id));
      showToast("첨부파일이 업로드되었습니다.");
    } catch (e) {
      showToast("업로드 실패: " + e.message, true);
    }
  }

  // ---- 이벤트 바인딩 ----------------------------------------------------------

  function bindEvents() {
    // 게스트 홈
    el("btn-goto-submit").addEventListener("click", () => {
      resetGuestSubmitView();
      showView("guest-submit-view");
    });
    el("btn-goto-lookup").addEventListener("click", () => {
      resetGuestLookupView();
      showView("guest-lookup-view");
    });
    el("link-admin-login").addEventListener("click", (ev) => {
      ev.preventDefault();
      showView("login-view");
    });

    // 게스트: 새 요청 등록
    el("guest-submit-form").addEventListener("submit", handleGuestSubmit);
    el("btn-submit-back").addEventListener("click", (ev) => {
      ev.preventDefault();
      showView("guest-home");
    });
    el("btn-after-submit-home").addEventListener("click", (ev) => {
      ev.preventDefault();
      showView("guest-home");
    });
    el("btn-after-submit-new").addEventListener("click", () => {
      resetGuestSubmitView();
    });
    el("btn-after-submit-lookup").addEventListener("click", () => {
      resetGuestLookupView();
      showView("guest-lookup-view");
    });

    // 게스트: 내 요청 조회
    el("guest-lookup-form").addEventListener("submit", handleGuestLookup);
    el("btn-lookup-back").addEventListener("click", (ev) => {
      ev.preventDefault();
      showView("guest-home");
    });

    // 관리자 로그인
    el("login-form").addEventListener("submit", handleLogin);
    el("btn-login-back").addEventListener("click", (ev) => {
      ev.preventDefault();
      showView("guest-home");
    });
    el("logout-btn").addEventListener("click", handleLogout);

    // 관리자 화면
    el("new-case-btn").addEventListener("click", openNewCaseModal);
    el("close-modal-btn").addEventListener("click", closeModal);
    el("case-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "case-modal") closeModal();
    });
    el("case-form").addEventListener("submit", handleCaseSubmit);
    el("delete-case-btn").addEventListener("click", handleDeleteCase);
    el("attach-only-btn").addEventListener("click", handleAttachOnly);
    el("search-input").addEventListener("input", handleSearchInput);
    el("filter-assignee").addEventListener("change", renderBoard);
    el("refresh-btn").addEventListener("click", refreshCases);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
