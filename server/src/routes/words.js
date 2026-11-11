import { Router } from 'express';
import { isValidLevel, LEVELS, config, isKeyReady } from '../config.js';
import { fetchWordBatch, warmWordPools } from '../services/wordService.js';

export const wordRouter = Router();

/** 词书列表 */
wordRouter.get('/levels', (_req, res) => {
  res.json({ ok: true, levels: Object.values(LEVELS) });
});

/** AI 服务健康状态，前端首页用来提示 */
wordRouter.get('/ai-status', (_req, res) => {
  res.json({
    ok: true,
    ready: isKeyReady(),
    model: config.deepseek.model,
    baseURL: config.deepseek.baseURL,
    timeoutMs: config.deepseek.timeout,
    thinking: config.deepseek.thinking,
  });
});

/**
 * 预热词库：后台异步生成，接口立刻返回（首页进入时调用，保证点进背单词几乎秒开）
 * body: { levels?: string[] }
 */
wordRouter.post('/warm', (req, res) => {
  const raw = Array.isArray(req.body?.levels) ? req.body.levels : Object.keys(LEVELS);
  const levels = raw.filter(isValidLevel);
  const result = warmWordPools(levels.length ? levels : Object.keys(LEVELS));
  res.json({ ok: true, ...result, levels });
});

/**
 * 获取一批单词（永不阻塞等 DeepSeek：有缓存用缓存，否则本地秒开 + 后台补池）
 * body: { level, count?, exclude?, refresh? }
 * header: x-device-id（有则优先掺入错题复习）
 */
wordRouter.post('/batch', async (req, res, next) => {
  try {
    const { level, count = 10, exclude = [], refresh = false } = req.body || {};
    if (!isValidLevel(level)) {
      return res.status(400).json({ ok: false, error: `level 必须是 ${Object.keys(LEVELS).join(' / ')}` });
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 40);
    const safeExclude = Array.isArray(exclude) ? exclude.slice(0, 200).map(String) : [];
    const deviceId = String(req.header('x-device-id') || req.body?.deviceId || '').slice(0, 64);

    const result = await fetchWordBatch({
      level,
      count: safeCount,
      exclude: safeExclude,
      forceRefresh: Boolean(refresh),
      deviceId,
    });

    res.json({ ok: true, level, count: result.words.length, ...result });
  } catch (err) {
    next(err);
  }
});
