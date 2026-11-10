<template>
  <view class="page">
    <view class="glow glow-a" />
    <view class="glow glow-b" />

    <view class="header">
      <view class="brand">
        <text class="brand-dot" />
        <text class="brand-text">AI Vocab</text>
        <view :class="['status', aiReady ? 'status-ok' : 'status-warn']">
          <text class="status-dot" />
          <text>{{ aiReady ? 'DeepSeek 已接入' : '降级词库' }}</text>
        </view>
      </view>
      <text class="title">今天想背哪本书？</text>
      <text class="subtitle">选一个词书，AI 现场生成 {{ batchSize }} 个单词卡片</text>
    </view>

    <view class="grid">
      <view
        v-for="(item, i) in levels"
        :key="item.id"
        class="card"
        :class="'card-' + item.id"
        hover-class="card-hover"
        :style="{ animationDelay: i * 60 + 'ms' }"
        @tap="startStudy(item)"
      >
        <text class="card-emoji">{{ item.emoji }}</text>
        <text class="card-name">{{ item.name }}</text>
        <text class="card-desc">{{ item.desc }}</text>
        <text class="card-go">开始 →</text>
      </view>
    </view>

    <view class="wrong-entry" hover-class="row-hover" @tap="goWrong">
      <view class="wrong-left">
        <text class="wrong-icon">📕</text>
        <view class="wrong-info">
          <text class="wrong-title">我的错题集</text>
          <text class="wrong-desc">{{ wrongCount > 0 ? `已收录 ${wrongCount} 个易错词` : '还没有错题，先背一组吧' }}</text>
        </view>
      </view>
      <text class="wrong-arrow">›</text>
    </view>

    <view class="footer">
      <text class="footer-line">单词 · 音标 · 例句 · 记忆法 全部由 DeepSeek 实时生成</text>
      <text class="footer-line dim">{{ statusText }}</text>
    </view>

    <view v-if="loading" class="mask">
      <view class="loader">
        <view class="spinner" />
        <text class="loader-text">{{ loadingText }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../api.js';
import { WORD_BATCH_SIZE } from '../../config.js';

const LEVEL_META = [
  { id: 'cet4', name: '四级', desc: 'CET-4 核心高频词', emoji: '🎯' },
  { id: 'cet6', name: '六级', desc: 'CET-6 进阶词汇', emoji: '🚀' },
  { id: 'ielts', name: '雅思', desc: 'IELTS 学术场景词', emoji: '✈️' },
  { id: 'toefl', name: '托福', desc: 'TOEFL 学术高频词', emoji: '🎓' },
];

export default {
  data() {
    return {
      levels: LEVEL_META,
      aiReady: false,
      statusText: '正在检测 AI 服务…',
      wrongCount: 0,
      loading: false,
      loadingText: 'AI 正在生成单词…',
      batchSize: WORD_BATCH_SIZE,
    };
  },
  onShow() {
    this.checkStatus();
    this.loadWrongCount();
  },
  methods: {
    async checkStatus() {
      try {
        const res = await api.aiStatus();
        this.aiReady = !!res.ready;
        this.statusText = res.ready
          ? `模型 ${res.model} · 超时 ${Math.round(res.timeoutMs / 1000)}s 后自动降级`
          : '未配置 API Key，当前使用本地兜底词库（功能完整可用）';
      } catch (e) {
        this.aiReady = false;
        this.statusText = '后端未连接，请先启动 server（npm start）';
      }
    },
    async loadWrongCount() {
      try {
        const res = await api.wrongList();
        this.wrongCount = res.total || 0;
      } catch (e) {
        this.wrongCount = 0;
      }
    },
    startStudy(item) {
      if (this.loading) return;
      this.loading = true;
      this.loadingText = `${item.name}词汇生成中…`;
      uni.navigateTo({
        url: `/pages/study/study?level=${item.id}`,
        complete: () => {
          this.loading = false;
        },
      });
    },
    goWrong() {
      uni.switchTab({ url: '/pages/wrong/wrong' });
    },
  },
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 40rpx 36rpx 60rpx;
  position: relative;
  overflow: hidden;
  background: #0a0f1e;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80rpx);
  opacity: 0.5;
  pointer-events: none;
}
.glow-a {
  width: 480rpx;
  height: 480rpx;
  top: -160rpx;
  right: -160rpx;
  background: radial-gradient(circle, rgba(109, 155, 255, 0.55), rgba(109, 155, 255, 0));
}
.glow-b {
  width: 420rpx;
  height: 420rpx;
  top: 380rpx;
  left: -180rpx;
  background: radial-gradient(circle, rgba(140, 92, 255, 0.4), rgba(140, 92, 255, 0));
}

.header {
  position: relative;
  z-index: 1;
  margin-bottom: 44rpx;
}

.brand {
  display: flex;
  align-items: center;
  margin-bottom: 30rpx;
}
.brand-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #6d9bff;
  box-shadow: 0 0 16rpx #6d9bff;
  margin-right: 12rpx;
}
.brand-text {
  font-size: 26rpx;
  letter-spacing: 4rpx;
  color: #8fa2c9;
  text-transform: uppercase;
  margin-right: auto;
}
.status {
  display: flex;
  align-items: center;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}
.status-ok {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1rpx solid rgba(34, 197, 94, 0.3);
}
.status-warn {
  background: rgba(250, 204, 21, 0.1);
  color: #facc15;
  border: 1rpx solid rgba(250, 204, 21, 0.28);
}
.status-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: currentColor;
  margin-right: 10rpx;
}

.title {
  display: block;
  font-size: 56rpx;
  font-weight: 700;
  color: #f2f6ff;
  line-height: 1.28;
  letter-spacing: 1rpx;
}
.subtitle {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  color: #7c8aab;
  line-height: 1.6;
}

.grid {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.card {
  width: 328rpx;
  height: 280rpx;
  border-radius: 32rpx;
  padding: 30rpx 26rpx;
  margin-bottom: 24rpx;
  display: flex;
  flex-direction: column;
  border: 1rpx solid rgba(255, 255, 255, 0.07);
  background: linear-gradient(150deg, #182343 0%, #121a30 100%);
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.35);
  animation: rise 0.5s ease both;
  position: relative;
  overflow: hidden;
}
.card::after {
  content: '';
  position: absolute;
  width: 200rpx;
  height: 200rpx;
  right: -80rpx;
  bottom: -90rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(109, 155, 255, 0.22), rgba(109, 155, 255, 0));
}
.card-cet6 {
  background: linear-gradient(150deg, #1b2b45 0%, #101a2e 100%);
}
.card-ielts {
  background: linear-gradient(150deg, #2a2347 0%, #151329 100%);
}
.card-toefl {
  background: linear-gradient(150deg, #1d3346 0%, #101d28 100%);
}
.card-hover {
  transform: scale(0.97);
  opacity: 0.9;
}
.card-emoji {
  font-size: 44rpx;
  margin-bottom: auto;
}
.card-name {
  font-size: 40rpx;
  font-weight: 700;
  color: #f2f6ff;
  margin-bottom: 8rpx;
}
.card-desc {
  font-size: 22rpx;
  color: #7f8db0;
  margin-bottom: 16rpx;
}
.card-go {
  font-size: 24rpx;
  color: #6d9bff;
  font-weight: 600;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(24rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.wrong-entry {
  position: relative;
  z-index: 1;
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  padding: 28rpx 30rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.07);
}
.row-hover {
  background: rgba(255, 255, 255, 0.08);
}
.wrong-left {
  display: flex;
  align-items: center;
  flex: 1;
}
.wrong-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}
.wrong-info {
  display: flex;
  flex-direction: column;
}
.wrong-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #e8edf9;
}
.wrong-desc {
  font-size: 22rpx;
  color: #7c8aab;
  margin-top: 6rpx;
}
.wrong-arrow {
  font-size: 40rpx;
  color: #55618a;
}

.footer {
  position: relative;
  z-index: 1;
  margin-top: 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.footer-line {
  font-size: 20rpx;
  color: #55618a;
  line-height: 1.9;
  text-align: center;
}
.footer-line.dim {
  color: #3f4a6b;
}

.mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(5, 8, 16, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.loader {
  width: 320rpx;
  padding: 40rpx 0;
  border-radius: 28rpx;
  background: #141c30;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1rpx solid rgba(255, 255, 255, 0.08);
}
.spinner {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(109, 155, 255, 0.25);
  border-top-color: #6d9bff;
  animation: spin 0.8s linear infinite;
}
.loader-text {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: #8fa2c9;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
