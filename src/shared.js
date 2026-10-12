(function attachSharedSettings() {
  const DEFAULT_THRESHOLD_SECONDS = 180;
  const DEFAULT_CLEAN_ENDING_ENABLED = true;
  const DEFAULT_HIDE_OPERATOR_CARDS_ENABLED = true;
  const DEFAULT_BLACKLIST_SETTINGS = {
    enabled: true,
    lastFetched: 0,
    biliBlacks: [],
    customBlacks: []
  };
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
  const CLEAN_ENDING_KEY = 'cleanEndingEnabled';
  const OPERATOR_CARDS_KEY = 'hideOperatorCardsEnabled';
  const CLIP_SETTINGS_KEY = 'clipFilterSettings';
  const FOLLOW_SETTINGS_KEY = 'followWhitelistSettings';
  const BLACKLIST_SETTINGS_KEY = 'authorBlacklistSettings';
  const BLOCKED_VIDEOS_KEY = 'customBlockedVideos';
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

  function normalizeBlacklistSettings(value) {
    if (!value || typeof value !== 'object') {
      return { ...DEFAULT_BLACKLIST_SETTINGS };
    }
    const enabled = value.enabled !== false;
    const lastFetched =
      typeof value.lastFetched === 'number' && Number.isFinite(value.lastFetched)
        ? value.lastFetched
        : 0;
    const biliBlacks = Array.isArray(value.biliBlacks)
      ? value.biliBlacks
          .map((entry) => {
            if (!entry) return null;
            if (typeof entry === 'number' && Number.isFinite(entry)) {
              return { uid: entry, name: '' };
            }
            if (typeof entry === 'object') {
              const uid = Number.isFinite(Number(entry.uid || entry.mid))
                ? Number(entry.uid || entry.mid)
                : null;
              const name = String(entry.name || entry.uname || '').trim();
              return uid != null ? { uid, name } : null;
            }
            return null;
          })
          .filter(Boolean)
      : [];
    const customBlacks = Array.isArray(value.customBlacks)
      ? value.customBlacks
          .map((item) => {
            const num = Number.parseInt(item, 10);
            return Number.isFinite(num) ? num : null;
          })
          .filter((item) => item != null)
      : [];
    return {
      enabled,
      lastFetched,
      biliBlacks,
      customBlacks
    };
  }

  function normalizeBlockedVideos(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const clean = item.trim();
          return clean ? { id: clean, bvid: clean, title: '', timestamp: Date.now() } : null;
        }
        if (typeof item === 'object') {
          const id = String(item.id || item.bvid || (item.aid ? `aid:${item.aid}` : '')).trim();
          if (!id) return null;
          return {
            id,
            bvid: String(item.bvid || '').trim(),
            aid: Number.isFinite(Number(item.aid)) ? Number(item.aid) : null,
            title: String(item.title || '').trim(),
            author: String(item.author || '').trim(),
            authorUid: Number.isFinite(Number(item.authorUid)) ? Number(item.authorUid) : null,
            timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now()
          };
        }
        return null;
      })
      .filter(Boolean);
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

  function readCleanEnding(storageArea = resolveStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve(DEFAULT_CLEAN_ENDING_ENABLED);
        return;
      }
      storageArea.get({ [CLEAN_ENDING_KEY]: DEFAULT_CLEAN_ENDING_ENABLED }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve(DEFAULT_CLEAN_ENDING_ENABLED);
          return;
        }
        resolve(result[CLEAN_ENDING_KEY] !== false);
      });
    });
  }

  function readHideOperatorCards(storageArea = resolveStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve(DEFAULT_HIDE_OPERATOR_CARDS_ENABLED);
        return;
      }
      storageArea.get({ [OPERATOR_CARDS_KEY]: DEFAULT_HIDE_OPERATOR_CARDS_ENABLED }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve(DEFAULT_HIDE_OPERATOR_CARDS_ENABLED);
          return;
        }
        resolve(result[OPERATOR_CARDS_KEY] !== false);
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

  function readBlacklistSettings(storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve({ ...DEFAULT_BLACKLIST_SETTINGS });
        return;
      }
      storageArea.get({ [BLACKLIST_SETTINGS_KEY]: DEFAULT_BLACKLIST_SETTINGS }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve({ ...DEFAULT_BLACKLIST_SETTINGS });
          return;
        }
        resolve(result[BLACKLIST_SETTINGS_KEY]);
      });
    }).then(normalizeBlacklistSettings);
  }

  function readBlockedVideos(storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve([]);
        return;
      }
      storageArea.get({ [BLOCKED_VIDEOS_KEY]: [] }, (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve([]);
          return;
        }
        resolve(result[BLOCKED_VIDEOS_KEY]);
      });
    }).then(normalizeBlockedVideos);
  }

  function saveBlockedVideos(videos, storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      const normalized = normalizeBlockedVideos(videos);
      storageArea.set({ [BLOCKED_VIDEOS_KEY]: normalized }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save blocked videos.'));
          return;
        }
        resolve(normalized);
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

  function saveCleanEnding(value, storageArea = resolveStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [CLEAN_ENDING_KEY]: Boolean(value) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save clean ending setting.'));
          return;
        }
        resolve();
      });
    });
  }

  function saveHideOperatorCards(value, storageArea = resolveStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [OPERATOR_CARDS_KEY]: Boolean(value) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save operator cards setting.'));
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

  function saveBlacklistSettings(settings, storageArea = resolveFollowStorageArea().area) {
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        reject(new Error('Storage area is unavailable in current context.'));
        return;
      }
      storageArea.set({ [BLACKLIST_SETTINGS_KEY]: normalizeBlacklistSettings(settings) }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save blacklist settings.'));
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

  function saveDecisionRecords(records, storageArea = resolveFollowStorageArea().area) {
    const incoming = (Array.isArray(records) ? records : [records])
      .map((item) => normalizeDecisionRecord(item))
      .filter(Boolean);
    if (!incoming.length) {
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
        const list = (Array.isArray(result[DECISION_RECORDS_KEY])
          ? result[DECISION_RECORDS_KEY]
          : []
        )
          .map((item) => normalizeDecisionRecord(item))
          .filter(Boolean);
        // 批量去重：新记录优先，同 id+result 只保留一条，避免每次判定都产生一次读改写。
        const combined = new Map();
        incoming.forEach((item) => {
          const key = `${item.id}:${item.result}`;
          if (!combined.has(key)) {
            combined.set(key, item);
          }
        });
        list.forEach((item) => {
          const key = `${item.id}:${item.result}`;
          if (!combined.has(key)) {
            combined.set(key, item);
          }
        });
        const next = Array.from(combined.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, DECISION_RECORD_LIMIT);
        storageArea.set({ [DECISION_RECORDS_KEY]: next }, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Failed to save decision records.'));
            return;
          }
          resolve(next);
        });
      });
    });
  }

  function saveDecisionRecord(record, storageArea = resolveFollowStorageArea().area) {
    return saveDecisionRecords([record], storageArea);
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
    DEFAULT_CLEAN_ENDING_ENABLED,
    DEFAULT_HIDE_OPERATOR_CARDS_ENABLED,
    DEFAULT_CLIP_SETTINGS,
    DEFAULT_FOLLOW_SETTINGS,
    DEFAULT_BLACKLIST_SETTINGS,
    STORAGE_KEY,
    CLEAN_ENDING_KEY,
    OPERATOR_CARDS_KEY,
    CLIP_SETTINGS_KEY,
    FOLLOW_SETTINGS_KEY,
    BLACKLIST_SETTINGS_KEY,
    resolveStorageArea,
    resolveFollowStorageArea,
    normalizeThreshold,
    readThreshold,
    saveThreshold,
    readCleanEnding,
    saveCleanEnding,
    readHideOperatorCards,
    saveHideOperatorCards,
    normalizeClipSettings,
    readClipSettings,
    saveClipSettings,
    normalizeFollowSettings,
    readFollowSettings,
    saveFollowSettings,
    normalizeBlacklistSettings,
    readBlacklistSettings,
    saveBlacklistSettings,
    normalizeBlockedVideos,
    readBlockedVideos,
    saveBlockedVideos,
    BLOCKED_VIDEOS_KEY,
    readDecisionRecords,
    saveDecisionRecord,
    saveDecisionRecords,
    clearDecisionRecords,
    DECISION_RECORDS_KEY,
    DECISION_RECORD_LIMIT
  };

  if (typeof window !== 'undefined') {
    window.BiliShortVideoBlockerShared = shared;
  }
})();
