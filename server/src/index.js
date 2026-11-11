import express from 'express';
import cors from 'cors';
import { config, isKeyReady, LEVELS } from './config.js';
import { wordRouter } from './routes/words.js';
import { wrongRouter } from './routes/wrongbook.js';
import { warmWordPools } from './services/wordService.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'vocab-ai-server',
    aiReady: isKeyReady(),
    model: config.deepseek.model,
    levels: Object.keys(LEVELS),
    uptime: Math.round(process.uptime()),
  });
});

app.use('/api/words', wordRouter);
app.use('/api/wrongbook', wrongRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `接口不存在: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: err.message || '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log('──────────────────────────────────────────────');
  console.log(`  AI 背单词服务已启动: http://localhost:${config.port}`);
  console.log(`  模型: ${config.deepseek.model}  (${config.deepseek.baseURL})`);
  console.log(`  密钥: ${isKeyReady() ? '已配置 ✓' : '未配置 → 自动降级本地词库'}`);
  console.log('──────────────────────────────────────────────');
  // 启动即后台预热各词书缓存，避免用户第一次点进去才等模型
  const warm = warmWordPools();
  if (warm.ok) console.log(`  预热: ${warm.message}`);
});
