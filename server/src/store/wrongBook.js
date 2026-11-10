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

export function listWrong(deviceId) {
  const list = readDb()[deviceId] || [];
  return [...list].sort((a, b) => b.lastWrongAt - a.lastWrongAt);
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
