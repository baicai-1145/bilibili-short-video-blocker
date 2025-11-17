(function attachSharedSettings() {
  const DEFAULT_THRESHOLD_SECONDS = 60;
  const DEFAULT_CLIP_SETTINGS = {
    rules: []
  };
  const DEFAULT_FOLLOW_SETTINGS = {
    enabled: true,
    lastFetched: 0,
    follows: []
  };
  const DECISION_RECORDS_KEY = 'decisionRecords';
  const DECISION_RECORD_LIMIT = 200;
  const STORAGE_KEY = 'thresholdSeconds';
  const CLIP_SETTINGS_KEY = 'clipFilterSettings';
  const FOLLOW_SETTINGS_KEY = 'followWhitelistSettings';
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

  function resolveFollowStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return { area: chrome.storage.local, name: 'local' };
    }
    return resolveStorageArea();
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

  function normalizeFollowSettings(value) {
    if (!value || typeof value !== 'object') {
      return { ...DEFAULT_FOLLOW_SETTINGS, follows: [] };
    }
    const follows = Array.isArray(value.follows)
      ? value.follows
          .map((entry) => {
            if (!entry) {
              return null;
            }
            if (typeof entry === 'string') {
              return {
                name: entry.trim(),
                uid: null
              };
            }
            return {
              name: entry.name ? String(entry.name || '').trim() : '',
              uid: entry.uid ? Number.parseInt(entry.uid, 10) : null
            };
          })
          .filter((entry) => entry && entry.name)
      : [];
    return {
      enabled: Boolean(value.enabled),
      lastFetched: Number.isFinite(Number(value.lastFetched)) ? Number(value.lastFetched) : 0,
      follows
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

  function readFollowSettings(storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve({ ...DEFAULT_FOLLOW_SETTINGS });
        return;
      }
      storageArea.get({ [FOLLOW_SETTINGS_KEY]: DEFAULT_FOLLOW_SETTINGS }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve({ ...DEFAULT_FOLLOW_SETTINGS });
          return;
        }
        resolve(result[FOLLOW_SETTINGS_KEY]);
      });
    }).then(normalizeFollowSettings);
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

  function saveFollowSettings(settings, storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [FOLLOW_SETTINGS_KEY]: normalizeFollowSettings(settings) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save follow settings.'));
          return;
        }
        resolve();
      });
    });
  }

  function normalizeDecisionRecord(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }
    const id = String(record.id || '').trim();
    if (!id) {
      return null;
    }
    const title = String(record.title || '').trim();
    const author = String(record.author || '').trim();
    const reason = String(record.reason || '').trim();
    const result = record.result === 'allow' ? 'allow' : 'block';
    const timestamp = Number.isFinite(Number(record.timestamp))
      ? Number(record.timestamp)
      : Date.now();
    const durationSeconds = Number.isFinite(Number(record.durationSeconds))
      ? Number(record.durationSeconds)
      : null;
    return { id, title, author, reason, result, timestamp, durationSeconds };
  }

  function readDecisionRecords(storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve([]);
        return;
      }
      storageArea.get({ [DECISION_RECORDS_KEY]: [] }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve([]);
          return;
        }
        const list = Array.isArray(result[DECISION_RECORDS_KEY])
          ? result[DECISION_RECORDS_KEY]
          : [];
        resolve(list);
      });
    }).then((list) => list.map((item) => normalizeDecisionRecord(item)).filter(Boolean));
  }

  function saveDecisionRecord(record, storageArea = resolveFollowStorageArea().area) {
    const normalized = normalizeDecisionRecord(record);
    if (!normalized) {
      return Promise.resolve([]);
    }
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        resolve([]);
        return;
      }
      storageArea.get({ [DECISION_RECORDS_KEY]: [] }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to read decision records.'));
          return;
        }
        const list = Array.isArray(result[DECISION_RECORDS_KEY])
          ? result[DECISION_RECORDS_KEY]
          : [];
        const combined = [normalized, ...list]
          .filter((item) => item && item.id)
          .reduce((acc, item) => {
            const key = `${item.id}:${item.result}`;
            if (!acc.has(key)) {
              acc.set(key, item);
            }
            return acc;
          }, new Map());
        const next = Array.from(combined.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, DECISION_RECORD_LIMIT);
        storageArea.set({ [DECISION_RECORDS_KEY]: next }, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Failed to save decision record.'));
            return;
          }
          resolve(next);
        });
      });
    });
  }

  function clearDecisionRecords(storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        resolve();
        return;
      }
      storageArea.set({ [DECISION_RECORDS_KEY]: [] }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to clear decision records.'));
          return;
        }
        resolve();
      });
    });
  }

  const shared = {
    DEFAULT_THRESHOLD_SECONDS,
    DEFAULT_CLIP_SETTINGS,
    DEFAULT_FOLLOW_SETTINGS,
    STORAGE_KEY,
    CLIP_SETTINGS_KEY,
    FOLLOW_SETTINGS_KEY,
    resolveStorageArea,
    resolveFollowStorageArea,
    normalizeThreshold,
    readThreshold,
    saveThreshold,
    normalizeClipSettings,
    readClipSettings,
    saveClipSettings,
    normalizeFollowSettings,
    readFollowSettings,
    saveFollowSettings,
    readDecisionRecords,
    saveDecisionRecord,
    clearDecisionRecords,
    DECISION_RECORDS_KEY,
    DECISION_RECORD_LIMIT
  };

  if (typeof window !== 'undefined') {
    window.BiliShortVideoBlockerShared = shared;
  }
})();
