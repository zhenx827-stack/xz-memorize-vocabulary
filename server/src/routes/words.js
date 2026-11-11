import { Router } from 'express';
import { isValidLevel, LEVELS, config, isKeyReady } from '../config.js';
import { fetchWordBatch } from '../services/wordService.js';

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
 * 生成 / 获取一批单词
 * body: { level: 'cet4'|'cet6'|'ielts'|'toefl', count?: number, exclude?: string[], refresh?: boolean }
 */
wordRouter.post('/batch', async (req, res, next) => {
  try {
    const { level, count = 10, exclude = [], refresh = false } = req.body || {};
    if (!isValidLevel(level)) {
      return res.status(400).json({ ok: false, error: `level 必须是 ${Object.keys(LEVELS).join(' / ')}` });
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 40);
    const safeExclude = Array.isArray(exclude) ? exclude.slice(0, 200).map(String) : [];

    const result = await fetchWordBatch({
      level,
      count: safeCount,
      exclude: safeExclude,
      forceRefresh: Boolean(refresh),
    });

    res.json({ ok: true, level, count: result.words.length, ...result });
  } catch (err) {
    next(err);
  }
});
