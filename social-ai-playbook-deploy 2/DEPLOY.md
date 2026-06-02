# 云端部署

推荐 Render，因为当前工具需要一个常驻 Node 服务来保存最近一次浏览器采集内容。

## Render

1. 把本项目推到 GitHub。
2. 在 Render 新建 Web Service，选择该 GitHub 仓库。
3. 使用以下配置：
   - Runtime: Node
   - Build Command: 留空
   - Start Command: `node server.js`
4. 设置环境变量：
   - `DEEPSEEK_API_KEY`: 你的 DeepSeek API Key
   - `APP_PASSWORD`: 访问密码
   - `HISTORY_FILE`: 可选，历史记录 JSON 文件路径；需要配合 Render Persistent Disk 才能跨重启保留
5. 部署完成后打开 Render 提供的公网 URL。

公网版建议一定设置 `APP_PASSWORD`，否则任何知道地址的人都能消耗你的 DeepSeek API 额度。
