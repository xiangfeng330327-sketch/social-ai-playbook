# AI 内容攻略提炼器

本地运行的小工具，用来把小红书文章/视频链接、抖音视频链接、正文、字幕或笔记整理成：

- 一句话结论
- 核心总结
- AI 相关判断
- 方法论提炼
- 实操攻略
- 机会与风险
- 收藏标签

## 运行

```bash
node server.js
```

打开：

```text
http://localhost:8787
```

## DeepSeek API Key

有两种方式：

1. 在网页右上角设置里填写 DeepSeek API Key。它只会保存在本机浏览器 localStorage。
2. 复制 `.env.example` 为 `.env.local`，写入 `DEEPSEEK_API_KEY`。

## 使用建议

小红书和抖音经常需要登录、动态渲染或反爬。第一版提供“链接抽取”尝试，但最稳定的方式是把正文、视频文案、字幕或你看到的关键内容粘贴到输入框。
