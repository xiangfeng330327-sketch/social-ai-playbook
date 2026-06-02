# AI 内容攻略提炼器

本地运行的小工具，用来把可播放链接、正文、字幕、评论区或笔记整理成：

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

链接区可以放任何可播放链接。小红书/抖音经常需要登录、动态渲染或反爬，建议使用浏览器采集助手；B站及变色龙可以直接填链接后抽取或生成。
