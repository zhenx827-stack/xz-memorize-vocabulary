import 'dotenv/config';

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  deepseek: {
    apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeout: num(process.env.DEEPSEEK_TIMEOUT, 20000),
    maxTokens: num(process.env.DEEPSEEK_MAX_TOKENS, 2400),
  },
  /** 同一个词书生成结果在本地缓存多久（毫秒），默认 12 小时 */
  wordCacheTtl: num(process.env.WORD_CACHE_TTL, 12 * 60 * 60 * 1000),
};

/** 支持的四类词书 */
export const LEVELS = {
  cet4: { id: 'cet4', name: '四级', desc: 'CET-4 核心高频词', emoji: '🎯' },
  cet6: { id: 'cet6', name: '六级', desc: 'CET-6 进阶词汇', emoji: '🚀' },
  ielts: { id: 'ielts', name: '雅思', desc: 'IELTS 学术场景词', emoji: '✈️' },
  toefl: { id: 'toefl', name: '托福', desc: 'TOEFL 学术高频词', emoji: '🎓' },
};

export const isValidLevel = (level) => Object.prototype.hasOwnProperty.call(LEVELS, level);

/**
 * key 是否可用：未配置或仍是占位符时直接走降级，不发请求，避免无谓等待。
 */
export function isKeyReady() {
  const key = config.deepseek.apiKey;
  if (!key) return false;
  if (/^(sk-)?x+$/i.test(key)) return false;
  if (/your[-_]?key|placeholder|todo/i.test(key)) return false;
  return key.length >= 16;
}
