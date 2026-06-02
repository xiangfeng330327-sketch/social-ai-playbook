# 云端部署

如果 Render 强制绑卡，推荐先用 Vercel 免费版部署。Vercel 不适合保存云端持久历史，所以免费版会把历史记录保存在你当前浏览器里；生成、继续分析、链接抽取都可以正常使用。

## Vercel 免费部署

1. 把本项目推到 GitHub。
2. 打开 Vercel，新建 Project，选择该 GitHub 仓库。
3. 如果代码在仓库子目录里，Root Directory 选择：
   - `social-ai-playbook-deploy 2`
4. Framework Preset 选择：
   - `Other`
5. Build Command 留空，或填：
   - `npm run build`
6. Output Directory 留空。
7. 设置环境变量：
   - `DEEPSEEK_API_KEY`: 你的 DeepSeek API Key
   - `APP_PASSWORD`: 访问密码
8. 部署完成后打开 Vercel 提供的公网 URL。

公网版建议一定设置 `APP_PASSWORD`，否则任何知道地址的人都能消耗你的 DeepSeek API 额度。

## Render

如果后续愿意使用付费实例或 Render 不再要求绑卡，也可以部署到 Render。

1. 在 Render 新建 Web Service，选择该 GitHub 仓库。
2. 使用以下配置：
   - Runtime: Node
   - Root Directory: `social-ai-playbook-deploy 2`
   - Build Command: `true`
   - Start Command: `node server.js`
3. 设置环境变量：
   - `HOST`: `0.0.0.0`
   - `DEEPSEEK_API_KEY`: 你的 DeepSeek API Key
   - `APP_PASSWORD`: 访问密码
   - `HISTORY_FILE`: 可选，历史记录 JSON 文件路径；需要配合 Render Persistent Disk 才能跨重启保留
