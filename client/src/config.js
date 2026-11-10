// #ifdef H5
// H5 开发环境走 vite 代理，避免跨域
export const BASE_URL = '/api';
// #endif

// #ifndef H5
// 微信小程序 / App 直连本地服务；真机调试请换成电脑局域网 IP，例如 http://192.168.1.8:3000/api
export const BASE_URL = 'http://localhost:3000/api';
// #endif

export const WORD_BATCH_SIZE = 10;
