const DEFAULT_RULE_DURATION_SECONDS = 20 * 60;
const fallbackShared = {
  DEFAULT_THRESHOLD_SECONDS: 180,
  DEFAULT_CLEAN_ENDING_ENABLED: true,
  DEFAULT_BLACKLIST_SETTINGS: {
    enabled: true,
    lastFetched: 0,
    biliBlacks: [],
    customBlacks: []
  },
  DEFAULT_CLIP_SETTINGS: { rules: [] },
  DEFAULT_FOLLOW_SETTINGS: { enabled: true, lastFetched: 0, follows: [] },
  STORAGE_KEY: 'thresholdSeconds',
  CLEAN_ENDING_KEY: 'cleanEndingEnabled',
  CLIP_SETTINGS_KEY: 'clipFilterSettings',
  BLACKLIST_SETTINGS_KEY: 'authorBlacklistSettings',
  FOLLOW_SETTINGS_KEY: 'followWhitelistSettings',
  BLOCKED_VIDEOS_KEY: 'customBlockedVideos',
  readBlockedVideos() {
    return Promise.resolve([]);
  },
  saveBlockedVideos(val) {
    return Promise.resolve(val);
  },
  readDecisionRecords() {
    return Promise.resolve([]);
  },
  saveDecisionRecord() {
    return Promise.resolve([]);
  },
  clearDecisionRecords() {
    return Promise.resolve();
  },
  resolveStorageArea() {
    return { area: null, name: 'sync' };
  },
  resolveFollowStorageArea() {
    return { area: null, name: 'local' };
  },
  normalizeThreshold(value) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 60;
    }
    return numeric;
  },
  normalizeClipSettings(value) {
    if (!value || typeof value !== 'object') {
      return { rules: [] };
    }
    const rules = Array.isArray(value.rules) ? value.rules : [];
    return {
      rules: rules
        .map((rule) => ({
          enabled: rule && rule.enabled !== false,
          keywords: Array.isArray(rule?.keywords)
            ? rule.keywords.map((text) => String(text || '').trim()).filter(Boolean)
            : [],
          allowedAuthors: Array.isArray(rule?.allowedAuthors)
            ? rule.allowedAuthors.map((text) => String(text || '').trim()).filter(Boolean)
            : [],
          maxDurationSeconds: (() => {
            const duration = Number.parseInt(rule?.maxDurationSeconds, 10);
            if (Number.isFinite(duration) && duration > 0) {
              return duration;
            }
            return 60;
          })()
        }))
        .filter((rule) => rule.keywords.length > 0)
    };
  },
  normalizeFollowSettings(value) {
    return value || { enabled: true, lastFetched: 0, follows: [] };
  },
  readFollowSettings() {
    return Promise.resolve({ enabled: true, lastFetched: 0, follows: [] });
  },
  saveFollowSettings(val) {
    return Promise.resolve(val);
  },
  readThreshold() {
    return Promise.resolve(60);
  },
  readCleanEnding() {
    return Promise.resolve(true);
  },
  normalizeBlacklistSettings(value) {
    return value || { enabled: true, lastFetched: 0, biliBlacks: [], customBlacks: [] };
  },
  readBlacklistSettings() {
    return Promise.resolve({
      enabled: true,
      lastFetched: 0,
      biliBlacks: [],
      customBlacks: []
    });
  },
  saveBlacklistSettings(val) {
    return Promise.resolve(val);
  },
  readClipSettings() {
    return Promise.resolve({ rules: [] });
  }
};
const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || fallbackShared;

const {
  DEFAULT_THRESHOLD_SECONDS,
  DEFAULT_CLEAN_ENDING_ENABLED,
  DEFAULT_CLIP_SETTINGS,
  DEFAULT_FOLLOW_SETTINGS,
  DEFAULT_BLACKLIST_SETTINGS,
  STORAGE_KEY,
  CLEAN_ENDING_KEY,
  CLIP_SETTINGS_KEY,
  FOLLOW_SETTINGS_KEY,
  BLACKLIST_SETTINGS_KEY,
  resolveStorageArea,
  resolveFollowStorageArea,
  normalizeThreshold,
  readThreshold,
  readCleanEnding,
  normalizeClipSettings,
  readClipSettings,
  normalizeFollowSettings,
  readFollowSettings,
  saveFollowSettings,
  normalizeBlacklistSettings,
  readBlacklistSettings,
  saveBlacklistSettings,
  BLOCKED_VIDEOS_KEY,
  readBlockedVideos,
  saveBlockedVideos,
  readDecisionRecords: sharedReadDecisionRecords,
  saveDecisionRecord: sharedSaveDecisionRecord,
  saveDecisionRecords: sharedSaveDecisionRecords,
  clearDecisionRecords: sharedClearDecisionRecords
} = shared;
// shared.js 旧版本没有这些导出，解构会得到 undefined，这里用 shared.xxx 兜底。
const OPERATOR_CARDS_KEY = shared.OPERATOR_CARDS_KEY || 'hideOperatorCardsEnabled';
const readHideOperatorCards =
  typeof shared.readHideOperatorCards === 'function'
    ? shared.readHideOperatorCards
    : () => Promise.resolve(true);
const HIDDEN_CLASS = 'bili-short-video-blocker__hidden';

// 调试日志默认关闭：console.debug 会在控制台打开时对每张卡片产生序列化与对象持有开销。
const DEBUG_ENABLED = false;
function debugLog(...args) {
  if (!DEBUG_ENABLED || typeof console === 'undefined' || !console.debug) {
    return;
  }
  console.debug(...args);
}

let cleanEndingEnabled =
  typeof DEFAULT_CLEAN_ENDING_ENABLED === 'boolean'
    ? DEFAULT_CLEAN_ENDING_ENABLED
    : true;
// 是否直接隐藏运营推广卡（spm_id_from=...playrecommendByOp，如右侧推荐栏置顶的
// 明星/品牌付费推广）。这类卡片结构可识别，判定不进决策记录，关闭开关即恢复。
let hideOperatorCardsEnabled =
  typeof shared.DEFAULT_HIDE_OPERATOR_CARDS_ENABLED === 'boolean'
    ? shared.DEFAULT_HIDE_OPERATOR_CARDS_ENABLED
    : true;

const ENDING_SCREEN_STYLE = `
.bpx-player-ending-related,
.bilibili-player-ending-panel-box-videos {
  display: none !important;
}
.bpx-player-ending-backdrop:before {
  display: none !important;
}
.bpx-player-ending-backdrop {
  background-image: none !important;
  background-color: #070707 !important;
}
.bpx-player-ending-content,
.bilibili-player-ending-panel-box {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  height: 100% !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  margin: auto !important;
  transform: none !important;
}
`;

const VIDEO_BLOCK_BTN_STYLE = `
/* 悬浮拉黑按钮不再插入 B 站自己的卡片节点（右侧推荐栏是 Vue 渲染的，
   往托管 DOM 里 appendChild 会与框架的 patch 相互触发）。
   现在只写一个 data-bsrb-btn 属性，按钮本体是挂在 body 上的单个共享浮层。 */
[data-bsrb-btn] {
  cursor: pointer;
}
.bsrb-video-block-btn {
  position: fixed;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, background 0.15s ease;
  z-index: 2147483000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.bsrb-video-block-btn svg {
  width: 13px;
  height: 13px;
  fill: #fff;
  pointer-events: none;
}
.bsrb-video-block-btn.is-active {
  opacity: 1;
  pointer-events: auto;
}
.bsrb-video-block-btn:hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  box-shadow: 0 3px 12px rgba(255, 77, 79, 0.65);
}
#bsrb-toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(24, 25, 28, 0.95);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px 22px;
  border-radius: 8px;
  font-size: 13.5px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  opacity: 0;
  pointer-events: none;
  transition: all 0.22s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  z-index: 999999;
}
#bsrb-toast.bsrb-toast-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
`;
const DURATION_PATTERN = /(\d{1,2}:)?\d{1,2}:\d{2}/;
const FOLLOW_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DECISION_RECORDS_KEY = 'decisionRecords';
const DECISION_RECORD_LIMIT = 200;

const TITLE_SELECTORS = [
  '.bili-video-card__info--title',
  '.bili-video-card__info--tit',
  '.bili-video-card__title',
  '.video-card__info .title',
  '.video-card__info--tit',
  '.video-name',
  '.video-page-card-small .title',
  'a.title'
];

const AUTHOR_SELECTORS = [
  '.bili-video-card__info--author',
  '.bili-video-card__info--owner',
  '.video-card__info .author',
  '.video-card__info .up-name',
  '.video-page-card-small .up-name',
  '.upname .name',
  '.up-name .name',
  '.up-name',
  '.author',
  '.name'
];

function normalizeTextListLocal(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const result = [];
  values.forEach((item) => {
    String(item || '')
      .split(/(?:\r?\n|\\n)+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => result.push(part));
  });
  return result;
}

const CARD_CONFIGS = [
  {
    name: 'grid-card',
    // 搜索结果页的卡片外层是 .bili-video-card__wrap（内部结构与首页一致，
    // 但不存在精确的 .bili-video-card），不加这一条该页完全匹配不到。
    cardSelector: ['.bili-video-card', '.bili-video-card__wrap'],
    durationSelectors: [
      '.bili-video-card__stats__duration',
      '.bili-video-card__mask span.duration',
      '.bili-video-card__info--right span'
    ],
    wrapperSelectors: ['.feed-card', '.bili-feed-card'],
    titleSelectors: TITLE_SELECTORS,
    authorSelectors: AUTHOR_SELECTORS
  },
  {
    name: 'right-rail-card',
    cardSelector: [
      '.video-page-card-small',
      'a.video-page-card-small',
      '.video-card-reco',
      '.recommend-video-card'
    ],
    durationSelectors: ['.duration', '.time', '.video-duration', '.card-duration', '.bili-video-card__stats__duration'],
    titleSelectors: TITLE_SELECTORS,
    authorSelectors: AUTHOR_SELECTORS
  },
  {
    name: 'list-card',
    cardSelector: [
      'li.video-list-item',
      'li.video-item',
      '.video-card-common',
      '.video-page-operator-card',
      // 视频页右侧推荐栏的运营推广卡（spm_id_from=...playrecommendByOp）。
      // 类名带 -small 后缀，与上面的 .video-page-operator-card 整词不匹配；
      // 不加这一条，这类广告卡永远不会被登记，也就没有悬浮拉黑按钮、
      // 不参与时长/关键词/UP主黑名单过滤。
      '.video-page-operator-card-small'
    ],
    durationSelectors: ['.time', '.duration', '.video-duration', '.card-duration'],
    titleSelectors: TITLE_SELECTORS,
    authorSelectors: AUTHOR_SELECTORS
  }
];

const ALL_CARD_SELECTOR = CARD_CONFIGS.map((config) =>
  Array.isArray(config.cardSelector) ? config.cardSelector.join(',') : config.cardSelector
)
  .filter(Boolean)
  .join(',');

const trackedCards = new Set();
const videoMetadataCache = new Map();
const videoIdsCache = new WeakMap();
const blockedVideoCache = new Map(); // key -> { result: boolean, timestamp: number }
const decisionFinalCache = new Map(); // key -> { result: 'block' | 'allow', timestamp }
let decisionRecords = [];
let clipSettings = createClipSettings(DEFAULT_CLIP_SETTINGS);
let followSettings = createFollowSettings(DEFAULT_FOLLOW_SETTINGS);
let followFetchPromise = null;
let followNameSet = buildFollowNameSet(followSettings);
const BLACKLIST_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
// 单页会话内名单类接口的拉取次数上限：即使数据异常也不会退化成无休止的拉取-写入循环。
const LIST_FETCH_MAX_PER_SESSION = 3;
let listFetchCount = 0;
let blacklistSettings = createBlacklistSettings(DEFAULT_BLACKLIST_SETTINGS);
let blacklistUidSet = buildBlacklistUidSet(blacklistSettings);
let blacklistFetchPromise = null;
let blockedVideosList = [];
let blockedVideoIdsSet = new Set();
let thresholdSeconds = DEFAULT_THRESHOLD_SECONDS;
let storageArea = null;
let storageAreaName = 'sync';
let scanScheduled = false;
let decisionStorageArea = null;
let decisionStorageAreaName = 'local';
let lastScanAt = 0;
let lastMutationAt = 0;
let scanRetryTimer = null;
let idleScanTimer = null;
const pendingScanRoots = new Set();
// 扫描节流参数：B 站播放页每秒可产生数十次 DOM 变动，需要限流避免主线程卡死。
const SCAN_MIN_INTERVAL_MS = 120;
const SCAN_IDLE_FULL_MS = 400;
const SCAN_FULL_FALLBACK_THRESHOLD = 12;

function readDecisionRecordsFromStorage() {
  const decisionStorage = decisionStorageArea || resolveFollowStorageArea().area || resolveStorageArea().area;
  if (typeof sharedReadDecisionRecords === 'function') {
    return sharedReadDecisionRecords(decisionStorage);
  }
  return Promise.resolve([]);
}

function hydrateBlockedCacheFromRecords(records, reset = false) {
  if (reset) {
    blockedVideoCache.clear();
    decisionFinalCache.clear();
  }
  if (!Array.isArray(records)) {
    return;
  }
  records.forEach((record) => {
    if (!record || !record.id) {
      return;
    }
    if (record.result === 'block') {
      blockedVideoCache.set(record.id, {
        result: true,
        timestamp: Number.isFinite(Number(record.timestamp)) ? Number(record.timestamp) : Date.now()
      });
      decisionFinalCache.set(record.id, { result: 'block', timestamp: Date.now() });
    } else if (record.result === 'allow') {
      decisionFinalCache.set(record.id, { result: 'allow', timestamp: Date.now() });
    }
  });
}

function recordDecision(entry) {
  if (!entry || !entry.id) {
    return;
  }
  const existing = decisionRecords.find(
    (item) => item && item.id === entry.id && item.result === (entry.result === 'allow' ? 'allow' : 'block')
  );
  const normalized = {
    id: entry.id,
    title: String(entry.title || '').trim(),
    author: String(entry.author || '').trim(),
    durationSeconds: Number.isFinite(Number(entry.durationSeconds))
      ? Number(entry.durationSeconds)
      : null,
    result: entry.result === 'allow' ? 'allow' : 'block',
    reason: String(entry.reason || '').trim(),
    timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : Date.now()
  };
  decisionRecords = [
    normalized,
    ...decisionRecords.filter(
      (item) => !(item && item.id === normalized.id && item.result === normalized.result)
    )
  ].slice(0, DECISION_RECORD_LIMIT);
  if (normalized.result === 'block') {
    blockedVideoCache.set(normalized.id, { result: true, timestamp: normalized.timestamp });
    decisionFinalCache.set(normalized.id, { result: 'block', timestamp: normalized.timestamp });
  } else if (blockedVideoCache.has(normalized.id)) {
    const stillBlocked = decisionRecords.some(
      (item) => item && item.id === normalized.id && item.result === 'block'
    );
    if (!stillBlocked) {
      blockedVideoCache.delete(normalized.id);
    }
    decisionFinalCache.set(normalized.id, { result: 'allow', timestamp: normalized.timestamp });
  } else {
    decisionFinalCache.set(normalized.id, { result: 'allow', timestamp: normalized.timestamp });
  }
  // 判定结果与原因都未变化时无需再次落盘。
  const unchanged =
    existing &&
    existing.title === normalized.title &&
    existing.author === normalized.author &&
    existing.reason === normalized.reason &&
    existing.durationSeconds === normalized.durationSeconds;
  if (!unchanged) {
    queueDecisionPersist(normalized);
  }
}

// 原实现每张卡片都做一次 storage get + set（读改写），一次加载几十张卡片就会产生几十次
// 跨进程 IPC 与 JSON 序列化，是打开视频时主线程卡顿的主因。改为去重后批量落盘。
const DECISION_FLUSH_DELAY_MS = 400;
const pendingDecisionWrites = new Map();
let decisionFlushTimer = null;

function queueDecisionPersist(record) {
  pendingDecisionWrites.set(`${record.id}:${record.result}`, record);
  if (decisionFlushTimer) {
    return;
  }
  decisionFlushTimer = setTimeout(flushDecisionWrites, DECISION_FLUSH_DELAY_MS);
}

function flushDecisionWrites() {
  decisionFlushTimer = null;
  if (!pendingDecisionWrites.size) {
    return;
  }
  const batch = Array.from(pendingDecisionWrites.values());
  pendingDecisionWrites.clear();
  const area = decisionStorageArea || resolveFollowStorageArea().area || storageArea;
  if (typeof sharedSaveDecisionRecords === 'function') {
    Promise.resolve()
      .then(() => sharedSaveDecisionRecords(batch, area))
      .then((records) => {
        if (Array.isArray(records) && records.length) {
          decisionRecords = records;
          hydrateBlockedCacheFromRecords(decisionRecords, true);
        }
      })
      .catch(() => {
        // 落盘失败不阻断页面逻辑，内存缓存已是最新状态。
      });
    return;
  }
  // 兼容旧版 shared.js：退化为逐条写入。
  if (typeof sharedSaveDecisionRecord === 'function') {
    batch.forEach((record) => {
      try {
        sharedSaveDecisionRecord(record, area).catch(() => {});
      } catch (error) {
        // 忽略单条写入失败。
      }
    });
  }
}

function readCardTitle(card, config) {
  let title = readSingleTextFromSelectors(card, config && config.titleSelectors, TITLE_SELECTORS);
  if (!title) {
    title = readExtraTitle(card);
  }
  return title || '';
}

function readCardAuthor(card, config) {
  let author = readSingleTextFromSelectors(card, config && config.authorSelectors, AUTHOR_SELECTORS);
  if (!author && card && card.dataset && card.dataset.bsrbExtraAuthor) {
    author = card.dataset.bsrbExtraAuthor;
  }
  return author || '';
}

function readCardAuthorUid(card) {
  if (!card || !(card instanceof HTMLElement)) {
    return null;
  }
  if (card.dataset && card.dataset.bsrbAuthorUid) {
    const val = Number.parseInt(card.dataset.bsrbAuthorUid, 10);
    if (Number.isFinite(val)) {
      return val;
    }
  }
  const anchors = card.querySelectorAll('a[href*="space.bilibili.com/"]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    const match = href.match(/space\.bilibili\.com\/(\d+)/);
    if (match && match[1]) {
      const val = Number.parseInt(match[1], 10);
      if (Number.isFinite(val)) {
        card.dataset.bsrbAuthorUid = String(val);
        return val;
      }
    }
  }
  const userEl = card.querySelector('[data-user-id]');
  if (userEl && userEl.dataset && userEl.dataset.userId) {
    const val = Number.parseInt(userEl.dataset.userId, 10);
    if (Number.isFinite(val)) {
      card.dataset.bsrbAuthorUid = String(val);
      return val;
    }
  }
  return null;
}

if (!shouldBypassPage()) {
  bootstrapDiagnostics();
  try {
    init();
  } catch (error) {
    reportBootstrapError(error);
  }
}

// 真站上任何静默失败都会表现为“插件没反应”，很难排查。
// 把状态写到 <html> 的 data-bsrb-status 上，控制台一行即可确认：
//   document.documentElement.dataset.bsrbStatus
function bootstrapDiagnostics() {
  if (!document.documentElement) {
    return;
  }
  document.documentElement.dataset.bsrbStatus = 'starting';
  window.addEventListener('error', (event) => {
    reportBootstrapError(event.error || new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportBootstrapError(event.reason || new Error('unhandled rejection'));
  });
}

function reportBootstrapError(error) {
  const message = (error && (error.message || String(error))) || 'unknown error';
  if (document.documentElement && document.documentElement.dataset.bsrbStatus === 'error') {
    return;
  }
  if (document.documentElement) {
    document.documentElement.dataset.bsrbStatus = 'error';
    document.documentElement.dataset.bsrbError = message;
  }
  if (typeof console !== 'undefined' && console.error) {
    console.error('[ShortVideoBlocker] 初始化失败:', message, error);
  }
  try {
    showBlockToast(`插件初始化失败：${message.slice(0, 40)}`);
  } catch (toastError) {
    // toast 自身不可用时忽略
  }
}

function markBootstrapReady() {
  if (document.documentElement && document.documentElement.dataset.bsrbStatus === 'starting') {
    document.documentElement.dataset.bsrbStatus = 'ok';
  }
}

function init() {
  ensureStyleInjected();
  const resolvedStorage = resolveStorageArea();
  storageArea = resolvedStorage.area;
  storageAreaName = resolvedStorage.name;
  const followStorage = resolveFollowStorageArea();
  decisionStorageArea = followStorage.area || storageArea;
  decisionStorageAreaName = followStorage.name || storageAreaName;
  Promise.all([
    readThreshold(storageArea).catch(() => DEFAULT_THRESHOLD_SECONDS),
    readClipSettings(storageArea).catch(() => DEFAULT_CLIP_SETTINGS),
    readFollowSettings(decisionStorageArea || storageArea).catch(() => DEFAULT_FOLLOW_SETTINGS),
    typeof readBlacklistSettings === 'function'
      ? readBlacklistSettings(decisionStorageArea || storageArea).catch(() => DEFAULT_BLACKLIST_SETTINGS)
      : Promise.resolve(DEFAULT_BLACKLIST_SETTINGS),
    typeof readBlockedVideos === 'function'
      ? readBlockedVideos(decisionStorageArea || storageArea).catch(() => [])
      : Promise.resolve([]),
    readDecisionRecordsFromStorage().catch(() => []),
    typeof readCleanEnding === 'function'
      ? readCleanEnding(storageArea).catch(() => DEFAULT_CLEAN_ENDING_ENABLED)
      : Promise.resolve(DEFAULT_CLEAN_ENDING_ENABLED),
    typeof readHideOperatorCards === 'function'
      ? readHideOperatorCards(storageArea).catch(() => true)
      : Promise.resolve(true)
  ])
    .then(([rawThreshold, rawClipSettings, rawFollowSettings, rawBlacklistSettings, rawBlockedVideos, records, rawCleanEnding, rawHideOperatorCards]) => {
      thresholdSeconds = normalizeThreshold(rawThreshold);
      clipSettings = createClipSettings(rawClipSettings);
      followSettings = createFollowSettings(rawFollowSettings);
      followNameSet = buildFollowNameSet(followSettings);
      blacklistSettings = createBlacklistSettings(rawBlacklistSettings);
      blacklistUidSet = buildBlacklistUidSet(blacklistSettings);
      blockedVideosList = Array.isArray(rawBlockedVideos) ? rawBlockedVideos : [];
      blockedVideoIdsSet = buildBlockedVideoIdsSet(blockedVideosList);
      decisionRecords = Array.isArray(records) ? records : [];
      cleanEndingEnabled = rawCleanEnding !== false;
      hideOperatorCardsEnabled = rawHideOperatorCards !== false;
      hydrateBlockedCacheFromRecords(decisionRecords, true);
      ensureStyleInjected();
      if (typeof console !== 'undefined' && console.debug) {
        const ruleCount = Array.isArray(clipSettings?.rules) ? clipSettings.rules.length : 0;
        const followCount = Array.isArray(followSettings?.follows)
          ? followSettings.follows.length
          : 0;
        const blacklistCount =
          (blacklistSettings?.biliBlacks?.length || 0) + (blacklistSettings?.customBlacks?.length || 0);
        debugLog(
          '[ShortVideoBlocker][Init]',
          'init:settings',
          `thresholdSeconds=${thresholdSeconds}`,
          `rules=${ruleCount}`,
          `followEnabled=${Boolean(followSettings.enabled)}`,
          `followCount=${followCount}`,
          `blacklistCount=${blacklistCount}`,
          `decisionRecords=${decisionRecords.length}`
        );
      }
      ensureFollowWhitelist();
      ensureBlacklist();
      scanForCards(document.body);
      observeMutations();
      markBootstrapReady();
    })
    .catch(() => {
      thresholdSeconds = DEFAULT_THRESHOLD_SECONDS;
      clipSettings = createClipSettings(DEFAULT_CLIP_SETTINGS);
      followSettings = createFollowSettings(DEFAULT_FOLLOW_SETTINGS);
      followNameSet = buildFollowNameSet(followSettings);
      blacklistSettings = createBlacklistSettings(DEFAULT_BLACKLIST_SETTINGS);
      blacklistUidSet = buildBlacklistUidSet(blacklistSettings);
      if (typeof console !== 'undefined' && console.debug) {
        const ruleCount = Array.isArray(clipSettings?.rules) ? clipSettings.rules.length : 0;
        const followCount = Array.isArray(followSettings?.follows)
          ? followSettings.follows.length
          : 0;
        debugLog(
          '[ShortVideoBlocker][ClipRule]',
          'init:settings:fallback',
          `thresholdSeconds=${thresholdSeconds}`,
          `rules=${ruleCount}`,
          `followEnabled=${Boolean(followSettings.enabled)}`,
          `followCount=${followCount}`,
          'decisionRecords=0'
        );
      }
      ensureFollowWhitelist();
      scanForCards(document.body);
      observeMutations();
      markBootstrapReady();
    });
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
  // 页面离开前补一次落盘，避免定时器未触发时丢失判定记录。
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', () => {
      if (decisionFlushTimer) {
        clearTimeout(decisionFlushTimer);
        decisionFlushTimer = null;
      }
      flushDecisionWrites();
    });
  }
}

function shouldBypassPage() {
  if (typeof window === 'undefined') {
    return true;
  }
  const host = window.location.hostname || '';
  if (host.endsWith('space.bilibili.com')) {
    return true;
  }
  if (host.endsWith('search.bilibili.com')) {
    return true;
  }
  return false;
}

function handleStorageChange(changes, areaName) {
  // 关注/黑名单/拉黑列表与判定记录存于 local 区，阈值与规则存于 sync 区，两者都需响应。
  if (areaName !== storageAreaName && areaName !== decisionStorageAreaName) {
    return;
  }
  let shouldRescan = false;
  if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
    const newValue = normalizeThreshold(changes[STORAGE_KEY].newValue);
    if (newValue !== thresholdSeconds) {
      thresholdSeconds = newValue;
      shouldRescan = true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, CLIP_SETTINGS_KEY)) {
    clipSettings = createClipSettings(changes[CLIP_SETTINGS_KEY].newValue);
    shouldRescan = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, CLEAN_ENDING_KEY)) {
    const newValue = changes[CLEAN_ENDING_KEY].newValue !== false;
    if (newValue !== cleanEndingEnabled) {
      cleanEndingEnabled = newValue;
      ensureStyleInjected();
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, OPERATOR_CARDS_KEY)) {
    const newValue = changes[OPERATOR_CARDS_KEY].newValue !== false;
    if (newValue !== hideOperatorCardsEnabled) {
      hideOperatorCardsEnabled = newValue;
      // 运营卡判定不落盘，开关切换后必须实时重扫已登记卡片。
      requestRescan();
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, FOLLOW_SETTINGS_KEY)) {
    const next = createFollowSettings(changes[FOLLOW_SETTINGS_KEY].newValue);
    const enabledToggled = next.enabled !== followSettings.enabled;
    followSettings = next;
    followNameSet = buildFollowNameSet(followSettings);
    // 仅在开关被用户切换时强制拉取；否则这会是本扩展自己写入引发的写-拉取死循环。
    if (enabledToggled) {
      ensureFollowWhitelist(true);
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, BLACKLIST_SETTINGS_KEY)) {
    blacklistSettings = createBlacklistSettings(changes[BLACKLIST_SETTINGS_KEY].newValue);
    blacklistUidSet = buildBlacklistUidSet(blacklistSettings);
    // 同上：只有启用状态变化才重新拉取。
    if (blacklistSettings.enabled) {
      ensureBlacklist();
    }
    shouldRescan = true;
  }
  if (Object.prototype.hasOwnProperty.call(changes, BLOCKED_VIDEOS_KEY)) {
    blockedVideosList = Array.isArray(changes[BLOCKED_VIDEOS_KEY].newValue)
      ? changes[BLOCKED_VIDEOS_KEY].newValue
      : [];
    blockedVideoIdsSet = buildBlockedVideoIdsSet(blockedVideosList);
    shouldRescan = true;
  }
  if (shouldRescan) {
    requestRescan();
  }
}

// rescan 必须排队执行：storage 事件可能在同一轮里成批到达，
// 直接同步重扫会把整页卡片反复重算，直接拖垮播放器初始化阶段的主线程。
let rescanScheduled = false;
let lastRescanAt = 0;
const RESCAN_MIN_INTERVAL_MS = 250;

function requestRescan() {
  if (rescanScheduled) {
    return;
  }
  rescanScheduled = true;
  requestAnimationFrame(() => {
    rescanScheduled = false;
    const wait = RESCAN_MIN_INTERVAL_MS - (performance.now() - lastRescanAt);
    if (wait > 0) {
      setTimeout(() => {
        lastRescanAt = performance.now();
        rescanTrackedCards();
      }, wait);
      return;
    }
    lastRescanAt = performance.now();
    rescanTrackedCards();
  });
}

function ensureStyleInjected() {
  let style = document.getElementById('bili-short-video-blocker-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'bili-short-video-blocker-style';
    document.head.appendChild(style);
  }
  let css = `.${HIDDEN_CLASS}{display:none !important;}`;
  if (cleanEndingEnabled) {
    css += `\n${ENDING_SCREEN_STYLE}`;
  }
  css += `\n${VIDEO_BLOCK_BTN_STYLE}`;
  // 重写 textContent 会触发全文档样式重算，内容未变时直接跳过。
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

function observeMutations() {
  if (!document.body) {
    return;
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // 框架会先插入卡片骨架、之后再把真实链接写进已挂载节点（href 属于属性变更，
      // childList 观察不到）。不处理的话这些卡片将永远拿不到 id。
      // 框架先插入卡片骨架，之后再把真实链接（href 属性）和时长文本（文本节点的
      // data）分别写进已挂载节点。href 属于 attributes 能收到，而文本节点被补写时
      // 触发的是 characterData —— 之前没开这个开关，这类卡片永远停留在“读不到时长”
      // 的状态，等于对它们彻底失效。这里只补扫所属卡片，不扫整个容器。
      if (mutation.type === 'characterData') {
        const parent = mutation.target && mutation.target.parentElement;
        if (parent && !isOwnNode(parent)) {
          const card = parent.closest ? parent.closest(ALL_CARD_SELECTOR) : null;
          if (card) {
            scheduleScan(card);
          }
        }
        continue;
      }
      if (mutation.type === 'attributes') {
        const el = mutation.target;
        if (el && el.nodeType === 1) {
          const card = el.closest && el.closest(ALL_CARD_SELECTOR);
          scheduleScan(card || el);
        }
        continue;
      }
      if (!mutation.addedNodes || mutation.addedNodes.length === 0) {
        continue;
      }
      // 优先扫“插入发生的父容器”：一次批量插入的所有兄弟节点都在它下面，
      // 这样既不会漏掉兄弟，也不会因为新增节点过多而退化成全文档扫描。
      const target = mutation.target;
      if (
        target &&
        target.nodeType === 1 &&
        target !== document.body &&
        document.body &&
        document.body.contains(target) &&
        !isOwnNode(target)
      ) {
        scheduleScan(target);
        continue;
      }
      for (let i = 0; i < mutation.addedNodes.length; i += 1) {
        const node = mutation.addedNodes[i];
        // 父容器不可用时，逐个登记新增元素（不能只取第一个，
        // 否则一次插入的多个兄弟会互相不包含而全部漏掉）。
        if (node && node.nodeType === 1 && !isOwnNode(node)) {
          scheduleScan(node);
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
    // 卡片时长/标题是框架后续补写的文本节点，不开这个开关就收不到它们的变更。
    characterData: true
  });
}

// 自身注入的节点（隐藏按钮、toast）不触发扫描，否则每次注入按钮都会引发一次全量扫描。
function isOwnNode(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  return (
    node.id === 'bsrb-toast' ||
    node.id === 'bili-short-video-blocker-style' ||
    (node.classList && node.classList.contains('bsrb-video-block-btn'))
  );
}

// 只扫描新增子树，而不是每次都全量扫 document.body。
// B 站播放页 DOM 变动极为频繁，原实现会在一帧内反复执行 3 次全文档 querySelectorAll。
function scheduleScan(root) {
  if (!root || root.nodeType !== 1) {
    return;
  }
  lastMutationAt = performance.now();
  pendingScanRoots.add(root);
  // 变动静默后再补一次全量扫描，兼顾异步填充内容的容器。
  scheduleIdleFullScan();
  if (scanScheduled) {
    return;
  }
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    flushScanRoots();
  });
}

function flushScanRoots() {
  const now = performance.now();
  if (now - lastScanAt < SCAN_MIN_INTERVAL_MS) {
    scheduleScanRetry(SCAN_MIN_INTERVAL_MS - (now - lastScanAt));
    return;
  }
  const roots = Array.from(pendingScanRoots);
  pendingScanRoots.clear();
  if (!roots.length) {
    return;
  }
  lastScanAt = now;
  // 变动过密时退化为一次全量扫描，避免按节点重复扫。
  if (roots.length > SCAN_FULL_FALLBACK_THRESHOLD || roots.includes(document.body)) {
    scanForCards(document.body);
    return;
  }
  const detached = roots.some((root) => !root.isConnected);
  if (detached) {
    scanForCards(document.body);
    return;
  }
  roots.forEach((root) => scanForCards(root));
}

function scheduleScanRetry(delay) {
  if (scanRetryTimer) {
    return;
  }
  scanRetryTimer = setTimeout(() => {
    scanRetryTimer = null;
    flushScanRoots();
  }, Math.max(0, delay));
}

function scheduleIdleFullScan() {
  if (idleScanTimer) {
    return;
  }
  idleScanTimer = setTimeout(() => {
    idleScanTimer = null;
    // 只有真正安静下来才做全量补扫。正在播放的视频页 DOM 永不静止，
    // 若不加判断这里会退化成每秒数次全量扫描。
    if (performance.now() - lastMutationAt < SCAN_IDLE_FULL_MS) {
      scheduleIdleFullScan();
      return;
    }
    lastScanAt = performance.now();
    pendingScanRoots.clear();
    if (document.body) {
      scanForCards(document.body);
    }
  }, SCAN_IDLE_FULL_MS);
}

function scanForCards(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }
  CARD_CONFIGS.forEach((config, index) => {
    const selector = Array.isArray(config.cardSelector)
      ? config.cardSelector.join(',')
      : config.cardSelector;
    if (!selector) {
      return;
    }
    root.querySelectorAll(selector).forEach((card) => {
      registerCard(card, index);
    });
  });
}

function registerCard(card, configIndex) {
  if (!card || !(card instanceof HTMLElement)) {
    return;
  }
  if (isInsidePlayerRegion(card)) {
    return;
  }
  card.dataset.bsrbCard = '1';
  card.dataset.bsrbConfigIndex = String(configIndex);
  const alreadyTracked = trackedCards.has(card);
  if (!alreadyTracked) {
    trackedCards.add(card);
  }
  const hasStoredDuration = card.dataset.bsrbDurationSeconds != null && card.dataset.bsrbDurationSeconds !== '';
  const alreadyEvaluated = card.dataset.bsrbEvaluated === '1';
  if (alreadyTracked && alreadyEvaluated && hasStoredDuration) {
    if (!card.classList.contains(HIDDEN_CLASS)) {
      const config = CARD_CONFIGS[configIndex];
      markCardForBlockButton(card);
    }
    return;
  }
  evaluateCard(card);
}

function evaluateCard(card) {
  if (!document.body.contains(card)) {
    trackedCards.delete(card);
    return;
  }
  const configIndex = Number.parseInt(card.dataset.bsrbConfigIndex || '', 10);
  const config = Number.isFinite(configIndex) ? CARD_CONFIGS[configIndex] : null;
  if (!config) {
    return;
  }
  const ids = extractVideoIds(card);
  const decisionCacheKey = buildDecisionCacheKey(ids);
  const titleText = readCardTitle(card, config);
  const authorText = readCardAuthor(card, config);
  let durationSeconds = readStoredDuration(card);

  if (typeof console !== 'undefined' && console.debug) {
    debugLog(
      '[ShortVideoBlocker][ClipRule]',
      'evaluate:dom',
      `key=${decisionCacheKey || ''}`,
      `title="${titleText || ''}"`,
      `author="${authorText || ''}"`,
      `storedDuration=${durationSeconds == null ? 'null' : durationSeconds}`,
      ids || {}
    );
  }

  if (decisionCacheKey && decisionFinalCache.has(decisionCacheKey)) {
    const entry = decisionFinalCache.get(decisionCacheKey);
    const forceHide = entry && entry.result === 'block';
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][ClipRule]',
        'evaluate:cache-final-hit',
        `key=${decisionCacheKey}`,
        entry
      );
    }
    applyVisibility(card, durationSeconds, config, forceHide);
    return;
  }
  if (decisionCacheKey && blockedVideoCache.has(decisionCacheKey)) {
    const cached = blockedVideoCache.get(decisionCacheKey);
    if (cached && cached.result === true) {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog(
          '[ShortVideoBlocker][ClipRule]',
          'evaluate:cache-blocked-hit',
          `key=${decisionCacheKey}`,
          cached
        );
      }
      applyVisibility(card, durationSeconds, config, true);
      decisionFinalCache.set(decisionCacheKey, { result: 'block', timestamp: cached.timestamp || Date.now() });
      return;
    }
  }

  // 0) 运营推广卡：结构性识别（类名 + 链接 spm 参数），命中直接隐藏。
  // 不写入决策记录：这类卡是“坑位”而非具体视频，关闭开关后必须能立即恢复。
  if (hideOperatorCardsEnabled && isOperatorPromoCard(card)) {
    card.dataset.bsrbEvaluated = '1';
    applyVisibility(card, durationSeconds, config, true);
    return;
  }

  // 0.1) 单个视频黑名单匹配：如果该视频被手动拉黑，直接强制屏蔽
  if (isVideoBlocked(ids)) {
    recordDecision({
      id: decisionCacheKey,
      title: titleText,
      author: authorText || (readCardAuthorUid(card) ? `UID:${readCardAuthorUid(card)}` : ''),
      durationSeconds,
      result: 'block',
      reason: 'single_video_blacklist'
    });
    if (decisionCacheKey) {
      decisionFinalCache.set(decisionCacheKey, { result: 'block', timestamp: Date.now() });
      blockedVideoCache.set(decisionCacheKey, { result: true, timestamp: Date.now() });
    }
    card.dataset.bsrbEvaluated = '1';
    applyVisibility(card, durationSeconds, config, true);
    return;
  }

  // 0.2) 黑名单过滤：只比对 UID，命中立即无条件强制屏蔽
  const authorUid = readCardAuthorUid(card);
  if (isAuthorInBlacklist(authorUid)) {
    recordDecision({
      id: decisionCacheKey,
      title: titleText,
      author: authorText || (authorUid ? `UID:${authorUid}` : ''),
      durationSeconds,
      result: 'block',
      reason: 'author_blacklist'
    });
    if (decisionCacheKey) {
      decisionFinalCache.set(decisionCacheKey, { result: 'block', timestamp: Date.now() });
      blockedVideoCache.set(decisionCacheKey, { result: true, timestamp: Date.now() });
    }
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][Blacklist]',
        'evaluate:author-blacklist-block',
        `key=${decisionCacheKey || ''}`,
        `uid=${authorUid}`
      );
    }
    card.dataset.bsrbEvaluated = '1';
    applyVisibility(card, durationSeconds, config, true);
    return;
  }

  // 1) 关注白名单：先从 DOM/补充字段取作者，命中白名单直接放行并缓存
  if (isAuthorInFollowWhitelist(authorText)) {
    recordDecision({
      id: decisionCacheKey,
      title: titleText,
      author: authorText,
      durationSeconds,
      result: 'allow',
      reason: 'follow_whitelist'
    });
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][ClipRule]',
        'evaluate:follow-whitelist-allow',
        `key=${decisionCacheKey || ''}`,
        `author="${authorText || ''}"`
      );
    }
    logClipRuleDecision({
      ruleIndex: -1,
      durationSeconds,
      ruleDurationSeconds: 0,
      titleText: '',
      tagTexts: [],
      keywords: [],
      authorText,
      keywordMatched: false,
      authorWhitelisted: true,
      action: 'skip:follow_whitelist'
    });
    applyVisibility(card, readStoredDuration(card), config, false);
    return;
  }

  if (durationSeconds == null) {
    const durationText = extractDurationText(card, config);
    durationSeconds = parseDurationToSeconds(durationText);
    if (durationSeconds != null) {
      card.dataset.bsrbDurationSeconds = String(durationSeconds);
      if (typeof console !== 'undefined' && console.debug) {
        debugLog(
          '[ShortVideoBlocker][ClipRule]',
          'evaluate:duration-parsed',
          `key=${decisionCacheKey || ''}`,
          `durationSeconds=${durationSeconds}`,
          `durationText="${durationText || ''}"`
        );
      }
    }
  }

  // 2) 时长判定
  if (
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0 &&
    thresholdSeconds > 0 &&
    durationSeconds < thresholdSeconds
  ) {
    if (decisionCacheKey) {
      recordDecision({
        id: decisionCacheKey,
        title: titleText,
        author: authorText,
      durationSeconds,
      result: 'block',
      reason: 'duration'
      });
    }
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][ClipRule]',
        'evaluate:duration-block',
        `key=${decisionCacheKey || ''}`,
        `durationSeconds=${durationSeconds}`,
        `thresholdSeconds=${thresholdSeconds}`
      );
    }
    applyVisibility(card, durationSeconds, config, true);
    return;
  }

  const hideByKeywords = shouldHideSliceUpload(card, config, durationSeconds, decisionCacheKey, {
    titleText,
    authorText
  });
  if (hideByKeywords) {
    card.dataset.bsrbSliceFilter = 'keyword-hit';
  } else {
    delete card.dataset.bsrbSliceFilter;
  }
  if (decisionCacheKey && hideByKeywords) {
    blockedVideoCache.set(decisionCacheKey, { result: true, timestamp: Date.now() });
  }
  if (typeof console !== 'undefined' && console.debug) {
    debugLog(
      '[ShortVideoBlocker][ClipRule]',
      'evaluate:keyword-result',
      `key=${decisionCacheKey || ''}`,
      `hideByKeywords=${hideByKeywords}`
    );
  }
  card.dataset.bsrbEvaluated = '1';
  applyVisibility(card, durationSeconds, config, hideByKeywords);
  if (!hideByKeywords) {
    markCardForBlockButton(card);
  }
}

function rescanTrackedCards() {
  // 快照式遍历：evaluateCard 可能向 trackedCards 增删元素。
  Array.from(trackedCards).forEach((card) => {
    if (!card || !document.body.contains(card)) {
      trackedCards.delete(card);
      return;
    }
    evaluateCard(card);
  });
}

function readStoredDuration(card) {
  const value = card.dataset.bsrbDurationSeconds;
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractDurationText(card, config) {
  if (!config || !Array.isArray(config.durationSelectors)) {
    return null;
  }
  for (const selector of config.durationSelectors) {
    const element = selector ? card.querySelector(selector) : card;
    if (!element) {
      continue;
    }
    const text = extractTextFromNode(element);
    const match = text && text.match(DURATION_PATTERN);
    if (match) {
      return match[0];
    }
  }
  const fallbackText = extractTextFromNode(card);
  const fallbackMatch = fallbackText && fallbackText.match(DURATION_PATTERN);
  return fallbackMatch ? fallbackMatch[0] : null;
}

function extractTextFromNode(node) {
  if (!node) {
    return '';
  }
  return (node.textContent || '').trim();
}

function combineSelectors(primary, fallback) {
  const selectors = [];
  [primary, fallback].forEach((source) => {
    if (!source) {
      return;
    }
    if (Array.isArray(source)) {
      source.forEach((value) => {
        if (typeof value === 'string' && value.trim()) {
          selectors.push(value);
        }
      });
    } else if (typeof source === 'string' && source.trim()) {
      selectors.push(source);
    }
  });
  return selectors;
}

function readSingleTextFromSelectors(card, primarySelectors, fallbackSelectors) {
  if (!card || !(card instanceof HTMLElement)) {
    return '';
  }
  const selectors = combineSelectors(primarySelectors, fallbackSelectors);
  for (const selector of selectors) {
    const node = card.querySelector(selector);
    const text = extractTextFromNode(node);
    if (text) {
      return text;
    }
  }
  return '';
}

function readMultipleTextsFromSelectors(card, primarySelectors, fallbackSelectors) {
  if (!card || !(card instanceof HTMLElement)) {
    return [];
  }
  const selectors = combineSelectors(primarySelectors, fallbackSelectors);
  const values = [];
  selectors.forEach((selector) => {
    card.querySelectorAll(selector).forEach((node) => {
      const text = extractTextFromNode(node);
      if (text) {
        values.push(text);
      }
    });
  });
  return Array.from(new Set(values));
}

function readExtraTags(card) {
  if (!card || !card.dataset || !card.dataset.bsrbExtraTags) {
    return [];
  }
  try {
    const parsed = JSON.parse(card.dataset.bsrbExtraTags);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readExtraAuthor(card) {
  if (!card || !card.dataset) {
    return '';
  }
  return card.dataset.bsrbExtraAuthor || '';
}

function readExtraTitle(card) {
  if (!card || !card.dataset) {
    return '';
  }
  return card.dataset.bsrbExtraTitle || '';
}

function normalizeForMatch(text) {
  if (text == null) {
    return '';
  }
  return String(text).trim().toLowerCase();
}

function matchesKeywords(text, keywords) {
  const normalized = normalizeForMatch(text);
  if (!normalized || !Array.isArray(keywords) || !keywords.length) {
    return false;
  }
  return keywords.some((keyword) => normalized.includes(keyword));
}

function matchesOfficialAuthor(text, authors) {
  const normalized = normalizeForMatch(text);
  if (!normalized || !Array.isArray(authors) || !authors.length) {
    return false;
  }
  return authors.some((author) => normalized === author);
}

function logClipRuleDecision(details) {
  if (typeof console === 'undefined' || !console.debug) {
    return;
  }
  const {
    ruleIndex,
    durationSeconds,
    ruleDurationSeconds,
    titleText,
    tagTexts,
    keywords,
    authorText,
    keywordMatched,
    authorWhitelisted,
    action
  } = details;
  debugLog(
    '[ShortVideoBlocker][ClipRule]',
    `rule=${ruleIndex + 1}`,
    `duration=${durationSeconds}s/${ruleDurationSeconds}s`,
    `title="${titleText || ''}"`,
    `tags="${(tagTexts || []).join(' | ')}"`,
    `keywords="${(keywords || []).join(', ')}"`,
    `keywordMatched=${keywordMatched}`,
    `author="${authorText || ''}"`,
    `authorWhitelisted=${authorWhitelisted}`,
    `action=${action}`
  );
}

function shouldHideSliceUpload(card, config, durationSeconds, decisionCacheKey, hints = {}) {
  if (!card || !(card instanceof HTMLElement) || !Number.isFinite(durationSeconds)) {
    return false;
  }
  const rules = Array.isArray(clipSettings?.rules) ? clipSettings.rules : [];
  if (!rules.length) {
    return false;
  }
  const hintedTitle = hints && typeof hints === 'object' ? hints.titleText : '';
  const hintedAuthor = hints && typeof hints === 'object' ? hints.authorText : '';
  let shouldBlockByKeyword = false;
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (
      !rule ||
      !rule.enabled ||
      durationSeconds <= 0 ||
      durationSeconds > rule.maxDurationSeconds
    ) {
      continue;
    }
    let titleText = hintedTitle ||
      readSingleTextFromSelectors(card, config && config.titleSelectors, TITLE_SELECTORS);
    const extraTitle = readExtraTitle(card);
    if (!titleText && extraTitle) {
      titleText = extraTitle;
    }
    const extraTags = readExtraTags(card);
    const tagTexts = extraTags.length ? extraTags.slice() : [];
    const authorText = hintedAuthor ||
      readSingleTextFromSelectors(card, config && config.authorSelectors, AUTHOR_SELECTORS);
    if (tagTexts.length === 0 && card.dataset.bsrbMetadataLoading !== '1') {
      requestAdditionalMetadata(card);
    }
    const hasKeyword =
      matchesKeywords(titleText, rule.keywords) ||
      tagTexts.some((tag) => matchesKeywords(tag, rule.keywords));
    if (!hasKeyword) {
      logClipRuleDecision({
        ruleIndex: index,
        durationSeconds,
        ruleDurationSeconds: rule.maxDurationSeconds,
        titleText,
        tagTexts,
        keywords: rule.keywords,
        authorText,
        keywordMatched: false,
        authorWhitelisted: false,
        action: 'skip:keyword_miss'
      });
      continue;
    }
    const authorWhitelisted = matchesOfficialAuthor(authorText, rule.allowedAuthors);
    if (authorWhitelisted) {
      logClipRuleDecision({
        ruleIndex: index,
        durationSeconds,
        ruleDurationSeconds: rule.maxDurationSeconds,
        titleText,
        tagTexts,
        keywords: rule.keywords,
        authorText,
        keywordMatched: true,
        authorWhitelisted: true,
        action: 'skip:white_list'
      });
      continue;
    }
    logClipRuleDecision({
      ruleIndex: index,
      durationSeconds,
      ruleDurationSeconds: rule.maxDurationSeconds,
      titleText,
      tagTexts,
      keywords: rule.keywords,
      authorText,
      keywordMatched: true,
      authorWhitelisted: false,
      action: 'block'
    });
    if (decisionCacheKey) {
      recordDecision({
        id: decisionCacheKey,
        title: titleText,
        author: authorText,
        durationSeconds,
        result: 'block',
        reason: 'keyword'
      });
    }
    shouldBlockByKeyword = true;
  }
  // 仅在调试时输出无规则信息
  return shouldBlockByKeyword;
}

function createClipSettings(rawSettings) {
  const normalizer =
    typeof normalizeClipSettings === 'function'
      ? normalizeClipSettings
      : fallbackShared.normalizeClipSettings;
  const normalized = normalizer ? normalizer(rawSettings) : { rules: [] };
  const normalizedRules = Array.isArray(normalized.rules) ? normalized.rules : [];
  const rules = normalizedRules
    .map((rule) => ({
      enabled: rule.enabled !== false,
      keywords: normalizeTextListLocal(rule.keywords)
        .map((text) => String(text || '').trim().toLowerCase())
        .filter(Boolean),
      allowedAuthors: normalizeTextListLocal(rule.allowedAuthors)
        .map((text) => String(text || '').trim().toLowerCase())
        .filter(Boolean),
      maxDurationSeconds:
        Number.isFinite(rule.maxDurationSeconds) && rule.maxDurationSeconds > 0
          ? rule.maxDurationSeconds
          : DEFAULT_RULE_DURATION_SECONDS
    }))
    .filter((rule) => rule.keywords.length > 0);
  return { rules };
}

function createFollowSettings(rawSettings) {
  const normalizer =
    typeof normalizeFollowSettings === 'function'
      ? normalizeFollowSettings
      : fallbackShared.normalizeFollowSettings;
  const normalized = normalizer
    ? normalizer(rawSettings)
    : { enabled: false, follows: [], lastFetched: 0 };
  const follows = Array.isArray(normalized.follows)
    ? normalized.follows
        .map((entry) => {
          if (!entry) {
            return null;
          }
          const name = entry.name ? String(entry.name || '').trim() : '';
          const nameLower = name.toLowerCase();
          const uid = entry.uid ? Number.parseInt(entry.uid, 10) : null;
          if (!nameLower) {
            return null;
          }
          return {
            name,
            nameLower,
            uid
          };
        })
        .filter(Boolean)
    : [];
  return {
    enabled: Boolean(normalized.enabled),
    lastFetched: Number.isFinite(Number(normalized.lastFetched))
      ? Number(normalized.lastFetched)
      : 0,
    follows
  };
}

function buildFollowNameSet(settings) {
  const set = new Set();
  if (settings && Array.isArray(settings.follows)) {
    settings.follows.forEach((entry) => {
      if (entry && entry.nameLower) {
        set.add(entry.nameLower);
      }
    });
  }
  return set;
}

function ensureFollowWhitelist(force = false) {
  if (!followSettings.enabled) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog('[ShortVideoBlocker][FollowWhitelist]', 'disabled, skip fetch');
    }
    return Promise.resolve(followSettings);
  }
  if (!force && !shouldFetchFollowWhitelist()) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog('[ShortVideoBlocker][FollowWhitelist]', 'cache valid, skip fetch');
    }
    return Promise.resolve(followSettings);
  }
  if (followFetchPromise) {
    return followFetchPromise;
  }
  if (listFetchCount >= LIST_FETCH_MAX_PER_SESSION) {
    return Promise.resolve(followSettings);
  }
  listFetchCount += 1;
  if (typeof console !== 'undefined' && console.debug) {
    debugLog('[ShortVideoBlocker][FollowWhitelist]', 'start fetching follow list');
  }
  followFetchPromise = fetchFollowWhitelist()
    .then((result) => {
      if (result) {
        followSettings = result;
        followNameSet = buildFollowNameSet(followSettings);
        if (typeof saveFollowSettings === 'function') {
          saveFollowSettings(followSettings).catch(() => {});
        }
        requestRescan();
      }
      return followSettings;
    })
    .finally(() => {
      followFetchPromise = null;
    });
  return followFetchPromise;
}

function shouldFetchFollowWhitelist() {
  if (!followSettings.enabled) {
    return false;
  }
  // 只要成功拉取过一次，就只按 TTL 判断。
  // 原实现“列表为空则重新拉取”，而“空列表”在未关注任何人 / 接口失败时会永久成立，
  // 配合 onChanged 回调形成无休止的拉取-写入循环。
  if (Number(followSettings.lastFetched) > 0) {
    return Date.now() - Number(followSettings.lastFetched) > FOLLOW_REFRESH_INTERVAL_MS;
  }
  return true;
}

function fetchFollowWhitelist() {
  const uid = readCookie('DedeUserID');
  const csrf = readCookie('bili_jct');
  if (!followSettings.enabled) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog('[ShortVideoBlocker][FollowWhitelist]', 'disabled, skip fetching follow list');
    }
    return Promise.resolve(followSettings);
  }
  if (!uid || !csrf) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][FollowWhitelist]',
        'missing cookies (DedeUserID/bili_jct), skip fetching follow list'
      );
    }
    return Promise.resolve(followSettings);
  }
  const pageSize = 50;
  const collected = [];
  let page = 1;

  const fetchNextPage = () =>
    fetchFollowPage({ uid, csrf, page, pageSize }).then((list) => {
      if (Array.isArray(list) && list.length) {
        collected.push(
          ...list.map((item) => ({
            uid: item.mid ? Number.parseInt(item.mid, 10) : null,
            name: item.uname || item.nickname || '',
            nameLower: item.uname ? item.uname.toLowerCase() : ''
          }))
        );
        if (list.length === pageSize) {
          page += 1;
          return fetchNextPage();
        }
      }
      return null;
    });

  return fetchNextPage().then(() => {
    const cleaned = collected.filter((entry) => entry && entry.nameLower);
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][FollowWhitelist]',
        'fetch complete',
        `count=${cleaned.length}`
      );
    }
    return {
      enabled: true,
      lastFetched: Date.now(),
      follows: cleaned
    };
  });
}

function fetchFollowPage({ uid, csrf, page, pageSize }) {
  const params = new URLSearchParams({
    vmid: String(uid),
    ps: String(pageSize),
    pn: String(page),
    order: 'desc',
    order_type: 'attention',
    jsonp: 'jsonp',
    csrf
  });
  return fetch(`https://api.bilibili.com/x/relation/followings?${params.toString()}`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((json) => {
      if (!json || json.code !== 0 || !json.data || !Array.isArray(json.data.list)) {
        if (typeof console !== 'undefined' && console.debug) {
          debugLog(
            '[ShortVideoBlocker][FollowWhitelist]',
            'fetch follow page failed',
            json && json.message
          );
        }
        return [];
      }
      return json.data.list;
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog(
          '[ShortVideoBlocker][FollowWhitelist]',
          'fetch follow page error',
          error && error.message
        );
      }
      return [];
    });
}

function readCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) {
    return '';
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function isAuthorInFollowWhitelist(authorText) {
  if (!followSettings.enabled || !authorText) {
    return false;
  }
  const normalized = String(authorText || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return followNameSet.has(normalized);
}

function createBlacklistSettings(raw) {
  if (typeof normalizeBlacklistSettings === 'function') {
    return normalizeBlacklistSettings(raw);
  }
  return { enabled: true, lastFetched: 0, biliBlacks: [], customBlacks: [] };
}

function buildBlacklistUidSet(settings) {
  const set = new Set();
  if (!settings || !settings.enabled) {
    return set;
  }
  if (Array.isArray(settings.biliBlacks)) {
    settings.biliBlacks.forEach((entry) => {
      const uid = entry && (entry.uid != null ? entry.uid : entry.mid);
      const num = Number.parseInt(uid, 10);
      if (Number.isFinite(num)) {
        set.add(num);
      }
    });
  }
  if (Array.isArray(settings.customBlacks)) {
    settings.customBlacks.forEach((item) => {
      const num = Number.parseInt(item, 10);
      if (Number.isFinite(num)) {
        set.add(num);
      }
    });
  }
  return set;
}

function isAuthorInBlacklist(authorUid) {
  if (!blacklistSettings.enabled || authorUid == null) {
    return false;
  }
  return blacklistUidSet.has(Number(authorUid));
}

function ensureBlacklist(force = false) {
  if (!blacklistSettings.enabled) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog('[ShortVideoBlocker][Blacklist]', 'disabled, skip fetch');
    }
    return Promise.resolve(blacklistSettings);
  }
  if (!force && !shouldFetchBlacklist()) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog('[ShortVideoBlocker][Blacklist]', 'cache valid, skip fetch');
    }
    return Promise.resolve(blacklistSettings);
  }
  if (blacklistFetchPromise) {
    return blacklistFetchPromise;
  }
  if (listFetchCount >= LIST_FETCH_MAX_PER_SESSION) {
    return Promise.resolve(blacklistSettings);
  }
  listFetchCount += 1;
  if (typeof console !== 'undefined' && console.debug) {
    debugLog('[ShortVideoBlocker][Blacklist]', 'start fetching blacklist');
  }
  blacklistFetchPromise = fetchBlacklist()
    .then((result) => {
      if (result) {
        blacklistSettings = result;
        blacklistUidSet = buildBlacklistUidSet(blacklistSettings);
        if (typeof saveBlacklistSettings === 'function') {
          saveBlacklistSettings(blacklistSettings).catch(() => {});
        }
        requestRescan();
      }
      return blacklistSettings;
    })
    .finally(() => {
      blacklistFetchPromise = null;
    });
  return blacklistFetchPromise;
}

function shouldFetchBlacklist() {
  if (!blacklistSettings.enabled) {
    return false;
  }
  // 同 shouldFetchFollowWhitelist：空黑名单是合法状态，不能当成“需要重新拉取”。
  if (Number(blacklistSettings.lastFetched) > 0) {
    return Date.now() - Number(blacklistSettings.lastFetched) > BLACKLIST_REFRESH_INTERVAL_MS;
  }
  return true;
}

function fetchBlacklist() {
  const csrf = readCookie('bili_jct');
  if (!blacklistSettings.enabled) {
    return Promise.resolve(blacklistSettings);
  }
  if (!csrf) {
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][Blacklist]',
        'missing csrf cookie (bili_jct), skip fetching blacklist'
      );
    }
    return Promise.resolve(blacklistSettings);
  }
  const pageSize = 50;
  const collected = [];
  let page = 1;

  const fetchNextPage = () =>
    fetchBlacklistPage({ csrf, page, pageSize }).then(({ list, total }) => {
      if (Array.isArray(list) && list.length) {
        collected.push(
          ...list.map((item) => {
            // 字段必须是 uid：normalizeBlacklistSettings 与 buildBlacklistUidSet 都按 uid 读取。
            // 原实现只存 mid 却按 entry.uid 过滤，导致结果恒为空，进而触发无限重新拉取。
            const parsed = item.mid != null ? Number.parseInt(item.mid, 10) : NaN;
            return {
              uid: Number.isFinite(parsed) ? parsed : null,
              name: String(item.uname || item.nickname || '').trim()
            };
          })
        );
        if (list.length === pageSize && collected.length < total) {
          page += 1;
          return fetchNextPage();
        }
      }
      return null;
    });

  return fetchNextPage().then(() => {
    const cleaned = collected.filter((entry) => entry && Number.isFinite(entry.uid));
    if (typeof console !== 'undefined' && console.debug) {
      debugLog(
        '[ShortVideoBlocker][Blacklist]',
        'fetch complete',
        `count=${cleaned.length}`
      );
    }
    return {
      enabled: blacklistSettings.enabled,
      lastFetched: Date.now(),
      biliBlacks: cleaned,
      customBlacks: blacklistSettings.customBlacks || []
    };
  });
}

function fetchBlacklistPage({ csrf, page, pageSize }) {
  const params = new URLSearchParams({
    re_version: '0',
    ps: String(pageSize),
    pn: String(page),
    jsonp: 'jsonp',
    csrf
  });
  return fetch(`https://api.bilibili.com/x/relation/blacks?${params.toString()}`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((json) => {
      if (!json || json.code !== 0 || !json.data || !Array.isArray(json.data.list)) {
        if (typeof console !== 'undefined' && console.debug) {
          debugLog(
            '[ShortVideoBlocker][Blacklist]',
            'fetch blacklist page failed',
            json && json.message
          );
        }
        return { list: [], total: 0 };
      }
      return { list: json.data.list, total: json.data.total || 0 };
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog(
          '[ShortVideoBlocker][Blacklist]',
          'fetch blacklist page error',
          error && error.message
        );
      }
      return { list: [], total: 0 };
    });
}

function requestAdditionalMetadata(card) {
  if (!card || !(card instanceof HTMLElement)) {
    return;
  }
  if (
    card.dataset.bsrbMetadataLoading === '1' ||
    card.dataset.bsrbMetadataAttempted === '1'
  ) {
    return;
  }
  const ids = extractVideoIds(card);
  if (!ids) {
    return;
  }
  const cacheKey = ids.bvid ? `bvid:${ids.bvid}` : ids.aid ? `aid:${ids.aid}` : null;
  if (!cacheKey) {
    return;
  }
  if (videoMetadataCache.has(cacheKey)) {
    applyMetadataToCard(card, videoMetadataCache.get(cacheKey));
    return;
  }
  if (typeof console !== 'undefined' && console.debug) {
    debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:start', cacheKey, ids);
  }
  card.dataset.bsrbMetadataLoading = '1';
  enqueueMetadataFetch(cacheKey, ids)
    .then((metadata) => {
      if (metadata) {
        videoMetadataCache.set(cacheKey, metadata);
        if (typeof console !== 'undefined' && console.debug) {
          debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:success', cacheKey, metadata);
        }
        applyMetadataToCard(card, metadata);
      } else if (typeof console !== 'undefined' && console.debug) {
        debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:empty', cacheKey);
      }
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:error', cacheKey, error && error.message);
      }
    })
    .finally(() => {
      if (card.dataset) {
        delete card.dataset.bsrbMetadataLoading;
        card.dataset.bsrbMetadataAttempted = '1';
      }
    });
}

function extractVideoIds(card) {
  if (!card || !(card instanceof HTMLElement)) {
    return null;
  }
  // 同一张卡片会被多次判定（缓存命中、按钮注入、元数据回填），缓存解析结果。
  if (videoIdsCache.has(card)) {
    return videoIdsCache.get(card);
  }
  const ids = extractVideoIdsUncached(card);
  // 只缓存成功结果。B 站卡片（Vue 渲染）常常先出骨架、异步填入链接，
  // 首次扫描拿不到 id；若把 null 也缓存住，这张卡片将永远取不到 id，
  // 表现为悬浮屏蔽按钮、关键词规则、视频拉黑全部失效。
  if (ids && (ids.bvid || Number.isFinite(ids.aid))) {
    videoIdsCache.set(card, ids);
  }
  return ids;
}

function extractVideoIdsUncached(card) {
  if (!card || !(card instanceof HTMLElement)) {
    return null;
  }
  const dataset = card.dataset || {};
  const datasetBvid =
    dataset.bvid || dataset.bvId || dataset.biliBvid || dataset.videoId || dataset.bsrbBvid;
  if (datasetBvid && /^BV[0-9A-Za-z]{10}$/i.test(datasetBvid)) {
    return { bvid: datasetBvid };
  }
  const datasetAid = dataset.aid || dataset.avId;
  if (datasetAid && Number.isFinite(Number.parseInt(datasetAid, 10))) {
    return { aid: Number.parseInt(datasetAid, 10) };
  }
  if (card.tagName === 'A' || (card.matches && card.matches('a[href]'))) {
    const href = card.getAttribute('href') || '';
    const bvMatch = href.match(/BV[0-9A-Za-z]{10}/i);
    if (bvMatch) {
      return { bvid: bvMatch[0] };
    }
    const avMatch = href.match(/av(\d+)/i);
    if (avMatch) {
      return { aid: Number.parseInt(avMatch[1], 10) };
    }
  }
  const anchor = card.querySelector('a[href*="/video/"], a[href*="BV"], a[href*="bilibili.com/video"]');
  if (anchor) {
    const href = anchor.getAttribute('href') || '';
    const bvMatch = href.match(/BV[0-9A-Za-z]{10}/i);
    if (bvMatch) {
      return { bvid: bvMatch[0] };
    }
    const avMatch = href.match(/av(\d+)/i);
    if (avMatch) {
      return { aid: Number.parseInt(avMatch[1], 10) };
    }
  }
  const allAnchors = card.querySelectorAll('a[href]');
  for (const a of allAnchors) {
    const href = a.getAttribute('href') || '';
    const bvMatch = href.match(/BV[0-9A-Za-z]{10}/i);
    if (bvMatch) {
      return { bvid: bvMatch[0] };
    }
    const avMatch = href.match(/av(\d+)/i);
    if (avMatch) {
      return { aid: Number.parseInt(avMatch[1], 10) };
    }
  }
  return null;
}

function buildDecisionCacheKey(ids) {
  if (!ids) {
    return null;
  }
  if (ids.bvid) {
    return `bvid:${ids.bvid}`;
  }
  if (Number.isFinite(ids.aid)) {
    return `aid:${ids.aid}`;
  }
  return null;
}

// 元数据拉取限流：视频页侧边栏一次可能提交几十个请求，
// 不限并发会导致解析回调批量挤占主线程，并连带多次 evaluateCard 重排。
const METADATA_CONCURRENCY = 3;
const METADATA_MAX_REQUESTS = 40;
const metadataQueue = [];
const metadataInFlight = new Map();
let metadataActive = 0;
let metadataRequested = 0;

function enqueueMetadataFetch(cacheKey, ids) {
  const existing = metadataInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }
  if (metadataRequested >= METADATA_MAX_REQUESTS) {
    return Promise.resolve(null);
  }
  metadataRequested += 1;
  const task = new Promise((resolve) => {
    metadataQueue.push(() => {
      metadataActive += 1;
      fetchVideoMetadata(ids)
        .then(resolve)
        .catch(() => resolve(null))
        .finally(() => {
          metadataActive -= 1;
          metadataInFlight.delete(cacheKey);
          drainMetadataQueue();
        });
    });
  });
  metadataInFlight.set(cacheKey, task);
  drainMetadataQueue();
  return task;
}

function drainMetadataQueue() {
  while (metadataActive < METADATA_CONCURRENCY && metadataQueue.length > 0) {
    const next = metadataQueue.shift();
    if (typeof next === 'function') {
      next();
    }
  }
}

function fetchVideoMetadata(ids) {
  if (!ids) {
    return Promise.resolve(null);
  }
  const baseViewUrl = ids.bvid
    ? `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(ids.bvid)}`
    : ids.aid
      ? `https://api.bilibili.com/x/web-interface/view?aid=${ids.aid}`
      : null;
  if (!baseViewUrl) {
    return Promise.resolve(null);
  }
  return fetch(baseViewUrl, { credentials: 'include' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('metadata request failed');
      }
      return response.json();
    })
    .then((json) => {
      if (!json || json.code !== 0 || !json.data) {
        return null;
      }
      const data = json.data;
      const author = data.owner && data.owner.name ? data.owner.name : '';
      const authorUid = data.owner && data.owner.mid ? data.owner.mid : null;
      const title = data.title || '';
      const bvid = data.bvid || data.videoData?.bvid || ids.bvid;
      if (!bvid) {
        return {
          tags: [],
          author,
          authorUid,
          title
        };
      }
      return fetchVideoTags(bvid).then((tags) => ({
        tags,
        author,
        authorUid,
        title
      }));
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-view:error', error && error.message);
      }
      return null;
    });
}

function fetchVideoTags(bvid) {
  if (!bvid) {
    return Promise.resolve([]);
  }
  const url = `https://api.bilibili.com/x/tag/archive/tags?bvid=${encodeURIComponent(bvid)}`;
  return fetch(url, { credentials: 'include' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('tags request failed');
      }
      return response.json();
    })
    .then((json) => {
      if (!json || json.code !== 0 || !Array.isArray(json.data)) {
        return [];
      }
      const tags = json.data
        .map((tag) => tag.tag_name || tag.name || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (typeof console !== 'undefined' && console.debug) {
        debugLog(
          '[ShortVideoBlocker][ClipRule]',
          'fetch-tags:success',
          `bvid=${bvid}`,
          tags
        );
      }
      return tags;
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        debugLog('[ShortVideoBlocker][ClipRule]', 'fetch-tags:error', error && error.message);
      }
      return [];
    });
}

function applyMetadataToCard(card, metadata) {
  if (!card || !metadata || !card.dataset) {
    return;
  }
  if (typeof console !== 'undefined' && console.debug) {
    debugLog('[ShortVideoBlocker][ClipRule]', 'apply-metadata', metadata);
  }
  const hadTags = Boolean(card.dataset.bsrbExtraTags);
  const hadAuthor = Boolean(card.dataset.bsrbExtraAuthor);
  const hadUid = Boolean(card.dataset.bsrbAuthorUid);
  if (metadata.tags && metadata.tags.length) {
    card.dataset.bsrbExtraTags = JSON.stringify(metadata.tags);
  }
  if (metadata.author) {
    card.dataset.bsrbExtraAuthor = metadata.author;
  }
  if (metadata.authorUid) {
    card.dataset.bsrbAuthorUid = String(metadata.authorUid);
  }
  if (metadata.title) {
    card.dataset.bsrbExtraTitle = metadata.title;
  }
  if (
    (!hadTags && metadata.tags && metadata.tags.length) ||
    (!hadAuthor && metadata.author) ||
    (!hadUid && metadata.authorUid)
  ) {
    evaluateCard(card);
  }
}

function parseDurationToSeconds(text) {
  if (!text) {
    return null;
  }
  const clean = text.trim();
  if (!DURATION_PATTERN.test(clean)) {
    return null;
  }
  const parts = clean.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  return seconds;
}

function applyVisibility(card, durationSeconds, config, forceHide = false) {
  const hideByThreshold =
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0 &&
    thresholdSeconds > 0 &&
    durationSeconds < thresholdSeconds;
  const shouldHide = Boolean(forceHide) || hideByThreshold;
  const targets = collectVisibilityTargets(card, config);
  targets.forEach((node) => {
    if (!node || !(node instanceof HTMLElement)) {
      return;
    }
    // 状态未变化时不写 DOM：多余的 classList 写入会连带一次样式重算。
    if (node.classList.contains(HIDDEN_CLASS) === shouldHide) {
      return;
    }
    if (shouldHide) {
      node.classList.add(HIDDEN_CLASS);
    } else {
      node.classList.remove(HIDDEN_CLASS);
    }
  });
  if (!shouldHide) {
    markCardForBlockButton(card);
  }
}

function collectVisibilityTargets(card, config) {
  const nodes = new Set();
  if (card && card instanceof HTMLElement) {
    nodes.add(card);
  }
  if (config && Array.isArray(config.wrapperSelectors)) {
    config.wrapperSelectors.forEach((selector) => {
      if (!selector || typeof selector !== 'string') {
        return;
      }
      const wrapper = card.closest(selector);
      if (wrapper && wrapper instanceof HTMLElement) {
        nodes.add(wrapper);
      }
    });
  }
  return Array.from(nodes);
}

function buildBlockedVideoIdsSet(list) {
  const set = new Set();
  if (Array.isArray(list)) {
    list.forEach((item) => {
      if (!item) return;
      if (item.id) set.add(String(item.id).toLowerCase());
      if (item.bvid) {
        set.add(String(item.bvid).toLowerCase());
        set.add(`bvid:${String(item.bvid).toLowerCase()}`);
      }
      if (item.aid != null) {
        set.add(String(item.aid));
        set.add(`aid:${item.aid}`);
      }
    });
  }
  return set;
}

// 运营推广位判定：B 站在首页/视频页推荐流里插入的付费运营位，特征是链接
// 带 spm_id_from=...playrecommendByOp / homepageOpAd 之类的追踪参数。
// 用“类名 or 链接参数”双信号判定，避免 B 站改其中一处就全部失效。
function isOperatorPromoCard(card) {
  if (!card || !(card instanceof HTMLElement)) {
    return false;
  }
  if (card.dataset.bsrbOperatorPromo === '1') {
    return true;
  }
  if (card.dataset.bsrbOperatorPromo === '0') {
    return false;
  }
  let verdict = false;
  if (card.matches('.video-page-operator-card-small, .video-page-operator-card')) {
    verdict = true;
  }
  if (!verdict) {
    const anchors = card.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href') || '';
      if (/playrecommendByOp|homepageOpAd|searchOpAd/i.test(href)) {
        verdict = true;
        break;
      }
    }
  }
  card.dataset.bsrbOperatorPromo = verdict ? '1' : '0';
  return verdict;
}

function isVideoBlocked(ids) {
  if (!ids) return false;
  if (ids.bvid) {
    const lower = ids.bvid.toLowerCase();
    if (blockedVideoIdsSet.has(lower) || blockedVideoIdsSet.has(`bvid:${lower}`)) {
      return true;
    }
  }
  if (ids.aid != null) {
    const aidStr = String(ids.aid);
    if (blockedVideoIdsSet.has(aidStr) || blockedVideoIdsSet.has(`aid:${aidStr}`)) {
      return true;
    }
  }
  return false;
}

function blockSingleVideo(entry) {
  if (!entry || !entry.id) return;
  blockedVideosList = [entry, ...blockedVideosList.filter((item) => item && item.id !== entry.id)];
  blockedVideoIdsSet = buildBlockedVideoIdsSet(blockedVideosList);
  const cacheKey = entry.bvid ? `bvid:${entry.bvid}` : (entry.aid ? `aid:${entry.aid}` : entry.id);
  decisionFinalCache.set(cacheKey, { result: 'block', timestamp: Date.now() });
  blockedVideoCache.set(cacheKey, { result: true, timestamp: Date.now() });
  recordDecision({
    id: cacheKey,
    title: entry.title,
    author: entry.author,
    durationSeconds: null,
    result: 'block',
    reason: 'single_video_blacklist'
  });
  if (typeof saveBlockedVideos === 'function') {
    saveBlockedVideos(blockedVideosList, decisionStorageArea || storageArea).catch(() => {});
  }
}

// 播放器所在区域一律不动：在播放器初始化阶段对这块 DOM 做任何 display 变更，
// 都可能让 B 站播放器判定容器尺寸变化而重建 <video>，表现为“播放 0.1s 后从头开始”。
const PLAYER_REGION_SELECTOR = [
  '#bilibili-player',
  '#bilibiliPlayer',
  '.bpx-player-container',
  '.bpx-player-video-area',
  '.bpx-player-ctrl',
  '.bpx-player-mini',
  '#player_holder',
  '.player-wrap'
].join(',');

function isInsidePlayerRegion(node) {
  if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') {
    return false;
  }
  return node.closest(PLAYER_REGION_SELECTOR) != null;
}

// 卡片上只打一个 data-bsrb-btn 标记，绝不往 B 站托管的节点里插入子节点。
// 右侧推荐栏由 Vue 渲染（每张卡片都带 data-v-* 作用域属性），
// 之前每张卡片 appendChild 一个按钮并挂 2 个监听器，会与框架自身的 patch 相互触发。
function markCardForBlockButton(card) {
  if (!card || !(card instanceof HTMLElement) || card.dataset.bsrbBtn === '1') {
    return;
  }
  const ids = extractVideoIds(card);
  if (!ids || (!ids.bvid && ids.aid == null)) {
    return;
  }
  card.dataset.bsrbBtn = '1';
  ensureBlockButtonOverlay();
}

let overlayButton = null;
let overlayCard = null;
let overlayListenersBound = false;

function ensureBlockButtonOverlay() {
  if (overlayListenersBound || !document.body) {
    return;
  }
  overlayListenersBound = true;
  overlayButton = document.createElement('div');
  overlayButton.className = 'bsrb-video-block-btn';
  overlayButton.title = '拉黑此视频（不再推荐）';
  overlayButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  document.body.appendChild(overlayButton);

  overlayButton.addEventListener('click', handleOverlayBlock, true);
  overlayButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);
  overlayButton.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  // 三个全局委托监听器取代“每张卡片两个监听器”。
  document.addEventListener('mousemove', onOverlayPointerMove, true);
  document.addEventListener('mouseout', onOverlayPointerOut, true);
  window.addEventListener('scroll', hideOverlayButton, true);
  window.addEventListener('resize', hideOverlayButton, true);
}

function onOverlayPointerMove(e) {
  if (!overlayButton) {
    return;
  }
  if (overlayButton.contains(e.target)) {
    return; // 指针在自己的浮层上，保持当前状态
  }
  const card = e.target && e.target.closest ? e.target.closest('[data-bsrb-btn]') : null;
  if (!card) {
    hideOverlayButton();
    return;
  }
  if (card === overlayCard) {
    return; // 同一张卡片不重复读布局
  }
  const rect = card.getBoundingClientRect();
  overlayCard = card;
  overlayButton.style.left = `${Math.round(rect.right - 32)}px`;
  overlayButton.style.top = `${Math.round(rect.top + 8)}px`;
  overlayButton.classList.add('is-active');
}

function onOverlayPointerOut(e) {
  if (!overlayCard) {
    return;
  }
  const next = e.relatedTarget;
  if (next && (overlayCard.contains(next) || (overlayButton && overlayButton.contains(next)))) {
    return;
  }
  hideOverlayButton();
}

function hideOverlayButton() {
  overlayCard = null;
  if (overlayButton) {
    overlayButton.classList.remove('is-active');
  }
}

function handleOverlayBlock(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const card = overlayCard;
  if (!card) {
    return;
  }
  const configIndex = Number.parseInt(card.dataset.bsrbConfigIndex || '', 10);
  const config = Number.isFinite(configIndex) ? CARD_CONFIGS[configIndex] : null;
  const ids = extractVideoIds(card);
  if (!ids || (!ids.bvid && ids.aid == null)) {
    hideOverlayButton();
    return;
  }
  const currentTitle = readCardTitle(card, config) || '';
  const currentAuthor = readCardAuthor(card, config) || '';
  const currentUid = readCardAuthorUid(card);
  blockSingleVideo({
    id: ids.bvid || (ids.aid ? `aid:${ids.aid}` : ''),
    bvid: ids.bvid || '',
    aid: ids.aid != null ? ids.aid : null,
    title: currentTitle,
    author: currentAuthor,
    authorUid: currentUid,
    timestamp: Date.now()
  });
  card.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  card.style.opacity = '0';
  card.style.transform = 'scale(0.92)';
  setTimeout(() => {
    card.classList.add(HIDDEN_CLASS);
  }, 220);
  hideOverlayButton();
  showBlockToast(`已拉黑该视频${currentTitle ? `：${currentTitle.slice(0, 18)}...` : ''}`);
}

function showBlockToast(message) {
  let toast = document.getElementById('bsrb-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'bsrb-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'bsrb-toast-show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, 2400);
}

/* ---------------------------------------------------------------------------
 * 重启自诊断（只做事件监听 + localStorage，不修改任何页面 DOM）：
 * 统计“同一个 <video> 已经播起来之后又被清空/重新加载”的次数。
 *   读数：JSON.parse(localStorage.getItem('bsrbDiag') || '{}')
 *   字段：restarts / restartsTimeline / plays / newSrc / docId
 *   docId 变化 = 整页被刷新；restarts 增长 = 播放器被重建（换视频不算）。
 * ------------------------------------------------------------------------- */
(function installRestartDiagnostics() {
  if (window.__bsrbDiagInstalled) return;
  window.__bsrbDiagInstalled = true;
  var KEY = 'bsrbDiag';
  var t0 = Date.now();
  var state = {
    docId: Math.random().toString(36).slice(2, 8),
    startedAt: t0,
    restarts: 0,
    plays: 0,
    newSrc: 0,
    errors: [],
    restartsTimeline: [],
    events: []
  };
  var seen = new WeakSet();

  function log(type, extra) {
    state.events.push({ ms: Date.now() - t0, type: type, extra: extra == null ? '' : String(extra) });
    if (state.events.length > 120) state.events.shift();
  }

  function attach(v) {
    if (seen.has(v)) return;
    seen.add(v);
    var playedOnce = false;
    var lastSrc = '';
    var tag = 'v' + (seenCount += 1);
    function currentTagSrc() {
      return (v.currentSrc || v.src || '').split('/').pop().slice(0, 16);
    }
    ['play', 'playing'].forEach(function (name) {
      v.addEventListener(name, function () {
        if (!playedOnce) {
          playedOnce = true;
          state.plays += 1;
        }
        log(tag + ':' + name);
      }, true);
    });
    ['loadstart', 'emptied', 'stalled', 'abort', 'error', 'pause', 'seeking', 'seeked', 'ratechange', 'waiting', 'ended'].forEach(function (name) {
      v.addEventListener(name, function () {
        var src = currentTagSrc();
        // src 变了 = 换了一个视频，不算重启，先重置“已播放”标记。
        if (src && src !== lastSrc) {
          lastSrc = src;
          playedOnce = false;
          state.newSrc += 1;
          log('NEWSRC:' + tag, src);
          return;
        }
        if ((name === 'loadstart' || name === 'emptied') && playedOnce) {
          state.restarts += 1;
          var entry = { ms: Date.now() - t0, why: name, tag: tag, currentTime: Number(v.currentTime.toFixed(2)) };
          state.restartsTimeline.push(entry);
          if (state.restartsTimeline.length > 40) state.restartsTimeline.shift();
          log('RESTART:' + tag + ':' + name, entry.currentTime);
        }
        if (name === 'error') state.errors.push(String(v.error && v.error.code) + '@' + (Date.now() - t0));
        log(tag + ':' + name);
      }, true);
    });
    log('attach:' + tag);
  }

  var seenCount = 0;
  var poll = setInterval(function () {
    try {
      var list = document.querySelectorAll('video');
      for (var i = 0; i < list.length; i++) attach(list[i]);
    } catch (err) {
      /* 忽略：诊断绝不能影响页面 */
    }
  }, 300);

  function flush() {
    try {
      state.ms = Date.now() - t0;
      state.path = location.pathname;
      state.videoEls = document.querySelectorAll('video').length;
      state.hiddenCards = document.querySelectorAll('.bili-short-video-blocker__hidden').length;
      state.bsrbStatus = document.documentElement.dataset.bsrbStatus || '';
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      /* 忽略 */
    }
  }
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  setInterval(flush, 4000);
  setTimeout(function () { clearInterval(poll); }, 2 * 60 * 60 * 1000);
})();
