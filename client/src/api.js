import { BASE_URL } from './config.js';

const STORAGE_KEY = 'vocab_device_id';

/** 无登录场景下用来区分错题集归属 */
export function getDeviceId() {
  let id = '';
  try {
    id = uni.getStorageSync(STORAGE_KEY) || '';
  } catch (e) {
    id = '';
  }
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try {
      uni.setStorageSync(STORAGE_KEY, id);
    } catch (e) {
      /* ignore */
    }
  }
  return id;
}

function request({ url, method = 'GET', data, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      timeout,
      header: {
        'Content-Type': 'application/json',
        'x-device-id': getDeviceId(),
      },
      success: (res) => {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) {
          resolve(body);
        } else {
          reject(new Error(body.error || `请求失败(${res.statusCode})`));
        }
      },
      fail: (err) => {
        reject(new Error(err?.errMsg?.includes('timeout') ? '请求超时，请检查后端服务' : '网络异常，请确认后端已启动'));
      },
    });
  });
}

export const api = {
  health: () => request({ url: '/health' }),
  aiStatus: () => request({ url: '/words/ai-status' }),
  levels: () => request({ url: '/words/levels' }),
  words: (payload) => request({ url: '/words/batch', method: 'POST', data: payload, timeout: 45000 }),
  wrongList: () => request({ url: '/wrongbook' }),
  wrongQuiz: () => request({ url: '/wrongbook/quiz' }),
  wrongAdd: (word) => request({ url: '/wrongbook', method: 'POST', data: { word } }),
  wrongRemove: (word) => request({ url: `/wrongbook/${encodeURIComponent(word)}`, method: 'DELETE' }),
  wrongClear: () => request({ url: '/wrongbook', method: 'DELETE' }),
};
