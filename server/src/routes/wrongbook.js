import { Router } from 'express';
import { listWrong, addWrong, removeWrong, clearWrong } from '../store/wrongBook.js';
import { withOptions } from '../services/wordService.js';

export const wrongRouter = Router();

/** deviceId 由前端生成并放在 header（x-device-id）或 query 上 */
function getDeviceId(req) {
  return String(req.header('x-device-id') || req.query.deviceId || req.body?.deviceId || '').slice(0, 64);
}

wrongRouter.get('/', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return res.status(400).json({ ok: false, error: '缺少 deviceId' });
  const list = listWrong(deviceId);
  res.json({ ok: true, total: list.length, list });
});

/** 错题复习用：把错题组装成可作答的题目（选项由本地词库补齐干扰项） */
wrongRouter.get('/quiz', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return res.status(400).json({ ok: false, error: '缺少 deviceId' });
  const list = listWrong(deviceId);
  const words = list.map((it) => withOptions(it, it.level || 'cet4', list));
  res.json({ ok: true, total: words.length, words });
});

wrongRouter.post('/', (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    if (!deviceId) return res.status(400).json({ ok: false, error: '缺少 deviceId' });
    const { total, item } = addWrong(deviceId, req.body?.word || {});
    res.json({ ok: true, total, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

wrongRouter.delete('/:word', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return res.status(400).json({ ok: false, error: '缺少 deviceId' });
  const { total } = removeWrong(deviceId, req.params.word);
  res.json({ ok: true, total });
});

wrongRouter.delete('/', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return res.status(400).json({ ok: false, error: '缺少 deviceId' });
  res.json({ ok: true, ...clearWrong(deviceId) });
});
