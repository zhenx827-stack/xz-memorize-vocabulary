/**
 * 词库服务：DeepSeek 生成 + 本地缓存池 + 兜底降级
 *
 * 设计要点：
 * 1. 单词数据全部由大模型产出（word / 音标 / 词性 / 释义 / 例句 / 记忆法 / 干扰项）
 * 2. 生成结果按词书写入本地缓存池，避免每次点词书都重复消耗 token
 * 3. 模型超时、报错、无 key 时自动降级到本地兜底词库，接口始终 200，前端流程不中断
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { config, LEVELS, isKeyReady } from '../config.js';
import { FALLBACK_WORDS } from '../data/fallbackWords.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const poolPath = (level) => path.join(DATA_DIR, `pool-${level}.json`);

let client = null;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
      timeout: config.deepseek.timeout,
      maxRetries: 0,
    });
  }
  return client;
}

export class AIUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIUnavailableError';
    this.cause = cause;
  }
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ------------------------------ 缓存池读写 ------------------------------ */

function readPool(level) {
  try {
    const raw = JSON.parse(fs.readFileSync(poolPath(level), 'utf8'));
    if (!raw || !Array.isArray(raw.words)) return null;
    if (Date.now() - Number(raw.createdAt || 0) > config.wordCacheTtl) return null;
    return raw;
  } catch {
    return null;
  }
}

function writePool(level, pool) {
  try {
    fs.writeFileSync(poolPath(level), JSON.stringify(pool, null, 2), 'utf8');
  } catch (err) {
    console.warn('[pool] 写入缓存失败:', err.message);
  }
}

/* ------------------------------ 数据规范化 ------------------------------ */

const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function normalizeWord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const word = clean(raw.word, 40);
  const meaning = clean(raw.meaning, 60);
  if (!word || !meaning) return null;
  if (!/^[a-zA-Z][a-zA-Z\s'’.-]*$/.test(word)) return null;

  const distractors = Array.isArray(raw.distractors)
    ? raw.distractors.map((d) => clean(d, 60)).filter((d) => d && d !== meaning)
    : [];

  return {
    word,
    phonetic: clean(raw.phonetic, 40),
    pos: clean(raw.pos, 12),
    meaning,
    example: clean(raw.example, 180),
    exampleZh: clean(raw.exampleZh, 180),
    mnemonic: clean(raw.mnemonic, 120),
    distractors: [...new Set(distractors)].slice(0, 3),
  };
}

/* ------------------------------ 提示词 ------------------------------ */

const LEVEL_HINT = {
  cet4: 'CET-4（大学英语四级）核心高频词汇，难度中等',
  cet6: 'CET-6（大学英语六级）进阶词汇，比四级更抽象',
  ielts: 'IELTS（雅思）学术类高频词汇，常见于阅读与写作',
  toefl: 'TOEFL（托福）学术词汇，偏学术与自然科学语境',
};

function buildPrompt(level, count, exclude) {
  const meta = LEVELS[level];
  return `你是一位资深英语词汇教研老师。请为「${meta.name}」词书（${LEVEL_HINT[level]}）生成 ${count} 个单词的背诵卡片数据。

要求：
1. 单词必须是该考试真实高频词，不要编造不存在的单词。
2. 释义用简体中文，只给核心义项，不要带词性前缀，控制在 12 个字以内。
3. distractors 是 3 个「其他单词」的中文释义，用作选择题干扰项：必须与正确释义含义不同、长度相近、看起来合理，不能是同一个词的不同说法。
4. example 是一句地道、简洁的英文例句（8-18 词），exampleZh 是对应中文翻译。
5. mnemonic 是一句中文记忆提示，可用词根词缀、谐音或联想，不超过 40 字。
6. 单词不区分大小写，不得重复，也不得出现这些已出现过的词：${exclude.slice(0, 60).join(', ') || '无'}。

只输出 JSON，不要任何解释文字，格式严格为：
{"words":[{"word":"abandon","phonetic":"/əˈbændən/","pos":"v.","meaning":"放弃；抛弃","example":"He abandoned the plan at the last minute.","exampleZh":"他在最后一刻放弃了这个计划。","mnemonic":"a+band(乐队)+on，乐队散了就放弃了","distractors":["候选人；考生","好处；利益","高效的"]}]}`;
}

/* ------------------------------ DeepSeek 生成 ------------------------------ */

async function requestFromDeepSeek(level, count, exclude) {
  if (!isKeyReady()) {
    throw new AIUnavailableError('未配置 DEEPSEEK_API_KEY，使用本地兜底词库');
  }

  const started = Date.now();
  let completion;
  try {
    // thinking 为 DeepSeek 扩展字段；Node SDK 会原样打进请求体（不要包成 extra_body）
    completion = await getClient().chat.completions.create({
      model: config.deepseek.model,
      messages: [
        { role: 'system', content: '你是严谨的英语词汇教研助手，只输出合法 JSON。' },
        { role: 'user', content: buildPrompt(level, count, exclude) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: config.deepseek.maxTokens,
      stream: false,
      thinking: { type: config.deepseek.thinking ? 'enabled' : 'disabled' },
    });
  } catch (err) {
    throw new AIUnavailableError(`DeepSeek 请求失败：${err.message}`, err);
  }

  const content = completion?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // 少数情况模型会包一层 ```json
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new AIUnavailableError('DeepSeek 返回内容不是合法 JSON');
    parsed = JSON.parse(match[0]);
  }

  const list = Array.isArray(parsed) ? parsed : parsed.words;
  if (!Array.isArray(list) || list.length === 0) {
    throw new AIUnavailableError('DeepSeek 未返回有效单词数组');
  }

  const words = list.map(normalizeWord).filter(Boolean);
  if (words.length === 0) {
    throw new AIUnavailableError('DeepSeek 返回的单词字段不完整');
  }

  return {
    words,
    meta: {
      model: config.deepseek.model,
      latencyMs: Date.now() - started,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
    },
  };
}

/* ------------------------------ 兜底词库 ------------------------------ */

function fallbackBatch(level, count, exclude) {
  const bank = FALLBACK_WORDS[level] || [];
  const excludeSet = new Set(exclude.map((w) => w.toLowerCase()));
  const meanings = bank.map((w) => w.meaning);

  const picked = shuffle(bank.filter((w) => !excludeSet.has(w.word.toLowerCase())));
  const chosen = picked.slice(0, count);
  // 词库不够时循环补齐（保证流程可走通）
  for (let i = 0; chosen.length < count && chosen.length < bank.length; i += 1) {
    chosen.push(bank[i % bank.length]);
  }

  return chosen.map((w) => ({
    ...w,
    mnemonic: `本地兜底词：${w.word} 常出现在 ${LEVELS[level].name} 阅读与写作中，先记搭配再记释义。`,
    distractors: shuffle(meanings.filter((m) => m !== w.meaning)).slice(0, 3),
  }));
}

/* ------------------------------ 对外主流程 ------------------------------ */

/**
 * 取一批单词
 * @returns {{words:Array, source:'ai'|'fallback', degraded:boolean, message:string, latencyMs:number}}
 */
export async function fetchWordBatch({ level, count = 10, exclude = [], forceRefresh = false }) {
  const started = Date.now();
  const excludeList = exclude.map((w) => String(w || '').toLowerCase()).filter(Boolean);
  const excludeSet = new Set(excludeList);

  const pool = forceRefresh ? null : readPool(level);
  if (pool) {
    const usable = pool.words.filter((w) => !excludeSet.has(w.word.toLowerCase()));
    if (usable.length >= count) {
      const picked = shuffle(usable).slice(0, count);
      return {
        words: picked.map((w) => withOptions(w, level, pool.words)),
        source: pool.source === 'ai' ? 'ai' : 'fallback',
        degraded: pool.source !== 'ai',
        message: pool.source === 'ai' ? '来自 AI 词库缓存' : 'AI 暂不可用，当前为本地兜底词库',
        cached: true,
        latencyMs: Date.now() - started,
      };
    }
  }

  const known = [...new Set([...(pool?.words || []).map((w) => w.word), ...excludeList])];

  try {
    const { words, meta } = await requestFromDeepSeek(level, Math.max(count, 10), known);
    const merged = dedupeByWord([...(pool?.source === 'ai' ? pool.words : []), ...words]);
    writePool(level, { level, source: 'ai', createdAt: Date.now(), words: merged, meta });

    const usable = merged.filter((w) => !excludeSet.has(w.word.toLowerCase()));
    const picked = shuffle(usable).slice(0, count);
    return {
      words: picked.map((w) => withOptions(w, level, merged)),
      source: 'ai',
      degraded: false,
      message: `AI 生成 ${words.length} 个新词（${meta.model}，${meta.latencyMs}ms）`,
      cached: false,
      latencyMs: Date.now() - started,
      aiMeta: meta,
    };
  } catch (err) {
    const reason = err instanceof AIUnavailableError ? err.message : `模型异常：${err.message}`;
    console.warn('[words] 降级到本地词库 →', reason);

    // 缓存里已有的 AI 词先复用，避免降级后重复
    const poolWords = pool?.words || [];
    const usablePool = poolWords.filter((w) => !excludeSet.has(w.word.toLowerCase()));
    const need = Math.max(count - usablePool.length, 0);
    const filler = need > 0 ? fallbackBatch(level, need, [...known, ...usablePool.map((w) => w.word)]) : [];
    const merged = [...shuffle(usablePool).slice(0, count), ...filler].slice(0, count);

    return {
      words: merged.map((w) => withOptions(w, level, [...poolWords, ...filler])),
      source: 'fallback',
      degraded: true,
      message: `${reason}，已切换本地兜底词库`,
      cached: false,
      latencyMs: Date.now() - started,
    };
  }
}

function dedupeByWord(list) {
  const seen = new Set();
  const out = [];
  for (const w of list) {
    const key = w.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** 组装 4 个选项（1 正确 + 3 干扰），选项顺序随机 */
export function withOptions(word, level, contextWords = []) {
  const pool = contextWords.length ? contextWords : FALLBACK_WORDS[level] || [];
  const candidates = [
    ...(word.distractors || []),
    ...shuffle(pool.filter((w) => w.word !== word.word).map((w) => w.meaning)),
    ...shuffle((FALLBACK_WORDS[level] || []).map((w) => w.meaning)),
  ];

  const options = [word.meaning];
  for (const c of candidates) {
    if (options.length >= 4) break;
    if (!c || options.includes(c)) continue;
    options.push(c);
  }

  return {
    ...word,
    level,
    options: shuffle(options.map((text) => ({ text, correct: text === word.meaning }))),
  };
}
