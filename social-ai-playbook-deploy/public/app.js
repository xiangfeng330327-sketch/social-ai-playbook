/* ============================================
   ContentForge — App Logic (ES Module)
   ============================================ */

const state = {
  mode: "playbook",
  passwordRequired: false,
  serverKeyConfigured: false,
  historyStore: "memory",
  historyItems: []
};

const elements = {
  link: document.querySelector("#link"),
  sourceText: document.querySelector("#sourceText"),
  commentsText: document.querySelector("#commentsText"),
  note: document.querySelector("#note"),
  result: document.querySelector("#result"),
  refineInstruction: document.querySelector("#refineInstruction"),
  status: document.querySelector("#status"),
  usage: document.querySelector("#usage"),
  apiKey: document.querySelector("#apiKey"),
  appPassword: document.querySelector("#appPassword"),
  model: document.querySelector("#model"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsButtons: document.querySelectorAll(".js-settings-button"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  clearKeyButton: document.querySelector("#clearKeyButton"),
  collectorLink: document.querySelector("#collectorLink"),
  copyCollectorButton: document.querySelector("#copyCollectorButton"),
  importCollectedButton: document.querySelector("#importCollectedButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  customRefineButton: document.querySelector("#customRefineButton"),
  refineButtons: document.querySelectorAll(".refine-button"),
  fetchButton: document.querySelector("#fetchButton"),
  copyButton: document.querySelector("#copyButton"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  navItems: document.querySelectorAll(".nav-item[data-view]"),
  workspaceView: document.querySelector("#workspaceView"),
  historyView: document.querySelector("#historyView"),
  historyButtons: document.querySelectorAll(".js-history-button"),
  refreshHistoryButton: document.querySelector("#refreshHistoryButton"),
  backToWorkspaceButton: document.querySelector("#backToWorkspaceButton"),
  historySearch: document.querySelector("#historySearch"),
  historyList: document.querySelector("#historyList"),
  historyStoreBadge: document.querySelector("#historyStoreBadge")
};

// Initialize
await loadConfig();
restoreSettings();
setupCollector();
setRefineAvailable(false);

// ===== Event Listeners =====

// Settings
elements.settingsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    elements.apiKey.value = localStorage.getItem("deepseek_api_key") || "";
    elements.appPassword.value = localStorage.getItem("app_password") || "";
    elements.settingsDialog.showModal();
  });
});

elements.saveSettingsButton.addEventListener("click", () => {
  localStorage.setItem("deepseek_api_key", elements.apiKey.value.trim());
  localStorage.setItem("app_password", elements.appPassword.value.trim());
  localStorage.setItem("deepseek_model", elements.model.value);
  showToast("设置已保存", "success");
});

elements.clearKeyButton.addEventListener("click", () => {
  localStorage.removeItem("deepseek_api_key");
  localStorage.removeItem("app_password");
  elements.apiKey.value = "";
  elements.appPassword.value = "";
  showToast("已清除 API Key 和访问密码");
});

// Navigation
elements.navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    showView(item.dataset.view);
  });
});

elements.historyButtons.forEach((button) => {
  button.addEventListener("click", () => showView("history"));
});

elements.backToWorkspaceButton.addEventListener("click", () => showView("workspace"));
elements.refreshHistoryButton.addEventListener("click", () => loadHistory());
elements.historySearch.addEventListener("input", () => renderHistoryList());

// Collector
elements.copyCollectorButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(getCollectorScript());
  showToast("已复制采集脚本到剪贴板", "success");
});

elements.importCollectedButton.addEventListener("click", async () => {
  setBusy(elements.importCollectedButton, true, "导入中…");
  try {
    const response = await fetch("/api/latest-import", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "导入失败");
    if (!data.item?.text) throw new Error("还没有收到采集内容。小红书/抖音请先在页面点击采集书签。");
    applyCollectedItem(data.item);
    showToast("已导入最近一次浏览器采集内容", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(elements.importCollectedButton, false, "导入采集");
  }
});

// Mode Switcher
elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    elements.modeButtons.forEach((b) => b.classList.toggle("active", b === button));
  });
});

// Refine
elements.refineButtons.forEach((button) => {
  button.addEventListener("click", () => refineResult(button.dataset.action, ""));
});

elements.customRefineButton.addEventListener("click", () => {
  refineResult("custom", elements.refineInstruction.value.trim());
});

// Fetch URL
elements.fetchButton.addEventListener("click", async () => {
  const url = elements.link.value.trim();
  if (!url) { showToast("请先粘贴链接", "error"); return; }
  if (isProtectedPlatform(url)) {
    const collector = document.querySelector(".collector-card");
    if (collector) collector.open = true;
    showToast("小红书/抖音请用「浏览器采集助手」获取内容", "error");
    return;
  }
  setBusy(elements.fetchButton, true, "抽取中…");
  setStatus("正在尝试抽取网页文本…");
  try {
    const response = await fetch("/api/fetch-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "抽取失败");
    if (!data.text) throw new Error("没有抽取到可用文本，请手动粘贴正文或字幕。");
    elements.sourceText.value = mergeText(elements.sourceText.value, data.text);
    showToast("已抽取网页文本", "success");
    setStatus("");
  } catch (error) {
    showToast(error.message, "error");
    setStatus("");
  } finally {
    setBusy(elements.fetchButton, false, "抽取");
  }
});

// Analyze
elements.analyzeButton.addEventListener("click", async () => {
  const apiKey = localStorage.getItem("deepseek_api_key") || "";
  const link = elements.link.value.trim();
  const sourceText = elements.sourceText.value.trim();
  const commentsText = elements.commentsText.value.trim();
  const note = elements.note.value.trim();
  const model = localStorage.getItem("deepseek_model") || elements.model.value || "deepseek-chat";

  if (!state.serverKeyConfigured && !apiKey) {
    elements.settingsDialog.showModal();
    showToast("请先在设置里填写 DeepSeek API Key", "error");
    return;
  }
  if (state.passwordRequired && !localStorage.getItem("app_password")) {
    elements.settingsDialog.showModal();
    showToast("请先在设置里填写访问密码", "error");
    return;
  }
  if (!link && !sourceText && !commentsText) {
    showToast("请至少填写可播放链接，或粘贴正文/评论区内容", "error");
    return;
  }

  setBusy(elements.analyzeButton, true, "生成中…");
  elements.result.classList.remove("empty");
  elements.result.innerHTML = '<div class="loading-text" style="color:var(--ink-muted);text-align:center;padding:40px 20px;">正在让 AI 提炼内容，请稍候…</div>';
  elements.usage.textContent = "";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ link, sourceText, commentsText, note, mode: state.mode, model })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");
    elements.result.textContent = data.result || "没有返回内容。";
    setRefineAvailable(Boolean(data.result));
    saveHistoryItem({
      link,
      sourceText,
      commentsText,
      note,
      mode: state.mode,
      result: data.result || ""
    });
    if (data.usage) {
      elements.usage.textContent = `${data.usage.total_tokens ?? "-"} tokens`;
    }
    showToast("提炼完成", "success");
  } catch (error) {
    elements.result.innerHTML = '';
    elements.result.classList.add("empty");
    elements.result.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="empty-title">等待提炼</p><span class="empty-desc">总结 · 评论区洞察 · 写作判断 · 方法论 · 攻略 · 转化方案</span></div>`;
    setRefineAvailable(false);
    showToast(error.message, "error");
  } finally {
    setBusy(elements.analyzeButton, false, "生成提炼");
  }
});

// Enter key on link input
elements.link.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.sourceText.focus();
  }
});

// Copy result
elements.copyButton.addEventListener("click", async () => {
  const text = elements.result.textContent.trim();
  if (!text || elements.result.classList.contains("empty")) {
    showToast("还没有可复制的结果", "error");
    return;
  }
  await navigator.clipboard.writeText(text);
  showToast("已复制到剪贴板", "success");
});

// ===== Functions =====

async function refineResult(action, instruction) {
  const apiKey = localStorage.getItem("deepseek_api_key") || "";
  const originalResult = elements.result.textContent.trim();
  const model = localStorage.getItem("deepseek_model") || elements.model.value || "deepseek-chat";

  if (!state.serverKeyConfigured && !apiKey) {
    elements.settingsDialog.showModal();
    showToast("请先填写 DeepSeek API Key", "error");
    return;
  }
  if (state.passwordRequired && !localStorage.getItem("app_password")) {
    elements.settingsDialog.showModal();
    showToast("请先填写访问密码", "error");
    return;
  }
  if (!originalResult || elements.result.classList.contains("empty")) {
    showToast("请先生成提炼结果，再继续分析", "error");
    return;
  }

  setRefineBusy(true);
  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ originalResult, instruction, action, model })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "继续分析失败");
    elements.result.classList.remove("empty");
    elements.result.textContent = `${originalResult}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n# 二次干预分析\n\n${data.result || "没有返回内容。"}`;
    if (data.usage) {
      elements.usage.textContent = `${data.usage.total_tokens ?? "-"} tokens`;
    }
    showToast("二次分析已追加", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setRefineBusy(false);
  }
}

function setRefineBusy(busy) {
  elements.customRefineButton.disabled = busy;
  elements.customRefineButton.textContent = busy ? "分析中…" : "继续分析";
  elements.refineButtons.forEach((button) => { button.disabled = busy; });
}

function setRefineAvailable(available) {
  elements.customRefineButton.disabled = !available;
  elements.refineInstruction.disabled = !available;
  elements.refineButtons.forEach((button) => {
    button.disabled = !available;
  });
}

function restoreSettings() {
  const model = localStorage.getItem("deepseek_model");
  if (model) elements.model.value = model;
  if (state.serverKeyConfigured) {
    elements.apiKey.placeholder = "云端已配置，无需填写";
  }
  if (!state.passwordRequired) {
    elements.appPassword.placeholder = "本地运行可留空";
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    state.passwordRequired = Boolean(data.passwordRequired);
    state.serverKeyConfigured = Boolean(data.serverKeyConfigured);
    state.historyStore = data.historyStore || "memory";
  } catch {
    state.passwordRequired = false;
    state.serverKeyConfigured = false;
    state.historyStore = "memory";
  }
}

function showView(view) {
  const isHistory = view === "history";
  elements.workspaceView.hidden = isHistory;
  elements.historyView.hidden = !isHistory;
  elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));

  if (isHistory) {
    elements.historyStoreBadge.textContent = historyStoreLabel();
    loadHistory();
  }
}

async function loadHistory() {
  if (state.historyStore === "browser") {
    state.historyItems = loadBrowserHistory();
    elements.historyStoreBadge.textContent = historyStoreLabel();
    renderHistoryList();
    return;
  }

  setBusy(elements.refreshHistoryButton, true, "刷新中…");
  try {
    const response = await fetch("/api/history", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取历史失败");
    state.historyItems = data.items || [];
    state.historyStore = data.store || state.historyStore;
    elements.historyStoreBadge.textContent = historyStoreLabel();
    renderHistoryList();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(elements.refreshHistoryButton, false, "刷新");
  }
}

async function saveHistoryItem(payload) {
  if (!payload.result) return;
  const title = buildHistoryTitle(payload);
  if (state.historyStore === "browser") {
    const item = buildBrowserHistoryItem({ ...payload, title });
    state.historyItems = [item, ...loadBrowserHistory()].slice(0, 200);
    saveBrowserHistory(state.historyItems);
    return;
  }

  try {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...payload, title })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "历史保存失败");
    state.historyItems = [data.item, ...state.historyItems.filter((item) => item.id !== data.item.id)].slice(0, 200);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderHistoryList() {
  const keyword = elements.historySearch.value.trim().toLowerCase();
  const items = state.historyItems.filter((item) => {
    if (!keyword) return true;
    return [item.title, item.link, item.note, item.result]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(keyword));
  });

  if (!items.length) {
    elements.historyList.innerHTML = `<div class="history-empty">${keyword ? "没有匹配的历史记录。" : "暂无历史记录。生成一次提炼后，会自动保存到这里。"}</div>`;
    return;
  }

  elements.historyList.innerHTML = items.map((item) => `
    <article class="history-card" data-id="${escapeHtml(item.id)}">
      <div class="history-card-main">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(excerpt(item.result, 140))}</p>
        <div class="history-meta">
          <span>${formatDate(item.createdAt)}</span>
          <span>${escapeHtml(modeLabel(item.mode))}</span>
          ${item.link ? `<span>${escapeHtml(shortLink(item.link))}</span>` : ""}
        </div>
      </div>
      <div class="history-card-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="open">打开</button>
        <button class="btn btn-outline btn-sm" type="button" data-action="delete">删除</button>
      </div>
    </article>
  `).join("");

  elements.historyList.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const item = state.historyItems.find((entry) => entry.id === card.dataset.id);
      if (!item) return;
      if (button.dataset.action === "open") openHistoryItem(item);
      if (button.dataset.action === "delete") deleteHistoryItem(item.id);
    });
  });
}

function openHistoryItem(item) {
  elements.link.value = item.link || "";
  elements.sourceText.value = item.sourceText || "";
  elements.commentsText.value = item.commentsText || "";
  elements.note.value = item.note || "";
  elements.result.classList.remove("empty");
  elements.result.textContent = item.result || "";
  elements.usage.textContent = "";
  setRefineAvailable(Boolean(item.result));
  showView("workspace");
  showToast("已打开历史记录", "success");
}

async function deleteHistoryItem(id) {
  if (state.historyStore === "browser") {
    state.historyItems = loadBrowserHistory().filter((item) => item.id !== id);
    saveBrowserHistory(state.historyItems);
    renderHistoryList();
    showToast("历史记录已删除", "success");
    return;
  }

  try {
    const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "删除失败");
    state.historyItems = state.historyItems.filter((item) => item.id !== id);
    renderHistoryList();
    showToast("历史记录已删除", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function historyStoreLabel() {
  if (state.historyStore === "file") return "cloud file store";
  if (state.historyStore === "browser") return "browser local store";
  return "memory store";
}

function buildBrowserHistoryItem(payload) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: String(payload.title || "").slice(0, 120) || "未命名提炼",
    link: payload.link || "",
    mode: payload.mode || "playbook",
    note: payload.note || "",
    sourceText: payload.sourceText || "",
    commentsText: payload.commentsText || "",
    result: payload.result || "",
    createdAt: new Date().toISOString()
  };
}

function loadBrowserHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("contentforge_history") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    return [];
  }
}

function saveBrowserHistory(items) {
  localStorage.setItem("contentforge_history", JSON.stringify(items.slice(0, 200)));
}

function buildHistoryTitle(payload) {
  if (payload.link) {
    try {
      return new URL(payload.link).hostname.replace(/^www\./, "");
    } catch {}
  }
  const source = payload.sourceText || payload.commentsText || payload.note || "内容提炼";
  return source.replace(/\s+/g, " ").slice(0, 32);
}

function modeLabel(mode) {
  return { playbook: "攻略", research: "复盘", content: "发布" }[mode] || "提炼";
}

function excerpt(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function shortLink(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.slice(0, 32);
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setupCollector() {
  const script = getCollectorScript();
  elements.collectorLink.href = script;
  elements.collectorLink.addEventListener("click", (event) => {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      event.preventDefault();
      showToast("请把「采集当前页」拖到书签栏使用", "error");
    }
  });
}

function getCollectorScript() {
  const endpoint = `${location.origin}/api/import${localStorage.getItem("app_password") ? `?password=${encodeURIComponent(localStorage.getItem("app_password"))}` : ""}`;
  const code = `(()=>{const clean=(s)=>String(s||'').replace(/\\s+/g,' ').trim();const data={url:location.href,title:document.title,text:clean(document.body&&document.body.innerText).slice(0,60000)};fetch('${endpoint}',{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(data)});alert('已发送到 AI 内容攻略提炼器。回到工具点击"导入采集"。');})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

function applyCollectedItem(item) {
  const titleLine = item.title ? `标题：${item.title}` : "";
  const urlLine = item.url ? `来源：${item.url}` : "";
  const { body, comments } = splitCollectedText(item.text || "");
  if (item.url) elements.link.value = item.url;
  elements.sourceText.value = mergeText(elements.sourceText.value, [titleLine, urlLine, body].filter(Boolean).join("\n\n"));
  if (comments) {
    elements.commentsText.value = mergeText(elements.commentsText.value, comments);
  }
}

function splitCollectedText(text) {
  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();
  const markers = ["全部评论", "热门评论", "评论", "精选评论", "共 条评论"];
  const positions = markers
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index > 80);
  const splitAt = positions.length ? Math.min(...positions) : -1;
  if (splitAt === -1) {
    return { body: normalized.slice(0, 28000), comments: "" };
  }
  return {
    body: normalized.slice(0, splitAt).trim().slice(0, 28000),
    comments: normalized.slice(splitAt).trim().slice(0, 28000)
  };
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (!button.dataset.idleHtml) {
    button.dataset.idleHtml = button.innerHTML;
  }
  if (busy) {
    button.textContent = label;
  } else if (button.dataset.idleHtml.includes("<svg")) {
    button.innerHTML = button.dataset.idleHtml;
  } else {
    button.textContent = label;
  }
}

function mergeText(current, incoming) {
  if (!current.trim()) return incoming;
  return `${current.trim()}\n\n--- 自动抽取文本 ---\n${incoming}`;
}

function authHeaders() {
  const headers = {};
  const apiKey = localStorage.getItem("deepseek_api_key") || "";
  const appPassword = localStorage.getItem("app_password") || "";
  if (!state.serverKeyConfigured && apiKey) headers["X-DeepSeek-API-Key"] = apiKey;
  if (appPassword) headers["X-App-Password"] = appPassword;
  return headers;
}

function isProtectedPlatform(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return [
      "douyin.com",
      "iesdouyin.com",
      "xiaohongshu.com",
      "xhslink.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

// Toast Notification System
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 200ms ease forwards";
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}
