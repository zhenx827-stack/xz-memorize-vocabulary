<template>
  <view class="page">
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
        <text class="card-mark">{{ item.mark }}</text>
        <text class="card-name">{{ item.name }}</text>
        <text class="card-desc">{{ item.desc }}</text>
        <text class="card-go">开始学习 →</text>
      </view>
    </view>

    <view class="wrong-entry" hover-class="row-hover" @tap="goWrong">
      <view class="wrong-left">
        <view class="wrong-mark">错</view>
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
  { id: 'cet4', name: '四级', desc: 'CET-4 核心高频词', mark: '4' },
  { id: 'cet6', name: '六级', desc: 'CET-6 进阶词汇', mark: '6' },
  { id: 'ielts', name: '雅思', desc: 'IELTS 学术场景词', mark: 'I' },
  { id: 'toefl', name: '托福', desc: 'TOEFL 学术高频词', mark: 'T' },
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
        const res = await api.wrongList({ number: 1, pageSize: 1 });
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
  --ink: #1a2332;
  --muted: #6b778a;
  --line: #dce3ec;
  --paper: #ffffff;
  --accent: #0f7a6e;
  --accent-soft: #e6f4f1;
  --ok: #1a7f4b;
  --ok-soft: #e8f6ee;
  --warn: #9a6b14;
  --warn-soft: #f8f0dc;
  --bad: #c43c3c;
  --bad-soft: #fceeee;

  min-height: 100vh;
  padding: 28rpx 32rpx 64rpx;
  background:
    radial-gradient(ellipse 90% 50% at 100% 0%, rgba(15, 122, 110, 0.08), transparent 55%),
    linear-gradient(180deg, #edf2f7 0%, #f5f7fa 42%, #eef1f5 100%);
}

.header {
  margin-bottom: 36rpx;
}

.brand {
  display: flex;
  align-items: center;
  margin-bottom: 28rpx;
}
.brand-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 12rpx;
}
.brand-text {
  font-size: 24rpx;
  letter-spacing: 3rpx;
  color: var(--muted);
  text-transform: uppercase;
  margin-right: auto;
}
.status {
  display: flex;
  align-items: center;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.status-ok {
  background: var(--ok-soft);
  color: var(--ok);
  border: 1rpx solid rgba(26, 127, 75, 0.22);
}
.status-warn {
  background: var(--warn-soft);
  color: var(--warn);
  border: 1rpx solid rgba(154, 107, 20, 0.22);
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
  font-size: 48rpx;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.28;
  letter-spacing: 1rpx;
}
.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--muted);
  line-height: 1.6;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.card {
  width: 328rpx;
  min-height: 260rpx;
  border-radius: 24rpx;
  padding: 28rpx 26rpx;
  margin-bottom: 22rpx;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1rpx solid var(--line);
  box-shadow: 0 10rpx 28rpx rgba(26, 35, 50, 0.04);
  animation: rise 0.45s ease both;
}
.card-hover {
  background: #f8fafc;
  border-color: #c9d4e0;
}
.card-mark {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  margin-bottom: auto;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 28rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-cet6 .card-mark {
  background: #eef1f7;
  color: #4a5d7a;
}
.card-ielts .card-mark {
  background: #f3eef8;
  color: #6b5580;
}
.card-toefl .card-mark {
  background: #eaf3f7;
  color: #3d6a7a;
}
.card-name {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 8rpx;
}
.card-desc {
  font-size: 22rpx;
  color: var(--muted);
  margin-bottom: 18rpx;
  line-height: 1.5;
}
.card-go {
  font-size: 24rpx;
  color: var(--accent);
  font-weight: 600;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.wrong-entry {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  padding: 26rpx 28rpx;
  border-radius: 20rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
  box-shadow: 0 8rpx 24rpx rgba(26, 35, 50, 0.03);
}
.row-hover {
  background: #f8fafc;
}
.wrong-left {
  display: flex;
  align-items: center;
  flex: 1;
}
.wrong-mark {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  margin-right: 20rpx;
  background: var(--bad-soft);
  color: var(--bad);
  font-size: 26rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wrong-info {
  display: flex;
  flex-direction: column;
}
.wrong-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--ink);
}
.wrong-desc {
  font-size: 22rpx;
  color: var(--muted);
  margin-top: 6rpx;
}
.wrong-arrow {
  font-size: 40rpx;
  color: #a0abbc;
}

.footer {
  margin-top: 52rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.footer-line {
  font-size: 20rpx;
  color: var(--muted);
  line-height: 1.9;
  text-align: center;
}
.footer-line.dim {
  color: #9aa5b5;
}

.mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(26, 35, 50, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.loader {
  width: 320rpx;
  padding: 40rpx 0;
  border-radius: 20rpx;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1rpx solid var(--line);
  box-shadow: 0 16rpx 40rpx rgba(26, 35, 50, 0.1);
}
.spinner {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(15, 122, 110, 0.15);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
.loader-text {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: var(--muted);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
