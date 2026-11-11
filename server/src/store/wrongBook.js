/**
 * 错题集存储：初版无登录，用前端生成的 deviceId 做隔离，落本地 JSON 文件。
 * 结构：{ [deviceId]: [ { word, phonetic, pos, meaning, example, exampleZh, mnemonic, level, wrongCount, lastWrongAt } ] }
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'wrongbook.json');

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return db && typeof db === 'object' ? db : {};
  } catch {
    return {};
  }
}

function writeDb(db) {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

/** 全量错题（按最近答错时间倒序），供组卷等内部使用 */
export function listWrongAll(deviceId) {
  const list = readDb()[deviceId] || [];
  return [...list].sort((a, b) => b.lastWrongAt - a.lastWrongAt);
}

/**
 * 分页错题列表
 * @param {string} deviceId
 * @param {{ number?: number|string, pageSize?: number|string }} opts
 *   - number: 页码，从 1 开始
 *   - pageSize: 每页条数，默认 10
 */
export function listWrong(deviceId, { number = 1, pageSize = 10 } = {}) {
  const all = listWrongAll(deviceId);
  const total = all.length;
  const page = Math.max(1, parseInt(number, 10) || 1);
  const size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 10));
  const start = (page - 1) * size;
  const list = all.slice(start, start + size);
  return {
    list,
    total,
    number: page,
    pageSize: size,
    hasMore: start + list.length < total,
  };
}

export function addWrong(deviceId, word) {
  if (!word || !word.word || !word.meaning) {
    throw new Error('word 数据不完整');
  }
  const db = readDb();
  const list = db[deviceId] || [];
  const existing = list.find((it) => it.word.toLowerCase() === String(word.word).toLowerCase());

  if (existing) {
    existing.wrongCount += 1;
    existing.lastWrongAt = Date.now();
    existing.meaning = word.meaning;
  } else {
    list.push({
      word: word.word,
      phonetic: word.phonetic || '',
      pos: word.pos || '',
      meaning: word.meaning,
      example: word.example || '',
      exampleZh: word.exampleZh || '',
      mnemonic: word.mnemonic || '',
      level: word.level || '',
      wrongCount: 1,
      lastWrongAt: Date.now(),
    });
  }

  db[deviceId] = list;
  writeDb(db);
  return { total: list.length, item: existing || list[list.length - 1] };
}

export function removeWrong(deviceId, word) {
  const db = readDb();
  const list = db[deviceId] || [];
  const key = String(word || '').toLowerCase();
  const next = list.filter((it) => it.word.toLowerCase() !== key);
  db[deviceId] = next;
  writeDb(db);
  return { total: next.length };
}

export function clearWrong(deviceId) {
  const db = readDb();
  db[deviceId] = [];
  writeDb(db);
  return { total: 0 };
}

/**
 * 从错题集随机抽题（优先同词书；错得越多/越近越靠前，再局部打散）
 * @param {string} deviceId
 * @param {{ level?: string, count?: number, exclude?: string[] }} opts
 *   - exclude: 不要抽的词（本轮已选 / 本会话刚背过，由调用方决定）
 */
export function sampleWrongWords(deviceId, { level, count = 3, exclude = [] } = {}) {
  if (!deviceId || count <= 0) return [];
  const excludeSet = new Set(exclude.map((w) => String(w || '').toLowerCase()).filter(Boolean));
  const all = listWrongAll(deviceId);
  if (!all.length) return [];

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const usable = all.filter((it) => !excludeSet.has(it.word.toLowerCase()));
  if (!usable.length) return [];

  const rank = (a, b) => {
    const levelBias = (x) => (level && x.level === level ? 0 : 1);
    if (levelBias(a) !== levelBias(b)) return levelBias(a) - levelBias(b);
    if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
    return b.lastWrongAt - a.lastWrongAt;
  };

  const sorted = [...usable].sort(rank);
  const same = sorted.filter((it) => !level || it.level === level);
  const other = sorted.filter((it) => level && it.level !== level);
  const pool = [
    ...shuffle(same.slice(0, Math.max(count * 3, count))),
    ...shuffle(other.slice(0, count * 2)),
  ];

  const picked = [];
  const seen = new Set();
  for (const it of pool) {
    const key = it.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= count) break;
  }
  return picked;
}
