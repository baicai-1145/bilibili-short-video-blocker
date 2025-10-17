(function attachSharedSettings() {
  const DEFAULT_THRESHOLD_SECONDS = 60;
  const STORAGE_KEY = 'thresholdSeconds';

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

  const shared = {
    DEFAULT_THRESHOLD_SECONDS,
    STORAGE_KEY,
    resolveStorageArea,
    normalizeThreshold,
    readThreshold,
    saveThreshold
  };

  if (typeof window !== 'undefined') {
    window.BiliShortVideoBlockerShared = shared;
  }
})();
