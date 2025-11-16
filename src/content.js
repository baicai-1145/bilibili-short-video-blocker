const DEFAULT_RULE_DURATION_SECONDS = 20 * 60;
const fallbackShared = {
  DEFAULT_THRESHOLD_SECONDS: 60,
  DEFAULT_CLIP_SETTINGS: { rules: [] },
  STORAGE_KEY: 'thresholdSeconds',
  CLIP_SETTINGS_KEY: 'clipFilterSettings',
  resolveStorageArea() {
    return { area: null, name: 'sync' };
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
  readThreshold() {
    return Promise.resolve(60);
  },
  readClipSettings() {
    return Promise.resolve({ rules: [] });
  }
};

const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || fallbackShared;

const {
  DEFAULT_THRESHOLD_SECONDS,
  DEFAULT_CLIP_SETTINGS,
  STORAGE_KEY,
  CLIP_SETTINGS_KEY,
  resolveStorageArea,
  normalizeThreshold,
  readThreshold,
  normalizeClipSettings,
  readClipSettings
} = shared;
const HIDDEN_CLASS = 'bili-short-video-blocker__hidden';
const DURATION_PATTERN = /(\d{1,2}:)?\d{1,2}:\d{2}/;

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
  '.up-name',
  '.author',
  '.name'
];

const TAG_SELECTORS = [
  '.bili-video-card__info--tag',
  '.bili-video-card__info--topic',
  '.video-card__info .tag',
  '.video-card__tags .tag',
  '.video-card__topics a',
  '.bili-inline-tags span'
];

const CARD_CONFIGS = [
  {
    name: 'grid-card',
    cardSelector: ['.bili-video-card'],
    durationSelectors: [
      '.bili-video-card__stats__duration',
      '.bili-video-card__mask span.duration',
      '.bili-video-card__info--right span'
    ],
    wrapperSelectors: ['.feed-card', '.bili-feed-card'],
    titleSelectors: TITLE_SELECTORS,
    authorSelectors: AUTHOR_SELECTORS,
    tagSelectors: TAG_SELECTORS
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
    authorSelectors: AUTHOR_SELECTORS,
    tagSelectors: TAG_SELECTORS
  },
  {
    name: 'list-card',
    cardSelector: [
      'li.video-list-item',
      'li.video-item',
      '.video-card-common',
      '.video-page-operator-card'
    ],
    durationSelectors: ['.time', '.duration', '.video-duration', '.card-duration'],
    titleSelectors: TITLE_SELECTORS,
    authorSelectors: AUTHOR_SELECTORS,
    tagSelectors: TAG_SELECTORS
  }
];

const trackedCards = new Set();
const videoMetadataCache = new Map();
let clipSettings = createClipSettings(DEFAULT_CLIP_SETTINGS);
let thresholdSeconds = DEFAULT_THRESHOLD_SECONDS;
let storageArea = null;
let storageAreaName = 'sync';
let scanScheduled = false;

if (!shouldBypassPage()) {
  init();
}

function init() {
  ensureStyleInjected();
  const resolvedStorage = resolveStorageArea();
  storageArea = resolvedStorage.area;
  storageAreaName = resolvedStorage.name;
  Promise.all([
    readThreshold(storageArea).catch(() => DEFAULT_THRESHOLD_SECONDS),
    readClipSettings(storageArea).catch(() => DEFAULT_CLIP_SETTINGS)
  ])
    .then(([rawThreshold, rawClipSettings]) => {
      thresholdSeconds = normalizeThreshold(rawThreshold);
      clipSettings = createClipSettings(rawClipSettings);
      scanForCards(document.body);
      observeMutations();
    })
    .catch(() => {
      thresholdSeconds = DEFAULT_THRESHOLD_SECONDS;
      clipSettings = createClipSettings(DEFAULT_CLIP_SETTINGS);
      scanForCards(document.body);
      observeMutations();
    });
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
}

function shouldBypassPage() {
  if (typeof window === 'undefined') {
    return true;
  }
  const host = window.location.hostname || '';
  return host.endsWith('space.bilibili.com');
}

function handleStorageChange(changes, areaName) {
  if (areaName !== storageAreaName) {
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
  if (shouldRescan) {
    rescanTrackedCards();
  }
}

function ensureStyleInjected() {
  if (document.getElementById('bili-short-video-blocker-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'bili-short-video-blocker-style';
  style.textContent = `.${HIDDEN_CLASS}{display:none !important;}`;
  document.head.appendChild(style);
}

function observeMutations() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        scheduleScan();
        break;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function scheduleScan() {
  if (scanScheduled) {
    return;
  }
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scanForCards(document.body);
  });
}

function scanForCards(root) {
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
  card.dataset.bsrbConfigIndex = String(configIndex);
  trackedCards.add(card);
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
  let durationSeconds = readStoredDuration(card);
  if (durationSeconds == null) {
    const durationText = extractDurationText(card, config);
    durationSeconds = parseDurationToSeconds(durationText);
    if (durationSeconds != null) {
      card.dataset.bsrbDurationSeconds = String(durationSeconds);
    }
  }
  const hideByKeywords = shouldHideSliceUpload(card, config, durationSeconds);
  if (hideByKeywords) {
    card.dataset.bsrbSliceFilter = 'keyword-hit';
  } else {
    delete card.dataset.bsrbSliceFilter;
  }
  applyVisibility(card, durationSeconds, config, hideByKeywords);
}

function rescanTrackedCards() {
  trackedCards.forEach((card) => {
    if (!document.body.contains(card)) {
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
  return authors.some((author) => normalized.includes(author));
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
  console.debug(
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

function shouldHideSliceUpload(card, config, durationSeconds) {
  if (!card || !(card instanceof HTMLElement) || !Number.isFinite(durationSeconds)) {
    return false;
  }
  const rules = Array.isArray(clipSettings?.rules) ? clipSettings.rules : [];
  if (!rules.length) {
    return false;
  }
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
    let titleText = readSingleTextFromSelectors(
      card,
      config && config.titleSelectors,
      TITLE_SELECTORS
    );
    const tagTexts = readMultipleTextsFromSelectors(
      card,
      config && config.tagSelectors,
      TAG_SELECTORS
    );
    const extraTitle = readExtraTitle(card);
    if (!titleText && extraTitle) {
      titleText = extraTitle;
    }
    const extraTags = readExtraTags(card);
    if (extraTags.length) {
      tagTexts.push(...extraTags);
    }
    if (tagTexts.length === 0 && card.dataset.bsrbMetadataLoading !== '1') {
      requestAdditionalMetadata(card);
    }
    let authorText = readSingleTextFromSelectors(
      card,
      config && config.authorSelectors,
      AUTHOR_SELECTORS
    );
    const extraAuthor = readExtraAuthor(card);
    if (!authorText && extraAuthor) {
      authorText = extraAuthor;
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
        authorText: null,
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
    return true;
  }
  // 仅在调试时输出无规则信息
  return false;
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
      keywords: Array.isArray(rule.keywords)
        ? rule.keywords.map((text) => String(text || '').trim().toLowerCase()).filter(Boolean)
        : [],
      allowedAuthors: Array.isArray(rule.allowedAuthors)
        ? rule.allowedAuthors.map((text) => String(text || '').trim().toLowerCase()).filter(Boolean)
        : [],
      maxDurationSeconds:
        Number.isFinite(rule.maxDurationSeconds) && rule.maxDurationSeconds > 0
          ? rule.maxDurationSeconds
          : DEFAULT_RULE_DURATION_SECONDS
    }))
    .filter((rule) => rule.keywords.length > 0);
  return { rules };
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
    console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:start', cacheKey, ids);
  }
  card.dataset.bsrbMetadataLoading = '1';
  fetchVideoMetadata(ids)
    .then((metadata) => {
      if (metadata) {
        videoMetadataCache.set(cacheKey, metadata);
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:success', cacheKey, metadata);
        }
        applyMetadataToCard(card, metadata);
      } else if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:empty', cacheKey);
      }
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-metadata:error', cacheKey, error && error.message);
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
  const dataset = card.dataset || {};
  const datasetBvid =
    dataset.bvid || dataset.bvId || dataset.biliBvid || dataset.videoId || dataset.bsrbBvid;
  if (datasetBvid && /^BV[0-9A-Za-z]{10}$/.test(datasetBvid)) {
    return { bvid: datasetBvid };
  }
  const datasetAid = dataset.aid || dataset.avId;
  if (datasetAid && Number.isFinite(Number.parseInt(datasetAid, 10))) {
    return { aid: Number.parseInt(datasetAid, 10) };
  }
  const anchor = card.querySelector('a[href*=\"/video/\"]');
  if (!anchor) {
    return null;
  }
  const href = anchor.getAttribute('href') || anchor.href || '';
  const bvMatch = href.match(/BV[0-9A-Za-z]{10}/);
  if (bvMatch) {
    return { bvid: bvMatch[0] };
  }
  const avMatch = href.match(/av(\\d+)/i);
  if (avMatch) {
    return { aid: Number.parseInt(avMatch[1], 10) };
  }
  return null;
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
      const title = data.title || '';
      const bvid = data.bvid || data.videoData?.bvid || ids.bvid;
      if (!bvid) {
        return {
          tags: [],
          author,
          title
        };
      }
      return fetchVideoTags(bvid).then((tags) => ({
        tags,
        author,
        title
      }));
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-view:error', error && error.message);
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
      return json.data
        .map((tag) => tag.tag_name || tag.name || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    })
    .catch((error) => {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ShortVideoBlocker][ClipRule]', 'fetch-tags:error', error && error.message);
      }
      return [];
    });
}

function applyMetadataToCard(card, metadata) {
  if (!card || !metadata || !card.dataset) {
    return;
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[ShortVideoBlocker][ClipRule]', 'apply-metadata', metadata);
  }
  const hadTags = Boolean(card.dataset.bsrbExtraTags);
  if (metadata.tags && metadata.tags.length) {
    card.dataset.bsrbExtraTags = JSON.stringify(metadata.tags);
  }
  if (metadata.author) {
    card.dataset.bsrbExtraAuthor = metadata.author;
  }
  if (metadata.title) {
    card.dataset.bsrbExtraTitle = metadata.title;
  }
  if (!hadTags && metadata.tags && metadata.tags.length) {
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
    if (shouldHide) {
      node.classList.add(HIDDEN_CLASS);
    } else {
      node.classList.remove(HIDDEN_CLASS);
    }
  });
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
