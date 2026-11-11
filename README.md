# AI 背单词小程序（uni-app + Node.js + DeepSeek）

一个「AI 真正参与内容生产」的背单词 Demo：用户选择 **四级 / 六级 / 雅思 / 托福**，后端调用 DeepSeek 现场生成
单词卡片（单词、音标、词性、中文释义、英文例句与翻译、记忆法、干扰项），前端以卡片答题，
答错自动进入错题集，底部 TabBar 可随时查看与复习。

## 目录结构

```
xz-memorize-vocabulary/
├── server/                     # Node.js 后端（Express + openai SDK）
│   ├── src/index.js            # 服务入口
│   ├── src/config.js           # 模型配置、词书定义、key 校验
│   ├── src/services/wordService.js  # DeepSeek 生成 + 缓存池 + 降级
│   ├── src/store/wrongBook.js  # 错题集 JSON 存储
│   ├── src/routes/             # /api/words  /api/wrongbook
│   ├── src/data/fallbackWords.js    # 兜底词库（模型不可用时）
│   ├── scripts/smoke.js        # 冒烟测试
│   └── .env                    # ← 在这里填 DeepSeek Key
└── client/                     # uni-app（Vue3 + Vite）
    └── src/pages/
        ├── index/index.vue     # 首页：选词书 + AI 状态 + 错题入口
        ├── study/study.vue     # 背单词页（百词斩式）
        └── wrong/wrong.vue     # 错题集（TabBar）
```

## 快速开始

### 1. 启动后端

```bash
cd server
npm install
# 编辑 .env，把 DEEPSEEK_API_KEY 换成你的真实 key（https://platform.deepseek.com）
# 模型默认 deepseek-flash，且关闭 thinking，降低首次出题延迟
npm start            # http://localhost:3000
```

未填 key 也能跑通全部流程，此时会自动使用本地兜底词库，页面顶部会显示「降级词库」。
若仍觉得慢：确认 `.env` 里是 `DEEPSEEK_MODEL=deepseek-flash` 且 `DEEPSEEK_THINKING=0`；同词书第二次起会走本地缓存池（默认 12 小时）。

验证接口：

```bash
node scripts/smoke.js
```

### 2. 启动前端

```bash
cd client
npm install
npm run dev:h5         # 浏览器预览 http://localhost:5173
npm run dev:mp-weixin  # 微信小程序，产物在 dist/dev/mp-weixin，用开发者工具导入
```

微信开发者工具导入 `client/dist/dev/mp-weixin`，**详情 → 本地设置 → 勾选「不校验合法域名」**，
因为直连的是 `http://localhost:3000`。真机调试请把 `client/src/config.js` 里的地址改成电脑局域网 IP。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含 AI 是否就绪） |
| GET | `/api/words/ai-status` | 模型名 / 超时 / key 状态 |
| POST | `/api/words/batch` | `{level, count, exclude, refresh}` → AI 生成单词（含 4 个选项） |
| GET | `/api/wrongbook` | 错题分页列表（`number`、`pageSize`；header `x-device-id`） |
| GET | `/api/wrongbook/quiz` | 错题组卷（带选项，可直接作答） |
| POST | `/api/wrongbook` | 收录错题 `{word:{...}}` |
| DELETE | `/api/wrongbook/:word` | 移除单个错题 |
| DELETE | `/api/wrongbook` | 清空错题集 |

## AI 是怎么参与进流程的（不是摆设）

1. **内容全部由模型生成**：`wordService.js` 用提示词要求 DeepSeek 按词书返回严格的 JSON，
   包含释义、例句、翻译、记忆法和 3 个干扰项；释义与例句直接渲染在卡片与解析区。
2. **干扰项也是模型产的**：选项不是随机拼的，而是同级别词义中挑出的合理混淆项，答错才有意义。
3. **结果落盘复用**：同词书结果缓存 12 小时（`data/pool-*.json`），已背过的词通过 `exclude` 去重。
4. **可见的 AI 痕迹**：卡片右上角 `AI 生成` 标签、结束页统计、解析区的「AI 记忆法」都由模型输出驱动。

## 降级策略（作业要求 3）

- 未配置 key / key 是占位符 → 不发请求，直接走本地词库（`fallbackWords.js`）
- 请求超时（默认 20s）、网络错误、返回非法 JSON → 捕获后降级，接口仍返回 200
- 缓存里已有的 AI 单词优先复用，再补本地词，避免降级后立刻重复
- 前端收到 `degraded: true` 时显示提示条，不打断答题流程

## 已知限制

- 无登录，错题集用前端生成的 `deviceId` 隔离，换设备/清缓存会丢失
- 存储为本地 JSON 文件，单机演示够用，多实例需换数据库
- 小程序正式发布需把后端部署到 HTTPS 域名并在后台配置服务器域名
