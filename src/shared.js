(function attachSharedSettings() {
  const DEFAULT_THRESHOLD_SECONDS = 60;
  const DEFAULT_CLIP_SETTINGS = {
    rules: []
  };
  const STORAGE_KEY = 'thresholdSeconds';
  const CLIP_SETTINGS_KEY = 'clipFilterSettings';
  const DEFAULT_CLIP_RULE = {
    enabled: true,
    keywords: [],
    allowedAuthors: [],
    maxDurationSeconds: 60
  };

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && !!(chrome.storage && (chrome.storage.sync || chrome.storage.local));
  }

  function resolveStorageArea() {
    if (!hasChromeStorage()) {
      return { area: null, name: 'sync' };
    }
    if (chrome.storage.sync) {
      return { area: chrome.storage.sync, name: 'sync' };
    }
    if (chrome.storage.local) {
      return { area: chrome.storage.local, name: 'local' };
    }
    return { area: null, name: 'sync' };
  }

  function normalizeThreshold(value) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return DEFAULT_THRESHOLD_SECONDS;
    }
    return numeric;
  }

  function normalizeTextList(value) {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const result = [];
    values.forEach((item) => {
      String(item || '')
        .split(/\r?\n+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => result.push(part));
    });
    return result;
  }

  function normalizeClipRule(rule) {
    if (!rule || typeof rule !== 'object') {
      return { ...DEFAULT_CLIP_RULE, keywords: [], allowedAuthors: [] };
    }
    const keywords = normalizeTextList(rule.keywords);
    const allowedAuthors = normalizeTextList(rule.allowedAuthors);
    const maxDurationSeconds = (() => {
      const numeric = Number.parseInt(rule.maxDurationSeconds, 10);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
      return DEFAULT_CLIP_RULE.maxDurationSeconds;
    })();
    return {
      enabled: rule.enabled !== false,
      keywords,
      allowedAuthors,
      maxDurationSeconds
    };
  }

  function normalizeClipSettings(value) {
    const rawRules = Array.isArray(value?.rules) ? value.rules : [];
    const normalizedRules = rawRules
      .map((rule) => normalizeClipRule(rule))
      .filter((rule) => rule.keywords.length > 0);
    return {
      rules: normalizedRules
    };
  }

  function readThreshold(storageArea = resolveStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve(DEFAULT_THRESHOLD_SECONDS);
        return;
      }
      storageArea.get({ [STORAGE_KEY]: DEFAULT_THRESHOLD_SECONDS }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve(DEFAULT_THRESHOLD_SECONDS);
          return;
        }
        resolve(result[STORAGE_KEY]);
      });
    });
  }

  function readClipSettings(storageArea = resolveStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve({ ...DEFAULT_CLIP_SETTINGS });
        return;
      }
      storageArea.get({ [CLIP_SETTINGS_KEY]: DEFAULT_CLIP_SETTINGS }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve({ ...DEFAULT_CLIP_SETTINGS });
          return;
        }
        resolve(result[CLIP_SETTINGS_KEY]);
      });
    }).then(normalizeClipSettings);
  }

  function saveThreshold(value, storageArea = resolveStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [STORAGE_KEY]: normalizeThreshold(value) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save threshold.'));
          return;
        }
        resolve();
      });
    });
  }

  function saveClipSettings(settings, storageArea = resolveStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [CLIP_SETTINGS_KEY]: normalizeClipSettings(settings) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save clip settings.'));
          return;
        }
        resolve();
      });
    });
  }

  const shared = {
    DEFAULT_THRESHOLD_SECONDS,
    DEFAULT_CLIP_SETTINGS,
    STORAGE_KEY,
    CLIP_SETTINGS_KEY,
    resolveStorageArea,
    normalizeThreshold,
    readThreshold,
    saveThreshold,
    normalizeClipSettings,
    readClipSettings,
    saveClipSettings
  };

  if (typeof window !== 'undefined') {
    window.BiliShortVideoBlockerShared = shared;
  }
})();
