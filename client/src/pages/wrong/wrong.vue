<template>
  <view class="page">
    <view class="glow" />

    <view class="header">
      <view class="header-row">
        <view>
          <text class="title">错题集</text>
          <text class="subtitle">{{ list.length > 0 ? `共 ${list.length} 个易错词，答错自动收录` : '答错的单词会自动出现在这里' }}</text>
        </view>
        <view v-if="list.length > 0" class="clear-btn" hover-class="clear-hover" @tap="confirmClear">
          <text>清空</text>
        </view>
      </view>
    </view>

    <view v-if="list.length > 0" class="review-bar" hover-class="review-hover" @tap="startReview">
      <text class="review-icon">🔁</text>
      <view class="review-text">
        <text class="review-title">重新背这 {{ list.length }} 个错题</text>
        <text class="review-sub">打乱顺序再考一遍，答对也不删，随时复习</text>
      </view>
      <text class="review-arrow">›</text>
    </view>

    <view v-if="loading" class="empty">
      <view class="spinner" />
      <text class="empty-sub">加载中…</text>
    </view>

    <view v-else-if="list.length === 0" class="empty">
      <text class="empty-icon">📕</text>
      <text class="empty-title">错题集还是空的</text>
      <text class="empty-sub">去背一组单词，答错的词会自动进来</text>
      <view class="btn-go" @tap="goStudy">去背单词</view>
    </view>

    <view v-else class="list">
      <view v-for="(item, i) in list" :key="item.word" class="item" :style="{ animationDelay: i * 40 + 'ms' }">
        <view class="item-head">
          <view class="item-word-row">
            <text class="item-word">{{ item.word }}</text>
            <text v-if="item.phonetic" class="item-phonetic">{{ item.phonetic }}</text>
          </view>
          <view class="item-badge">
            <text>错 {{ item.wrongCount }} 次</text>
          </view>
        </view>
        <text class="item-meaning">{{ item.pos ? item.pos + ' ' : '' }}{{ item.meaning }}</text>
        <text v-if="item.example" class="item-example">{{ item.example }}</text>
        <text v-if="item.exampleZh" class="item-example-zh">{{ item.exampleZh }}</text>
        <view class="item-foot">
          <text class="item-level">{{ levelName(item.level) }}</text>
          <text class="item-remove" @tap.stop="remove(item)">移除</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../api.js';

const LEVEL_NAME = { cet4: '四级', cet6: '六级', ielts: '雅思', toefl: '托福' };

export default {
  data() {
    return {
      list: [],
      loading: true,
    };
  },
  onShow() {
    this.load();
  },
  methods: {
    levelName(level) {
      return LEVEL_NAME[level] || '单词';
    },
    async load() {
      this.loading = true;
      try {
        const res = await api.wrongList();
        this.list = res.list || [];
      } catch (e) {
        this.list = [];
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async remove(item) {
      try {
        await api.wrongRemove(item.word);
        this.list = this.list.filter((it) => it.word !== item.word);
        uni.showToast({ title: '已移除', icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none' });
      }
    },
    confirmClear() {
      uni.showModal({
        title: '清空错题集',
        content: '确定要清空所有错题吗？此操作不可恢复。',
        confirmColor: '#f43f5e',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.wrongClear();
            this.list = [];
            uni.showToast({ title: '已清空', icon: 'none' });
          } catch (e) {
            uni.showToast({ title: e.message || '操作失败', icon: 'none' });
          }
        },
      });
    },
    startReview() {
      uni.navigateTo({ url: '/pages/study/study?mode=wrong' });
    },
    goStudy() {
      uni.switchTab({ url: '/pages/index/index' });
    },
  },
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 40rpx 36rpx 60rpx;
  background: #0a0f1e;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: 480rpx;
  height: 480rpx;
  top: -180rpx;
  right: -160rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.22), rgba(244, 63, 94, 0));
  filter: blur(70rpx);
  pointer-events: none;
}

.header {
  position: relative;
  z-index: 1;
  margin-bottom: 28rpx;
}
.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.title {
  display: block;
  font-size: 52rpx;
  font-weight: 700;
  color: #f2f6ff;
}
.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #7c8aab;
}
.clear-btn {
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #fb7185;
  background: rgba(244, 63, 94, 0.1);
  border: 1rpx solid rgba(244, 63, 94, 0.28);
}
.clear-hover {
  opacity: 0.7;
}

.review-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 26rpx 28rpx;
  border-radius: 26rpx;
  margin-bottom: 28rpx;
  background: linear-gradient(135deg, rgba(91, 140, 255, 0.18), rgba(124, 92, 255, 0.14));
  border: 1rpx solid rgba(109, 155, 255, 0.3);
}
.review-hover {
  opacity: 0.85;
}
.review-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}
.review-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.review-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #f2f6ff;
}
.review-sub {
  font-size: 21rpx;
  color: #93a4c9;
  margin-top: 8rpx;
}
.review-arrow {
  font-size: 40rpx;
  color: #8fb4ff;
}

.list {
  position: relative;
  z-index: 1;
}
.item {
  padding: 28rpx;
  margin-bottom: 22rpx;
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.07);
  animation: rise 0.4s ease both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.item-word-row {
  display: flex;
  align-items: baseline;
  flex: 1;
}
.item-word {
  font-size: 40rpx;
  font-weight: 700;
  color: #ffffff;
  margin-right: 16rpx;
}
.item-phonetic {
  font-size: 22rpx;
  color: #7c8aab;
}
.item-badge {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(244, 63, 94, 0.12);
  font-size: 20rpx;
  color: #fb7185;
  flex-shrink: 0;
}
.item-meaning {
  display: block;
  margin-top: 14rpx;
  font-size: 28rpx;
  color: #dbe4f8;
  line-height: 1.6;
}
.item-example {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #8fa2c9;
  line-height: 1.6;
}
.item-example-zh {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #64719a;
  line-height: 1.6;
}
.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
}
.item-level {
  font-size: 20rpx;
  color: #6d9bff;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  background: rgba(109, 155, 255, 0.12);
}
.item-remove {
  font-size: 22rpx;
  color: #64719a;
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}

.empty {
  position: relative;
  z-index: 1;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.empty-icon {
  font-size: 96rpx;
  margin-bottom: 24rpx;
}
.empty-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #e8edf9;
}
.empty-sub {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #7c8aab;
}
.btn-go {
  margin-top: 40rpx;
  padding: 0 60rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, #5b8cff, #7c5cff);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(109, 155, 255, 0.2);
  border-top-color: #6d9bff;
  animation: spin 0.85s linear infinite;
  margin-bottom: 20rpx;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
