<template>
  <view class="page">
    <!-- 加载中 -->
    <view v-if="status === 'loading'" class="center-box">
      <view class="spinner" />
      <text class="center-title">正在出题</text>
      <text class="center-sub">{{ loadingHint }}</text>
    </view>

    <!-- 出错 -->
    <view v-else-if="status === 'error'" class="center-box">
      <text class="center-mark">!</text>
      <text class="center-title">加载失败</text>
      <text class="center-sub">{{ errorMsg }}</text>
      <view class="btn-primary" @tap="loadBatch(false)">重试</view>
      <view class="btn-ghost" @tap="goBack">返回</view>
    </view>

    <!-- 本轮结束 -->
    <view v-else-if="status === 'done'" class="center-box">
      <text class="center-mark done">{{ accuracy >= 80 ? '优' : accuracy >= 60 ? '良' : '练' }}</text>
      <text class="center-title">本轮完成</text>
      <view class="stats">
        <view class="stat">
          <text class="stat-num ok">{{ correctCount }}</text>
          <text class="stat-label">答对</text>
        </view>
        <view class="stat-divider" />
        <view class="stat">
          <text class="stat-num bad">{{ wrongCount }}</text>
          <text class="stat-label">答错</text>
        </view>
        <view class="stat-divider" />
        <view class="stat">
          <text class="stat-num">{{ accuracy }}%</text>
          <text class="stat-label">正确率</text>
        </view>
      </view>
      <text class="center-sub">{{ wrongCount > 0 ? `已把 ${wrongCount} 个易错词收进错题集` : '全部答对，继续保持' }}</text>
      <view class="btn-primary" @tap="loadBatch(true)">再来一组</view>
      <view class="btn-ghost" @tap="goWrong">去看看错题集</view>
    </view>

    <!-- 答题 -->
    <view v-else class="quiz">
      <view class="topbar">
        <view class="progress-wrap">
          <view class="progress-bar" :style="{ width: progress + '%' }" />
        </view>
        <view class="topbar-info">
          <text class="counter">{{ index + 1 }} / {{ words.length }}</text>
          <text :class="['source-tag', degraded ? 'tag-fallback' : 'tag-ai']">
            {{ degraded ? '本地词库' : 'AI 生成' }}
          </text>
        </view>
      </view>

      <view v-if="degraded" class="notice">
        <text>{{ notice }}</text>
      </view>

      <view class="card" :class="{ 'card-out': cardAnim }">
        <text class="card-label">{{ levelName }} · 选择正确的中文释义</text>
        <text class="word">{{ current.word }}</text>
        <view class="meta-row">
          <text class="phonetic">{{ current.phonetic }}</text>
          <text class="pos">{{ current.pos }}</text>
        </view>
      </view>

      <view class="options">
        <view
          v-for="(opt, i) in current.options"
          :key="opt.text + i"
          class="option"
          :class="optionClass(opt)"
          hover-class="option-hover"
          @tap="choose(opt)"
        >
          <text class="option-key">{{ keys[i] }}</text>
          <text class="option-text">{{ opt.text }}</text>
          <text v-if="answered && opt.correct" class="option-mark">✓</text>
          <text v-else-if="answered && selected === opt.text" class="option-mark">✕</text>
        </view>
      </view>

      <!-- 答题后解析 -->
      <view v-if="answered" class="detail" :class="isCorrect ? 'detail-ok' : 'detail-bad'">
        <view class="detail-head">
          <text class="detail-status">{{ isCorrect ? '回答正确' : '回答错误 · 已加入错题集' }}</text>
          <text class="detail-word">{{ current.word }} · {{ current.pos }} {{ current.meaning }}</text>
        </view>
        <view v-if="current.example" class="detail-block">
          <text class="detail-tag">例句</text>
          <text class="detail-en">{{ current.example }}</text>
          <text class="detail-zh">{{ current.exampleZh }}</text>
        </view>
        <view v-if="current.mnemonic" class="detail-block">
          <text class="detail-tag">记忆法</text>
          <text class="detail-zh">{{ current.mnemonic }}</text>
        </view>
        <view v-if="!isCorrect" class="btn-next" @tap="next">继续下一个</view>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../api.js';
import { WORD_BATCH_SIZE } from '../../config.js';

const LEVEL_NAME = { cet4: '四级', cet6: '六级', ielts: '雅思', toefl: '托福' };

export default {
  data() {
    return {
      mode: 'level',
      level: 'cet4',
      levelName: '四级',
      status: 'loading',
      loadingHint: 'DeepSeek 正在出题，请稍候…',
      errorMsg: '',
      words: [],
      index: 0,
      selected: '',
      answered: false,
      isCorrect: false,
      correctCount: 0,
      wrongCount: 0,
      degraded: false,
      notice: '',
      cardAnim: false,
      keys: ['A', 'B', 'C', 'D'],
      timer: null,
    };
  },
  computed: {
    current() {
      return this.words[this.index] || { options: [] };
    },
    progress() {
      return this.words.length ? Math.round(((this.index + (this.answered ? 1 : 0)) / this.words.length) * 100) : 0;
    },
    accuracy() {
      const total = this.correctCount + this.wrongCount;
      return total ? Math.round((this.correctCount / total) * 100) : 0;
    },
  },
  onLoad(options) {
    this.mode = options.mode === 'wrong' ? 'wrong' : 'level';
    this.level = options.level && LEVEL_NAME[options.level] ? options.level : 'cet4';
    this.levelName = this.mode === 'wrong' ? '错题复习' : LEVEL_NAME[this.level];
    uni.setNavigationBarTitle({ title: this.mode === 'wrong' ? '错题复习' : `${this.levelName}背单词` });
    this.loadBatch(false);
  },
  onUnload() {
    if (this.timer) clearTimeout(this.timer);
  },
  methods: {
    async loadBatch(refresh) {
      this.status = 'loading';
      this.loadingHint = this.mode === 'wrong' ? '正在整理你的错题…' : `DeepSeek 正在生成${this.levelName}单词…`;
      this.errorMsg = '';
      try {
        const res =
          this.mode === 'wrong'
            ? await api.wrongQuiz()
            : await api.words({ level: this.level, count: WORD_BATCH_SIZE, refresh, exclude: [] });

        const list = res.words || [];
        if (list.length === 0) {
          this.status = 'error';
          this.errorMsg = this.mode === 'wrong' ? '错题集是空的，先去背一组单词吧' : '没有拿到单词数据';
          return;
        }

        this.words = list;
        this.index = 0;
        this.selected = '';
        this.answered = false;
        this.isCorrect = false;
        this.correctCount = 0;
        this.wrongCount = 0;
        this.degraded = !!res.degraded;
        this.notice = res.message || '';
        this.status = 'playing';
      } catch (e) {
        this.status = 'error';
        this.errorMsg = e.message || '网络异常';
      }
    },
    choose(opt) {
      if (this.answered) return;
      this.selected = opt.text;
      this.answered = true;
      this.isCorrect = !!opt.correct;

      if (opt.correct) {
        this.correctCount += 1;
        this.timer = setTimeout(() => this.next(), 850);
      } else {
        this.wrongCount += 1;
        const { word, phonetic, pos, meaning, example, exampleZh, mnemonic } = this.current;
        api.wrongAdd({ word, phonetic, pos, meaning, example, exampleZh, mnemonic, level: this.level }).catch(() => {});
        uni.vibrateShort && uni.vibrateShort({ fail: () => {} });
      }
    },
    next() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.index + 1 >= this.words.length) {
        this.status = 'done';
        return;
      }
      this.cardAnim = true;
      setTimeout(() => {
        this.index += 1;
        this.selected = '';
        this.answered = false;
        this.isCorrect = false;
        this.cardAnim = false;
      }, 120);
    },
    optionClass(opt) {
      if (!this.answered) return '';
      if (opt.correct) return 'option-ok';
      if (this.selected === opt.text) return 'option-bad';
      return 'option-dim';
    },
    goWrong() {
      uni.switchTab({ url: '/pages/wrong/wrong' });
    },
    goBack() {
      uni.navigateBack({ delta: 1, fail: () => uni.switchTab({ url: '/pages/index/index' }) });
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
  --wash: #e8eef4;
  --accent: #0f7a6e;
  --accent-soft: #e6f4f1;
  --ok: #1a7f4b;
  --ok-soft: #e8f6ee;
  --bad: #c43c3c;
  --bad-soft: #fceeee;
  --warn: #9a6b14;
  --warn-soft: #f8f0dc;

  min-height: 100vh;
  padding: 28rpx 32rpx 64rpx;
  background:
    radial-gradient(ellipse 90% 50% at 100% 0%, rgba(15, 122, 110, 0.08), transparent 55%),
    linear-gradient(180deg, #edf2f7 0%, #f5f7fa 42%, #eef1f5 100%);
}

.center-box {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.center-mark {
  width: 96rpx;
  height: 96rpx;
  margin-bottom: 28rpx;
  border-radius: 20rpx;
  background: #f0f3f7;
  border: 1rpx solid var(--line);
  color: var(--muted);
  font-size: 48rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.center-mark.done {
  background: var(--accent-soft);
  border-color: rgba(15, 122, 110, 0.22);
  color: var(--accent);
}
.center-title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 1rpx;
}
.center-sub {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: var(--muted);
  text-align: center;
  line-height: 1.7;
  padding: 0 40rpx;
}
.spinner {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(15, 122, 110, 0.15);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  margin-bottom: 28rpx;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.stats {
  display: flex;
  align-items: center;
  margin: 40rpx 0 28rpx;
  padding: 28rpx 40rpx;
  border-radius: 20rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 140rpx;
}
.stat-num {
  font-size: 52rpx;
  font-weight: 700;
  color: var(--ink);
}
.stat-num.ok {
  color: var(--ok);
}
.stat-num.bad {
  color: var(--bad);
}
.stat-label {
  font-size: 22rpx;
  color: var(--muted);
  margin-top: 8rpx;
}
.stat-divider {
  width: 1rpx;
  height: 56rpx;
  background: var(--line);
  margin: 0 8rpx;
}

.btn-primary {
  margin-top: 36rpx;
  width: 420rpx;
  height: 88rpx;
  border-radius: 16rpx;
  background: var(--accent);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-ghost {
  margin-top: 18rpx;
  height: 80rpx;
  padding: 0 36rpx;
  border-radius: 16rpx;
  color: var(--muted);
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--line);
  background: rgba(255, 255, 255, 0.65);
}

.topbar {
  margin-bottom: 18rpx;
}
.progress-wrap {
  height: 8rpx;
  border-radius: 4rpx;
  background: rgba(26, 35, 50, 0.08);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 4rpx;
  background: var(--accent);
  transition: width 0.35s ease;
}
.topbar-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
}
.counter {
  font-size: 24rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}
.source-tag {
  font-size: 20rpx;
  color: var(--accent);
  padding: 4rpx 0;
}
.tag-fallback {
  color: var(--warn);
}

.notice {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  background: var(--warn-soft);
  border: 1rpx solid rgba(154, 107, 20, 0.18);
  font-size: 22rpx;
  color: var(--warn);
  line-height: 1.6;
}

.card {
  margin-top: 8rpx;
  min-height: 360rpx;
  border-radius: 24rpx;
  padding: 36rpx 32rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
  box-shadow: 0 10rpx 28rpx rgba(26, 35, 50, 0.05);
  display: flex;
  flex-direction: column;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.card-out {
  opacity: 0;
  transform: translateX(-28rpx);
}
.card-label {
  font-size: 22rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}
.word {
  margin-top: auto;
  font-size: 72rpx;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.5rpx;
  line-height: 1.2;
  word-break: break-word;
}
.meta-row {
  margin-top: 18rpx;
  margin-bottom: auto;
  display: flex;
  align-items: center;
}
.phonetic {
  font-size: 28rpx;
  color: var(--muted);
  margin-right: 16rpx;
}
.pos {
  font-size: 22rpx;
  color: var(--accent);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: var(--accent-soft);
}

.options {
  margin-top: 28rpx;
}
.option {
  display: flex;
  align-items: center;
  min-height: 100rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
  border-radius: 18rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.option-hover {
  background: #f8fafc;
  border-color: #c9d4e0;
}
.option-key {
  width: 44rpx;
  height: 44rpx;
  border-radius: 10rpx;
  background: #f0f3f7;
  color: var(--muted);
  font-size: 22rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  flex-shrink: 0;
}
.option-text {
  font-size: 30rpx;
  color: var(--ink);
  flex: 1;
  line-height: 1.5;
}
.option-mark {
  font-size: 30rpx;
  font-weight: 700;
  margin-left: 12rpx;
}
.option-ok {
  background: var(--ok-soft);
  border-color: rgba(26, 127, 75, 0.35);
}
.option-ok .option-text,
.option-ok .option-mark {
  color: var(--ok);
}
.option-ok .option-key {
  background: rgba(26, 127, 75, 0.12);
  color: var(--ok);
}
.option-bad {
  background: var(--bad-soft);
  border-color: rgba(196, 60, 60, 0.35);
}
.option-bad .option-text,
.option-bad .option-mark {
  color: var(--bad);
}
.option-bad .option-key {
  background: rgba(196, 60, 60, 0.12);
  color: var(--bad);
}
.option-dim {
  opacity: 0.42;
}

.detail {
  margin-top: 8rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: var(--paper);
  border: 1rpx solid var(--line);
  animation: fadeUp 0.22s ease both;
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.detail-ok {
  border-color: rgba(26, 127, 75, 0.28);
  background: linear-gradient(180deg, #f5fbf7 0%, var(--paper) 100%);
}
.detail-bad {
  border-color: rgba(196, 60, 60, 0.28);
  background: linear-gradient(180deg, #fdf6f6 0%, var(--paper) 100%);
}
.detail-head {
  display: flex;
  flex-direction: column;
  margin-bottom: 18rpx;
}
.detail-status {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 10rpx;
}
.detail-ok .detail-status {
  color: var(--ok);
}
.detail-bad .detail-status {
  color: var(--bad);
}
.detail-word {
  font-size: 30rpx;
  color: var(--ink);
  font-weight: 600;
}
.detail-block {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
}
.detail-tag {
  font-size: 20rpx;
  color: var(--accent);
  margin-bottom: 8rpx;
  letter-spacing: 1rpx;
}
.detail-en {
  font-size: 26rpx;
  color: var(--ink);
  line-height: 1.6;
}
.detail-zh {
  font-size: 24rpx;
  color: var(--muted);
  line-height: 1.7;
  margin-top: 4rpx;
}
.btn-next {
  margin-top: 26rpx;
  height: 84rpx;
  border-radius: 16rpx;
  background: var(--accent);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
