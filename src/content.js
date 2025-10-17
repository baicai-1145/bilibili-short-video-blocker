const fallbackShared = {
  DEFAULT_THRESHOLD_SECONDS: 60,
  STORAGE_KEY: 'thresholdSeconds',
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
  readThreshold() {
    return Promise.resolve(60);
  }
};

const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || fallbackShared;

const {
  DEFAULT_THRESHOLD_SECONDS,
  STORAGE_KEY,
  resolveStorageArea,
  normalizeThreshold,
  readThreshold
} = shared;
const HIDDEN_CLASS = 'bili-short-video-blocker__hidden';
const DURATION_PATTERN = /(\d{1,2}:)?\d{1,2}:\d{2}/;

const CARD_CONFIGS = [
  {
    name: 'grid-card',
    cardSelector: ['.bili-video-card'],
    durationSelectors: [
      '.bili-video-card__stats__duration',
      '.bili-video-card__mask span.duration',
      '.bili-video-card__info--right span'
    ]
  },
  {
    name: 'right-rail-card',
    cardSelector: [
      '.video-page-card-small',
      'a.video-page-card-small',
      '.video-card-reco',
      '.recommend-video-card'
    ],
    durationSelectors: ['.duration', '.time', '.video-duration', '.card-duration', '.bili-video-card__stats__duration']
  },
  {
    name: 'list-card',
    cardSelector: [
      'li.video-list-item',
      'li.video-item',
      '.video-card-common',
      '.video-page-operator-card'
    ],
    durationSelectors: ['.time', '.duration', '.video-duration', '.card-duration']
  }
];

const trackedCards = new Set();
let thresholdSeconds = DEFAULT_THRESHOLD_SECONDS;
let storageArea = null;
let storageAreaName = 'sync';
let scanScheduled = false;

init();

function init() {
  ensureStyleInjected();
  const resolvedStorage = resolveStorageArea();
  storageArea = resolvedStorage.area;
  storageAreaName = resolvedStorage.name;
  readThreshold(storageArea).then((value) => {
    thresholdSeconds = normalizeThreshold(value);
    scanForCards(document.body);
    observeMutations();
  });
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
}

function handleStorageChange(changes, areaName) {
  if (areaName !== storageAreaName) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
    return;
  }
  const newValue = normalizeThreshold(changes[STORAGE_KEY].newValue);
  if (newValue === thresholdSeconds) {
    return;
  }
  thresholdSeconds = newValue;
  rescanTrackedCards();
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
  applyVisibility(card, durationSeconds);
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

function applyVisibility(card, durationSeconds) {
  const shouldHide = Number.isFinite(durationSeconds) && durationSeconds >= 0 && thresholdSeconds > 0 && durationSeconds < thresholdSeconds;
  if (shouldHide) {
    card.classList.add(HIDDEN_CLASS);
  } else {
    card.classList.remove(HIDDEN_CLASS);
  }
}
