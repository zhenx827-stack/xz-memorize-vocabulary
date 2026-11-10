<template>
  <view class="page">
    <view class="glow" />

    <!-- 加载中 -->
    <view v-if="status === 'loading'" class="center-box">
      <view class="spinner" />
      <text class="center-title">AI 正在生成单词…</text>
      <text class="center-sub">{{ loadingHint }}</text>
    </view>

    <!-- 出错 -->
    <view v-else-if="status === 'error'" class="center-box">
      <text class="center-emoji">😵</text>
      <text class="center-title">加载失败</text>
      <text class="center-sub">{{ errorMsg }}</text>
      <view class="btn-primary" @tap="loadBatch(false)">重试</view>
      <view class="btn-ghost" @tap="goBack">返回</view>
    </view>

    <!-- 本轮结束 -->
    <view v-else-if="status === 'done'" class="center-box">
      <text class="center-emoji">{{ accuracy >= 80 ? '🎉' : accuracy >= 60 ? '💪' : '🌱' }}</text>
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
      <text class="center-sub">{{ wrongCount > 0 ? `已把 ${wrongCount} 个易错词收进错题集` : '全部答对，太强了！' }}</text>
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
          <view :class="['source-tag', degraded ? 'tag-fallback' : 'tag-ai']">
            <text>{{ degraded ? '本地词库' : 'AI 生成' }}</text>
          </view>
        </view>
      </view>

      <view v-if="degraded" class="notice">
        <text>⚠️ {{ notice }}</text>
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
          <text class="detail-tag">AI 记忆法</text>
          <text class="detail-zh">{{ current.mnemonic }}</text>
        </view>
        <view v-if="!isCorrect" class="btn-next" @tap="next">继续下一个 →</view>
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
        // 答对自动进入下一题
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
  min-height: 100vh;
  padding: 32rpx 36rpx 60rpx;
  background: #0a0f1e;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: 520rpx;
  height: 520rpx;
  top: -180rpx;
  left: -140rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(109, 155, 255, 0.28), rgba(109, 155, 255, 0));
  filter: blur(60rpx);
  pointer-events: none;
}

/* 通用居中盒子 */
.center-box {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}
.center-emoji {
  font-size: 90rpx;
  margin-bottom: 24rpx;
}
.center-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #f2f6ff;
}
.center-sub {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #7c8aab;
  text-align: center;
  line-height: 1.7;
  padding: 0 40rpx;
}
.spinner {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 5rpx solid rgba(109, 155, 255, 0.2);
  border-top-color: #6d9bff;
  animation: spin 0.85s linear infinite;
  margin-bottom: 30rpx;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.stats {
  display: flex;
  align-items: center;
  margin: 44rpx 0 30rpx;
  padding: 30rpx 50rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.07);
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
  color: #f2f6ff;
}
.stat-num.ok {
  color: #4ade80;
}
.stat-num.bad {
  color: #fb7185;
}
.stat-label {
  font-size: 22rpx;
  color: #7c8aab;
  margin-top: 8rpx;
}
.stat-divider {
  width: 1rpx;
  height: 60rpx;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 10rpx;
}

.btn-primary {
  margin-top: 40rpx;
  width: 420rpx;
  height: 92rpx;
  border-radius: 46rpx;
  background: linear-gradient(135deg, #5b8cff, #7c5cff);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 14rpx 34rpx rgba(91, 140, 255, 0.32);
}
.btn-ghost {
  margin-top: 20rpx;
  height: 84rpx;
  padding: 0 40rpx;
  border-radius: 42rpx;
  color: #8fa2c9;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(255, 255, 255, 0.12);
}

/* 顶部进度 */
.topbar {
  position: relative;
  z-index: 1;
  margin-bottom: 18rpx;
}
.progress-wrap {
  height: 10rpx;
  border-radius: 6rpx;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 6rpx;
  background: linear-gradient(90deg, #5b8cff, #8f6bff);
  transition: width 0.35s ease;
}
.topbar-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}
.counter {
  font-size: 24rpx;
  color: #7c8aab;
  letter-spacing: 1rpx;
}
.source-tag {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.tag-ai {
  background: rgba(109, 155, 255, 0.14);
  color: #8fb4ff;
}
.tag-fallback {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
}

.notice {
  position: relative;
  z-index: 1;
  margin-bottom: 16rpx;
  padding: 16rpx 22rpx;
  border-radius: 18rpx;
  background: rgba(250, 204, 21, 0.09);
  border: 1rpx solid rgba(250, 204, 21, 0.22);
  font-size: 21rpx;
  color: #e9c95a;
  line-height: 1.6;
}

/* 单词卡 */
.card {
  position: relative;
  z-index: 1;
  margin-top: 14rpx;
  height: 400rpx;
  border-radius: 36rpx;
  padding: 34rpx;
  background: linear-gradient(155deg, #1a2545 0%, #121a2f 100%);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  transition: all 0.18s ease;
}
.card-out {
  opacity: 0;
  transform: translateX(-40rpx);
}
.card-label {
  font-size: 22rpx;
  color: #7c8aab;
  letter-spacing: 1rpx;
}
.word {
  margin-top: auto;
  font-size: 76rpx;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 1rpx;
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
  color: #93a4c9;
  margin-right: 18rpx;
}
.pos {
  font-size: 22rpx;
  color: #6d9bff;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  background: rgba(109, 155, 255, 0.12);
}

/* 选项 */
.options {
  position: relative;
  z-index: 1;
  margin-top: 32rpx;
}
.option {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: 20rpx 26rpx;
  margin-bottom: 20rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.035);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  transition: all 0.18s ease;
}
.option-hover {
  background: rgba(255, 255, 255, 0.07);
}
.option-key {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.07);
  color: #93a4c9;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 22rpx;
  flex-shrink: 0;
}
.option-text {
  font-size: 30rpx;
  color: #dbe4f8;
  flex: 1;
  line-height: 1.5;
}
.option-mark {
  font-size: 32rpx;
  font-weight: 700;
  margin-left: 12rpx;
}
.option-ok {
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.5);
}
.option-ok .option-text,
.option-ok .option-mark {
  color: #4ade80;
}
.option-ok .option-key {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
.option-bad {
  background: rgba(244, 63, 94, 0.13);
  border-color: rgba(244, 63, 94, 0.5);
}
.option-bad .option-text,
.option-bad .option-mark {
  color: #fb7185;
}
.option-bad .option-key {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}
.option-dim {
  opacity: 0.45;
}

/* 解析 */
.detail {
  position: relative;
  z-index: 1;
  margin-top: 12rpx;
  padding: 30rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  animation: fadeUp 0.25s ease both;
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.detail-ok {
  border-color: rgba(34, 197, 94, 0.3);
}
.detail-bad {
  border-color: rgba(244, 63, 94, 0.3);
}
.detail-head {
  display: flex;
  flex-direction: column;
  margin-bottom: 20rpx;
}
.detail-status {
  font-size: 24rpx;
  font-weight: 600;
  color: #93a4c9;
  margin-bottom: 10rpx;
}
.detail-ok .detail-status {
  color: #4ade80;
}
.detail-bad .detail-status {
  color: #fb7185;
}
.detail-word {
  font-size: 30rpx;
  color: #f2f6ff;
  font-weight: 600;
}
.detail-block {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
}
.detail-tag {
  font-size: 20rpx;
  color: #6d9bff;
  margin-bottom: 8rpx;
  letter-spacing: 1rpx;
}
.detail-en {
  font-size: 26rpx;
  color: #dbe4f8;
  line-height: 1.6;
}
.detail-zh {
  font-size: 24rpx;
  color: #8fa2c9;
  line-height: 1.7;
  margin-top: 4rpx;
}
.btn-next {
  margin-top: 28rpx;
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
</style>
