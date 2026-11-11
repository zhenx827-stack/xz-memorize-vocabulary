/**
 * 词库服务：DeepSeek 生成 + 本地缓存池 + 兜底降级
 *
 * 设计要点：
 * 1. 用户取词路径永不阻塞等模型：有缓存秒返，没有则本地兜底秒开
 * 2. DeepSeek 只在后台补池（启动预热 / 池子偏低 / 首页 warm）
 * 3. 生成结果按词书写入本地缓存池；无 key / 失败时全程可用本地兜底
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { config, LEVELS, isKeyReady } from '../config.js';
import { FALLBACK_WORDS } from '../data/fallbackWords.js';
import { sampleWrongWords } from '../store/wrongBook.js';

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

/* ------------------------------ 组卷：新词优先 + 错题补位 ------------------------------ */

function decorateFallback(level, word) {
  const bank = FALLBACK_WORDS[level] || [];
  const meanings = bank.map((w) => w.meaning);
  return {
    ...word,
    mnemonic:
      word.mnemonic ||
      `本地兜底词：${word.word} 常出现在 ${LEVELS[level].name} 阅读与写作中，先记搭配再记释义。`,
    distractors:
      Array.isArray(word.distractors) && word.distractors.length
        ? word.distractors
        : shuffle(meanings.filter((m) => m !== word.meaning)).slice(0, 3),
  };
}

/** 从未背过的列表里取词，绝不回填 exclude 里的词 */
function takeFresh(list, excludeSet, alreadyKeys, count) {
  if (count <= 0) return [];
  return shuffle(
    list.filter((w) => {
      const key = w.word.toLowerCase();
      return !excludeSet.has(key) && !alreadyKeys.has(key);
    }),
  ).slice(0, count);
}

function pushUnique(out, alreadyKeys, items, mapItem) {
  for (const raw of items) {
    const item = mapItem ? mapItem(raw) : raw;
    const key = item.word.toLowerCase();
    if (alreadyKeys.has(key)) continue;
    alreadyKeys.add(key);
    out.push(item);
  }
}

/**
 * 组一卷：
 * 1. 未背过的 AI 池 / 本地兜底
 * 2. 新词不够时，优先从错题集随机补（同词书优先）
 * 3. 仍不够 → 再抽已背过的错题复习（不重复抽本地旧词硬凑）
 * 4. 实在没有可出的题 → 才允许回收本地词，并标明「新词生成中」
 */
function composeWordList({ level, count, excludeList, excludeSet, pool, deviceId }) {
  const out = [];
  const alreadyKeys = new Set();
  const poolWords = pool?.words || [];
  const bank = (FALLBACK_WORDS[level] || []).map((w) => decorateFallback(level, w));
  const tags = { fromPool: 0, fromFallback: 0, fromWrong: 0, recycled: 0 };

  const freshPool = poolWords.filter((w) => !excludeSet.has(w.word.toLowerCase()));
  const freshBank = bank.filter((w) => !excludeSet.has(w.word.toLowerCase()));
  const freshAvailable = new Set([
    ...freshPool.map((w) => w.word.toLowerCase()),
    ...freshBank.map((w) => w.word.toLowerCase()),
  ]).size;

  // 有错题时：新词充足也掺入约 1/3 复习；新词不够则错题优先占位
  let wrongQuota = 0;
  if (deviceId) {
    wrongQuota =
      freshAvailable >= count
        ? Math.min(Math.ceil(count / 3), count)
        : Math.min(count, Math.max(Math.ceil(count / 2), count - freshAvailable));
  }

  if (wrongQuota > 0) {
    const wrongs = sampleWrongWords(deviceId, {
      level,
      count: wrongQuota,
      exclude: excludeList,
    });
    pushUnique(out, alreadyKeys, wrongs, (w) => ({
      ...w,
      mnemonic: w.mnemonic || `错题复习：${w.word}`,
      fromWrong: true,
    }));
    tags.fromWrong = out.length;
  }

  const needAfterWrong = count - out.length;
  const fromPool = takeFresh(poolWords, excludeSet, alreadyKeys, needAfterWrong);
  pushUnique(out, alreadyKeys, fromPool);
  tags.fromPool = fromPool.length;

  const needAfterPool = count - out.length;
  const fromBank = takeFresh(bank, excludeSet, alreadyKeys, needAfterPool);
  pushUnique(out, alreadyKeys, fromBank);
  tags.fromFallback = fromBank.length;

  // 新词仍不够：可再抽「本会话已见过」的错题补位（只排除本轮已选）
  if (out.length < count && deviceId) {
    const moreWrong = sampleWrongWords(deviceId, {
      level,
      count: count - out.length,
      exclude: [...alreadyKeys],
    });
    const before = out.length;
    pushUnique(out, alreadyKeys, moreWrong, (w) => ({
      ...w,
      mnemonic: w.mnemonic || `错题复习：${w.word}`,
      fromWrong: true,
    }));
    tags.fromWrong += out.length - before;
  }

  // 最后手段：本地词全答完且无错题可抽时，才回收旧词，避免空卷
  if (out.length === 0) {
    const recycled = shuffle([...poolWords, ...bank]).slice(0, count);
    pushUnique(out, alreadyKeys, recycled.map((w) => decorateFallback(level, w)));
    tags.recycled = out.length;
  }

  const context = dedupeByWord([...poolWords, ...bank, ...out]);
  const source =
    tags.fromPool > 0 && pool?.source === 'ai'
      ? 'ai'
      : tags.fromWrong > 0 && tags.fromPool === 0 && tags.fromFallback === 0
        ? 'wrong'
        : tags.fromFallback > 0 || tags.recycled > 0
          ? 'fallback'
          : pool?.source === 'ai'
            ? 'ai'
            : 'fallback';

  let message;
  if (tags.recycled > 0) {
    message = '本词书本地新词已刷完，正在后台生成；本轮先复习已出现过的词';
  } else if (tags.fromWrong > 0 && freshAvailable < count) {
    message = `本地新词不足，已从错题集随机加入 ${tags.fromWrong} 个复习`;
  } else if (tags.fromWrong > 0) {
    message = `本轮含 ${tags.fromWrong} 个错题复习 + ${tags.fromPool + tags.fromFallback} 个新词`;
  } else if (pool?.source === 'ai' && tags.fromPool > 0) {
    message = '来自 AI 词库缓存';
  } else {
    message = '本地兜底词库（后台正在生成 AI 词）';
  }

  return {
    // 打散顺序，避免错题总挤在卷首
    words: shuffle(out.slice(0, count)).map((w) => withOptions(w, level, context)),
    source,
    degraded: source !== 'ai',
    message,
    mix: tags,
    freshAvailable,
  };
}

/* ------------------------------ 后台补池（不阻塞接口） ------------------------------ */

/** 每个 level 同时只排队一次，避免重复打 DeepSeek */
const refillQueued = new Set();
/** 全局串行补池，防止多词书并行打爆限流 */
let refillChain = Promise.resolve();

/** 池子剩余可用词低于该值时触发后台补池 */
const POOL_REFILL_THRESHOLD = 30;
/** 单次后台补池请求生成的词数 */
const POOL_REFILL_COUNT = 20;

function schedulePoolRefill(level, exclude = []) {
  if (!isKeyReady()) return;
  if (refillQueued.has(level)) return;
  refillQueued.add(level);

  const job = async () => {
    try {
      const pool = readPool(level);
      const known = [
        ...new Set([
          ...(pool?.words || []).map((w) => w.word),
          ...exclude.map((w) => String(w || '').toLowerCase()).filter(Boolean),
        ]),
      ];
      console.log(`[words] 后台补池开始 → ${level}`);
      const { words, meta } = await requestFromDeepSeek(level, POOL_REFILL_COUNT, known);
      const prev = pool?.source === 'ai' ? pool.words : [];
      const merged = dedupeByWord([...prev, ...words]);
      writePool(level, {
        level,
        source: 'ai',
        createdAt: Date.now(),
        words: merged,
        meta,
      });
      console.log(
        `[words] 后台补池完成 → ${level} +${words.length}（共 ${merged.length}，${meta.latencyMs}ms）`,
      );
    } catch (err) {
      const reason = err instanceof AIUnavailableError ? err.message : err.message;
      console.warn(`[words] 后台补池失败 → ${level}:`, reason);
    } finally {
      refillQueued.delete(level);
    }
  };

  refillChain = refillChain.then(job, job);
  return refillChain;
}

function serveInstant({ level, count, excludeList, excludeSet, pool, deviceId, started, forceRefresh }) {
  const composed = composeWordList({
    level,
    count,
    excludeList,
    excludeSet,
    pool,
    deviceId,
  });

  const low = composed.freshAvailable < POOL_REFILL_THRESHOLD;
  const needRefill = forceRefresh || low || !pool || pool.source !== 'ai' || composed.mix.recycled > 0;
  if (needRefill) {
    schedulePoolRefill(level, [...excludeList, ...composed.words.map((w) => w.word)]);
  }

  return {
    words: composed.words,
    source: composed.source,
    degraded: composed.degraded,
    message: composed.message,
    cached: Boolean(pool?.words?.length),
    mix: composed.mix,
    latencyMs: Date.now() - started,
    refillQueued: needRefill,
  };
}

/**
 * 服务启动 / 首页预热：异步把各词书池子填起来，用户点进来时几乎必命中缓存。
 */
export function warmWordPools(levels = Object.keys(LEVELS)) {
  if (!isKeyReady()) {
    return { ok: false, message: '未配置 API Key，跳过预热' };
  }
  const list = levels.filter((l) => LEVELS[l]);
  for (const level of list) {
    const pool = readPool(level);
    const size = pool?.words?.length || 0;
    if (size >= POOL_REFILL_THRESHOLD && pool?.source === 'ai') continue;
    schedulePoolRefill(level);
  }
  return { ok: true, message: `已排队预热：${list.join(', ')}` };
}

/* ------------------------------ 对外主流程 ------------------------------ */

/**
 * 取一批单词（用户路径永不阻塞等 DeepSeek）
 *
 * 策略：
 * 1. 优先未背过的缓存/兜底词；新词不够则随机掺入错题
 * 2. 绝不靠「循环本地旧词」硬凑满一组（除非完全无题可出）
 * 3. 后台异步补 AI 池；forceRefresh 只触发补池，不阻塞
 */
export async function fetchWordBatch({
  level,
  count = 10,
  exclude = [],
  forceRefresh = false,
  deviceId = '',
}) {
  const started = Date.now();
  const excludeList = exclude.map((w) => String(w || '').toLowerCase()).filter(Boolean);
  const excludeSet = new Set(excludeList);
  const pool = readPool(level);

  return serveInstant({
    level,
    count,
    excludeList,
    excludeSet,
    pool,
    deviceId,
    started,
    forceRefresh,
  });
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
