<template>
  <view class="page">
    <view class="header">
      <view class="header-row">
        <view>
          <text class="title">错题集</text>
          <text class="subtitle">{{ total > 0 ? `共 ${total} 个易错词，答错自动收录` : '答错的单词会自动出现在这里' }}</text>
        </view>
        <view v-if="total > 0" class="clear-btn" hover-class="clear-hover" @tap="confirmClear">
          <text>清空</text>
        </view>
      </view>
    </view>

    <view v-if="total > 0" class="review-bar" hover-class="review-hover" @tap="startReview">
      <view class="review-mark">复</view>
      <view class="review-text">
        <text class="review-title">重新背这 {{ total }} 个错题</text>
        <text class="review-sub">打乱顺序再考一遍，答对也不删，随时复习</text>
      </view>
      <text class="review-arrow">›</text>
    </view>

    <view v-if="loading && list.length === 0" class="empty">
      <view class="spinner" />
      <text class="empty-sub">加载中…</text>
    </view>

    <view v-else-if="!loading && list.length === 0" class="empty">
      <view class="empty-mark">空</view>
      <text class="empty-title">错题集还是空的</text>
      <text class="empty-sub">去背一组单词，答错的词会自动进来</text>
      <view class="btn-go" @tap="goStudy">去背单词</view>
    </view>

    <view v-else class="list">
      <view v-for="(item, i) in list" :key="item.word" class="item" :style="{ animationDelay: Math.min(i, 9) * 40 + 'ms' }">
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

      <view class="load-more">
        <view v-if="loadingMore" class="spinner mini" />
        <text class="load-more-text">{{ footerText }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../api.js';

const LEVEL_NAME = { cet4: '四级', cet6: '六级', ielts: '雅思', toefl: '托福' };
const PAGE_SIZE = 10;

export default {
  data() {
    return {
      list: [],
      total: 0,
      page: 1,
      hasMore: true,
      loading: true,
      loadingMore: false,
    };
  },
  computed: {
    footerText() {
      if (this.loadingMore) return '加载中…';
      if (!this.hasMore) return this.list.length > 0 ? '已经到底了' : '';
      return '上拉加载更多';
    },
  },
  onShow() {
    this.resetAndLoad();
  },
  onReachBottom() {
    this.loadMore();
  },
  methods: {
    levelName(level) {
      return LEVEL_NAME[level] || '单词';
    },
    resetAndLoad() {
      this.list = [];
      this.total = 0;
      this.page = 1;
      this.hasMore = true;
      this.loadingMore = false;
      this.load(true);
    },
    async load(reset = false) {
      if (reset) this.loading = true;
      try {
        const res = await api.wrongList({ number: this.page, pageSize: PAGE_SIZE });
        const next = res.list || [];
        this.list = reset ? next : this.list.concat(next);
        this.total = res.total || 0;
        this.hasMore = !!res.hasMore;
      } catch (e) {
        if (reset) {
          this.list = [];
          this.total = 0;
          this.hasMore = false;
        }
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
        this.loadingMore = false;
      }
    },
    async loadMore() {
      if (this.loading || this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      const nextPage = this.page + 1;
      try {
        const res = await api.wrongList({ number: nextPage, pageSize: PAGE_SIZE });
        this.list = this.list.concat(res.list || []);
        this.total = res.total || 0;
        this.hasMore = !!res.hasMore;
        this.page = nextPage;
      } catch (e) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
      } finally {
        this.loadingMore = false;
      }
    },
    async remove(item) {
      try {
        const res = await api.wrongRemove(item.word);
        this.list = this.list.filter((it) => it.word !== item.word);
        this.total = typeof res.total === 'number' ? res.total : Math.max(0, this.total - 1);
        uni.showToast({ title: '已移除', icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none' });
      }
    },
    confirmClear() {
      uni.showModal({
        title: '清空错题集',
        content: '确定要清空所有错题吗？此操作不可恢复。',
        confirmColor: '#c43c3c',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.wrongClear();
            this.list = [];
            this.total = 0;
            this.page = 1;
            this.hasMore = false;
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
  --ink: #1a2332;
  --muted: #6b778a;
  --line: #dce3ec;
  --paper: #ffffff;
  --accent: #0f7a6e;
  --accent-soft: #e6f4f1;
  --bad: #c43c3c;
  --bad-soft: #fceeee;

  min-height: 100vh;
  padding: 28rpx 32rpx 64rpx;
  background:
    radial-gradient(ellipse 90% 50% at 100% 0%, rgba(15, 122, 110, 0.08), transparent 55%),
    linear-gradient(180deg, #edf2f7 0%, #f5f7fa 42%, #eef1f5 100%);
}

.header {
  margin-bottom: 28rpx;
}
.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: var(--ink);
}
.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--muted);
  line-height: 1.5;
}
.clear-btn {
  padding: 12rpx 24rpx;
  border-radius: 14rpx;
  font-size: 22rpx;
  color: var(--bad);
  background: var(--bad-soft);
  border: 1rpx solid rgba(196, 60, 60, 0.22);
}
.clear-hover {
  opacity: 0.75;
}

.review-bar {
  display: flex;
  align-items: center;
  padding: 24rpx 26rpx;
  border-radius: 20rpx;
  margin-bottom: 28rpx;
  background: var(--paper);
  border: 1rpx solid rgba(15, 122, 110, 0.22);
  box-shadow: 0 8rpx 24rpx rgba(26, 35, 50, 0.03);
}
.review-hover {
  background: #f8fafc;
}
.review-mark {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  margin-right: 20rpx;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 26rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.review-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.review-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--ink);
}
.review-sub {
  font-size: 21rpx;
  color: var(--muted);
  margin-top: 8rpx;
  line-height: 1.5;
}
.review-arrow {
  font-size: 40rpx;
  color: var(--accent);
}

.list {
  position: relative;
}
.item {
  padding: 28rpx;
  margin-bottom: 18rpx;
  border-radius: 20rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
  box-shadow: 0 8rpx 24rpx rgba(26, 35, 50, 0.03);
  animation: rise 0.4s ease both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16rpx);
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
  min-width: 0;
}
.item-word {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--ink);
  margin-right: 14rpx;
}
.item-phonetic {
  font-size: 22rpx;
  color: var(--muted);
}
.item-badge {
  padding: 6rpx 14rpx;
  border-radius: 10rpx;
  background: var(--bad-soft);
  font-size: 20rpx;
  color: var(--bad);
  flex-shrink: 0;
  border: 1rpx solid rgba(196, 60, 60, 0.18);
}
.item-meaning {
  display: block;
  margin-top: 14rpx;
  font-size: 28rpx;
  color: var(--ink);
  line-height: 1.6;
}
.item-example {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #4a5568;
  line-height: 1.6;
}
.item-example-zh {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--muted);
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
  color: var(--accent);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: var(--accent-soft);
}
.item-remove {
  font-size: 22rpx;
  color: var(--muted);
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  border: 1rpx solid var(--line);
  background: #f8fafc;
}

.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx 0 8rpx;
  gap: 12rpx;
}
.load-more-text {
  font-size: 22rpx;
  color: var(--muted);
}

.empty {
  min-height: 58vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.empty-mark {
  width: 96rpx;
  height: 96rpx;
  margin-bottom: 28rpx;
  border-radius: 20rpx;
  background: #f0f3f7;
  border: 1rpx solid var(--line);
  color: var(--muted);
  font-size: 36rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--ink);
}
.empty-sub {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: var(--muted);
  text-align: center;
  padding: 0 40rpx;
  line-height: 1.6;
}
.btn-go {
  margin-top: 40rpx;
  width: 320rpx;
  height: 88rpx;
  border-radius: 16rpx;
  background: var(--accent);
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
  border: 4rpx solid rgba(15, 122, 110, 0.15);
  border-top-color: var(--accent);
  animation: spin 0.85s linear infinite;
  margin-bottom: 20rpx;
}
.spinner.mini {
  width: 28rpx;
  height: 28rpx;
  border-width: 3rpx;
  margin-bottom: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
