import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
let latestImport = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        passwordRequired: Boolean(process.env.APP_PASSWORD),
        serverKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY)
      });
    }

    if (url.pathname.startsWith("/api/") && !isAuthorized(req, url)) {
      return sendJson(res, 401, { error: "访问密码不正确。" });
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      return handleAnalyze(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/refine") {
      return handleRefine(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/fetch-url") {
      return handleFetchUrl(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/import") {
      return handleImport(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/latest-import") {
      return sendJson(res, 200, { item: latestImport });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Social AI Playbook running at http://${host}:${port}`);
});

async function handleAnalyze(req, res) {
  const body = await readJson(req);
  const link = String(body.link || "").trim();
  const sourceText = String(body.sourceText || "").trim();
  const commentsText = String(body.commentsText || "").trim();
  const note = String(body.note || "").trim();
  const mode = String(body.mode || "playbook");
  const model = String(body.model || "deepseek-chat");
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return sendJson(res, 400, { error: "缺少 DeepSeek API Key。可以在页面设置里填写，或写入 .env.local。" });
  }

  if (!link && !sourceText && !commentsText) {
    return sendJson(res, 400, { error: "请至少填写一个链接，或粘贴正文/视频文案/评论区内容。" });
  }

  const prompt = buildPrompt({ link, sourceText, commentsText, note, mode });
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: [
            "你是一个中文 AI 内容研究员、写作策划和实战型增长顾问。",
            "你的任务不是做普通摘要，而是把小红书文章/视频、抖音视频、短内容文案和评论区整理成可直接支撑高质量写作的选题资产。",
            "高质量提炼必须达成：观点清楚、读者需求清楚、方法论可复用、写作角度可展开、攻略可执行、风险边界清楚。",
            "遇到 AI 相关内容时，要主动提炼工作流、工具组合、提示词思路、适用场景、商业机会、增长玩法、风险和可复用攻略。",
            "如果链接内容没有被提供，只能基于用户粘贴的正文和备注分析，不要假装读取了链接。"
          ].join("\n")
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `DeepSeek API 请求失败：${response.status}`;
    return sendJson(res, response.status, { error: message });
  }

  sendJson(res, 200, {
    result: data?.choices?.[0]?.message?.content || "",
    usage: data?.usage || null
  });
}

async function handleRefine(req, res) {
  const body = await readJson(req);
  const originalResult = String(body.originalResult || "").trim();
  const instruction = String(body.instruction || "").trim();
  const action = String(body.action || "expand-needs");
  const model = String(body.model || "deepseek-chat");
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return sendJson(res, 400, { error: "缺少 DeepSeek API Key。可以在页面设置里填写，或写入 .env.local。" });
  }

  if (!originalResult) {
    return sendJson(res, 400, { error: "请先生成提炼结果，再进行干预分析。" });
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.22,
      messages: [
        {
          role: "system",
          content: [
            "你是中文内容策划总编辑，负责对已有提炼结果做二次诊断和增强。",
            "你的目标是帮助用户判断哪些内容值得展开、哪些环节缺证据、还需要补充什么分析需求。",
            "输出要具体、可执行、服务后续写作，不要泛泛而谈。"
          ].join("\n")
        },
        {
          role: "user",
          content: buildRefinePrompt({ originalResult, instruction, action })
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `DeepSeek API 请求失败：${response.status}`;
    return sendJson(res, response.status, { error: message });
  }

  sendJson(res, 200, {
    result: data?.choices?.[0]?.message?.content || "",
    usage: data?.usage || null
  });
}

function buildRefinePrompt({ originalResult, instruction, action }) {
  const actionMap = {
    "expand-needs": "诊断哪些内容和环节需要展开，并补充分析需求",
    "missing-info": "找出素材缺口、论证缺口和需要继续采集的信息",
    "writing-angles": "补充更强的写作角度、标题方向和成稿结构",
    "custom": "按用户自定义要求进行二次分析"
  };

  return `
请基于下面已有的提炼结果，进行二次干预分析。

干预目标：
${actionMap[action] || actionMap["expand-needs"]}

用户补充要求：
${instruction || "无"}

已有提炼结果：
${originalResult}

请按以下结构输出：

# 需要展开的内容
- 列出 5 到 8 个最值得展开的点。
- 每个点说明：为什么值得展开、展开后能提升哪类写作质量、建议写成什么段落。

# 需要补充分析的环节
- 哪些判断现在还太薄。
- 哪些地方需要数据、案例、评论、对比或验证。
- 哪些地方可能存在误读或过度推断。

# 需要继续采集的素材
- 还应该从原视频/文章里采集什么。
- 评论区还应该重点找哪些评论。
- 如果要写成高质量文章，还缺哪些外部资料。

# 写作增强建议
- 标题应该强化什么。
- 开头应该先打哪个痛点。
- 正文哪里应该加案例。
- 哪里应该加步骤、清单或反面提醒。

# 下一轮追问清单
给出 6 到 10 个可以继续问 AI 或继续采集素材的问题，问题要具体。
`.trim();
}

async function handleFetchUrl(req, res) {
  const body = await readJson(req);
  const target = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(target)) {
    return sendJson(res, 400, { error: "请输入 http/https 链接。" });
  }

  const response = await fetch(target, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    }
  });

  const html = await response.text();
  const text = htmlToText(html).slice(0, 18000);
  sendJson(res, 200, {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url,
    text
  });
}

async function handleImport(req, res) {
  const body = await readFlexibleBody(req);
  const imported = {
    url: String(body.url || "").trim(),
    title: String(body.title || "").trim(),
    text: String(body.text || "").trim().slice(0, 60000),
    createdAt: new Date().toISOString()
  };

  if (!imported.text) {
    return sendJson(res, 400, { error: "没有收到可用文本。" });
  }

  latestImport = imported;
  sendCors(res);
  sendJson(res, 200, { ok: true });
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    return sendText(res, 404, "Not found");
  }

  const ext = extname(filePath);
  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  res.end(content);
}

function buildPrompt({ link, sourceText, commentsText, note, mode }) {
  const modeLabel = {
    playbook: "形成可执行攻略",
    research: "偏研究复盘",
    content: "转成可发布内容"
  }[mode] || "形成可执行攻略";

  return `
请分析下面的小红书/抖音内容，输出中文结构化结果。目标：${modeLabel}。

质量目标：
- 不是流水账总结，要产出能直接影响撰写质量的写作前置资产。
- 每一节都要服务后续成稿：帮助确定观点、标题、结构、读者痛点、可执行步骤和差异化角度。
- 如果原素材信息不足，要明确指出缺口，并给出如何补充素材才能写得更好。
- 不要空泛套话。所有方法论、攻略、建议都要尽量绑定原文、评论区或用户备注中的具体信息。

链接：
${link || "未提供"}

正文/视频文案/字幕/网页抽取内容：
${sourceText || "未提供。请提醒用户需要粘贴正文、字幕或视频文案，不能只凭链接猜测。"}

评论区内容：
${commentsText || "未提供。若用户之后补充评论区，请单独分析高赞评论、争议点、用户需求和可转化洞察。"}

我的补充备注：
${note || "无"}

请严格按以下结构输出：

# 一句话结论
用一句话说清这条内容最值得写、最值得收藏的点。必须包含“对象 + 价值 + 原因”。

# 核心总结
- 3 到 6 条，保留关键事实、观点、案例、数据或步骤。
- 区分事实、观点、案例和推论，不要混写。

# 评论区洞察
- 如果提供了评论区，提炼高频问题、高赞观点、争议点、真实需求、潜在购买/学习/行动意图。
- 区分“内容作者观点”和“评论区用户反馈”，不要混在一起。
- 如果评论区没有提供，说明缺失会影响哪些判断。

# 写作价值判断
- 选题价值：这条内容为什么值得写，或者为什么不够值得写。
- 目标读者：最适合写给谁。
- 读者痛点：读者真正想解决什么问题。
- 差异化角度：从哪个角度写，能避免变成普通搬运或复述。
- 可写深度：判断适合写成短帖、长文、教程、清单、案例复盘还是观点文。

# AI 相关判断
- 如果内容与 AI 有关，说明它属于：工具应用 / 工作流 / 模型能力 / 商业机会 / 增长玩法 / 创作方法 / 其他。
- 如果内容与 AI 关系弱，说明“可迁移到 AI 的部分”。

# 方法论提炼
把内容抽象成可复用框架，至少包含：
- 底层逻辑
- 适用场景
- 前置条件
- 操作步骤
- 常见误区
- 复用模板：用一句“当你遇到 X，可以用 Y，通过 Z 达成 W”的形式表达。

# 实操攻略
给出一个可以马上照做的攻略：
1. 准备什么
2. 第一步做什么
3. 如何判断效果
4. 如何迭代
5. 可以复制的提示词/话术/检查清单

# 写作转化方案
- 推荐标题：给 5 个，分别覆盖教程型、反常识型、结果型、避坑型、收藏型。
- 开头切入：给 2 个开头方向，一个偏痛点，一个偏结果。
- 文章大纲：给一个可以直接写作的结构，包含每一节要写什么。
- 可展开素材：列出原素材里最适合展开成段落的点。
- 金句/观点句：给 3 到 5 句，要求具体、有判断，不要鸡汤。

# 机会与风险
- 机会
- 风险
- 避坑建议

# 质量自检
- 观点清楚度：1-5 分，并说明扣分点。
- 可执行度：1-5 分，并说明扣分点。
- 写作可展开度：1-5 分，并说明扣分点。
- 素材缺口：还缺哪些信息会影响成稿质量。
- 下一步建议：为了写出更好的文章，下一步应该补充什么或验证什么。

# 收藏标签
输出 5 到 8 个标签，便于之后检索。
`.trim();
}

function getApiKey(req) {
  const headerKey = req.headers["x-deepseek-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();
  return process.env.DEEPSEEK_API_KEY || "";
}

function isAuthorized(req, url) {
  const password = process.env.APP_PASSWORD || "";
  if (!password) return true;
  const headerPassword = req.headers["x-app-password"];
  const queryPassword = url.searchParams.get("password");
  return headerPassword === password || queryPassword === password;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readFlexibleBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendCors(res) {
  for (const [key, value] of Object.entries(corsHeaders())) {
    res.setHeader(key, value);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-DeepSeek-API-Key,X-App-Password"
  };
}
