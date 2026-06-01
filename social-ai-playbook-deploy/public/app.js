const state = {
  mode: "playbook",
  passwordRequired: false,
  serverKeyConfigured: false
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
  settingsButton: document.querySelector("#settingsButton"),
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
  segments: document.querySelectorAll(".segment")
};

await loadConfig();
restoreSettings();
setupCollector();

elements.settingsButton.addEventListener("click", () => {
  elements.apiKey.value = localStorage.getItem("deepseek_api_key") || "";
  elements.appPassword.value = localStorage.getItem("app_password") || "";
  elements.settingsDialog.showModal();
});

elements.saveSettingsButton.addEventListener("click", () => {
  localStorage.setItem("deepseek_api_key", elements.apiKey.value.trim());
  localStorage.setItem("app_password", elements.appPassword.value.trim());
  localStorage.setItem("deepseek_model", elements.model.value);
  setStatus("设置已保存。");
});

elements.clearKeyButton.addEventListener("click", () => {
  localStorage.removeItem("deepseek_api_key");
  localStorage.removeItem("app_password");
  elements.apiKey.value = "";
  elements.appPassword.value = "";
  setStatus("已清除本机保存的 API Key 和访问密码。");
});

elements.copyCollectorButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(getCollectorScript());
  setStatus("已复制采集脚本。可以新建书签，把网址改成这段脚本。");
});

elements.importCollectedButton.addEventListener("click", async () => {
  setBusy(elements.importCollectedButton, true, "导入中");
  try {
    const response = await fetch("/api/latest-import", {
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "导入失败");
    if (!data.item?.text) throw new Error("还没有收到采集内容。请先在抖音/小红书页面点击采集书签。");

    applyCollectedItem(data.item);
    setStatus("已导入最近一次浏览器采集内容。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(elements.importCollectedButton, false, "导入采集");
  }
});


elements.segments.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    elements.segments.forEach((item) => item.classList.toggle("active", item === button));
  });
});

elements.refineButtons.forEach((button) => {
  button.addEventListener("click", () => refineResult(button.dataset.action, ""));
});

elements.customRefineButton.addEventListener("click", () => {
  refineResult("custom", elements.refineInstruction.value.trim());
});

elements.fetchButton.addEventListener("click", async () => {
  const url = elements.link.value.trim();
  if (!url) return setStatus("请先粘贴链接。", true);
  if (isProtectedPlatform(url)) {
    document.querySelector(".collector").open = true;
    return setStatus("这类平台不能靠普通链接稳定抓取。请用“浏览器采集助手”：在已登录页面点采集书签，再回这里导入。", true);
  }

  setBusy(elements.fetchButton, true, "抽取中");
  setStatus("正在尝试抽取网页文本。小红书和抖音经常需要登录，抽取失败时请手动粘贴文案。");

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
    setStatus(data.ok ? "已抽取网页文本，请检查是否包含正文。" : `网页返回 ${data.status}，已尽量提取可见文本。`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(elements.fetchButton, false, "抽取");
  }
});

elements.analyzeButton.addEventListener("click", async () => {
  const apiKey = localStorage.getItem("deepseek_api_key") || "";
  const link = elements.link.value.trim();
  const sourceText = elements.sourceText.value.trim();
  const commentsText = elements.commentsText.value.trim();
  const note = elements.note.value.trim();
  const model = localStorage.getItem("deepseek_model") || elements.model.value || "deepseek-chat";

  if (!state.serverKeyConfigured && !apiKey) {
    elements.settingsDialog.showModal();
    return setStatus("请先在设置里填写 DeepSeek API Key。", true);
  }

  if (state.passwordRequired && !localStorage.getItem("app_password")) {
    elements.settingsDialog.showModal();
    return setStatus("请先在设置里填写访问密码。", true);
  }

  if (!link && !sourceText && !commentsText) {
    return setStatus("请至少填写链接，或粘贴正文/视频文案/评论区内容。", true);
  }

  setBusy(elements.analyzeButton, true, "生成中");
  setStatus("正在让 DeepSeek 提炼内容。");
  elements.result.classList.remove("empty");
  elements.result.textContent = "生成中...";
  elements.usage.textContent = "";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ link, sourceText, commentsText, note, mode: state.mode, model })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");

    elements.result.textContent = data.result || "没有返回内容。";
    if (data.usage) {
      elements.usage.textContent = `tokens: ${data.usage.total_tokens ?? "-"} | 输入 ${data.usage.prompt_tokens ?? "-"} / 输出 ${data.usage.completion_tokens ?? "-"}`;
    }
    setStatus("完成。");
  } catch (error) {
    elements.result.textContent = "";
    elements.result.classList.add("empty");
    setStatus(error.message, true);
  } finally {
    setBusy(elements.analyzeButton, false, "生成提炼");
  }
});

elements.link.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.sourceText.focus();
  }
});

elements.copyButton.addEventListener("click", async () => {
  const text = elements.result.textContent.trim();
  if (!text || elements.result.classList.contains("empty")) return setStatus("还没有可复制的结果。", true);
  await navigator.clipboard.writeText(text);
  setStatus("已复制结果。");
});

async function refineResult(action, instruction) {
  const apiKey = localStorage.getItem("deepseek_api_key") || "";
  const originalResult = elements.result.textContent.trim();
  const model = localStorage.getItem("deepseek_model") || elements.model.value || "deepseek-chat";

  if (!state.serverKeyConfigured && !apiKey) {
    elements.settingsDialog.showModal();
    return setStatus("请先在设置里填写 DeepSeek API Key。", true);
  }

  if (state.passwordRequired && !localStorage.getItem("app_password")) {
    elements.settingsDialog.showModal();
    return setStatus("请先在设置里填写访问密码。", true);
  }

  if (!originalResult || elements.result.classList.contains("empty")) {
    return setStatus("请先生成提炼结果，再继续干预分析。", true);
  }

  setRefineBusy(true);
  setStatus("正在基于当前提炼结果继续分析。");

  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ originalResult, instruction, action, model })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "继续分析失败");

    elements.result.classList.remove("empty");
    elements.result.textContent = `${originalResult}\n\n---\n\n# 二次干预分析\n\n${data.result || "没有返回内容。"}`;
    if (data.usage) {
      elements.usage.textContent = `tokens: ${data.usage.total_tokens ?? "-"} | 输入 ${data.usage.prompt_tokens ?? "-"} / 输出 ${data.usage.completion_tokens ?? "-"}`;
    }
    setStatus("二次干预分析已追加到结果末尾。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setRefineBusy(false);
  }
}

function setRefineBusy(busy) {
  elements.customRefineButton.disabled = busy;
  elements.customRefineButton.textContent = busy ? "分析中" : "继续分析";
  elements.refineButtons.forEach((button) => {
    button.disabled = busy;
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
  } catch {
    state.passwordRequired = false;
    state.serverKeyConfigured = false;
  }
}

function setupCollector() {
  const script = getCollectorScript();
  elements.collectorLink.href = script;
  elements.collectorLink.addEventListener("click", (event) => {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      event.preventDefault();
      setStatus("请把“采集当前页”拖到书签栏，然后在抖音/小红书页面点击书签。", true);
    }
  });
}

function getCollectorScript() {
  const endpoint = `${location.origin}/api/import${localStorage.getItem("app_password") ? `?password=${encodeURIComponent(localStorage.getItem("app_password"))}` : ""}`;
  const code = `(()=>{const clean=(s)=>String(s||'').replace(/\\s+/g,' ').trim();const data={url:location.href,title:document.title,text:clean(document.body&&document.body.innerText).slice(0,60000)};fetch('${endpoint}',{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(data)});alert('已发送到 AI 内容攻略提炼器。回到工具点击“导入采集”。');})()`;
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
  button.textContent = label;
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
