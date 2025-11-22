const form = document.getElementById('threshold-form');
const thresholdInput = document.getElementById('threshold-input');
const rulesContainer = document.getElementById('clip-rules');
const addRuleButton = document.getElementById('add-rule');
const ruleTemplate = document.getElementById('clip-rule-template');
const followEnableInput = document.getElementById('follow-enable');
const followStatusText = document.getElementById('follow-status-text');
const followRefreshButton = document.getElementById('follow-refresh');
const followReloadButton = document.getElementById('follow-reload');
const followListContainer = document.getElementById('follow-list');
const decisionReloadButton = document.getElementById('decision-reload');
const decisionClearButton = document.getElementById('decision-clear');
const decisionBlockList = document.getElementById('decision-block-list');
const decisionAllowList = document.getElementById('decision-allow-list');
const status = document.getElementById('status-text');

const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || null;
const storageInfo = shared ? shared.resolveStorageArea() : { area: null, name: 'sync' };
const storageArea = storageInfo.area;
const followStorageInfo =
  shared && typeof shared.resolveFollowStorageArea === 'function'
    ? shared.resolveFollowStorageArea()
    : storageInfo;
const followStorageArea = followStorageInfo.area;

const DEFAULT_THRESHOLD_SECONDS = shared
  ? shared.DEFAULT_THRESHOLD_SECONDS
  : 60;

const FALLBACK_CLIP_SETTINGS = {
  rules: []
};
const FOLLOW_SETTINGS_KEY =
  shared && shared.FOLLOW_SETTINGS_KEY ? shared.FOLLOW_SETTINGS_KEY : 'followWhitelistSettings';
const DECISION_RECORDS_KEY =
  shared && shared.DECISION_RECORDS_KEY ? shared.DECISION_RECORDS_KEY : 'decisionRecords';
const FALLBACK_FOLLOW_SETTINGS = shared
  ? { ...shared.DEFAULT_FOLLOW_SETTINGS }
  : { enabled: true, lastFetched: 0, follows: [] };

let currentFollowSettings = getFallbackFollowSettings();
let latestDecisionRecords = { block: [], allow: [] };

init();

function init() {
  if (!form || !thresholdInput) {
    return;
  }
  loadSettings();
  form.addEventListener('submit', handleSubmit);
  if (addRuleButton) {
    addRuleButton.addEventListener('click', () => {
      addRuleEditor();
    });
  }
  if (followRefreshButton) {
    followRefreshButton.addEventListener('click', handleFollowRefresh);
  }
  if (followReloadButton) {
    followReloadButton.addEventListener('click', () => {
      refreshFollowSettingsFromStorage(true);
    });
  }
  if (decisionReloadButton) {
    decisionReloadButton.addEventListener('click', () => {
      refreshDecisionRecords(true);
    });
  }
  if (decisionClearButton) {
    decisionClearButton.addEventListener('click', handleDecisionClear);
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[FOLLOW_SETTINGS_KEY] && changes[FOLLOW_SETTINGS_KEY].newValue) {
        currentFollowSettings = normalizeFollowSettings(changes[FOLLOW_SETTINGS_KEY].newValue);
        renderFollowSettings(currentFollowSettings);
      }
      if (changes[DECISION_RECORDS_KEY]) {
        refreshDecisionRecords();
      }
    });
  }
}

function loadSettings() {
  if (!shared) {
    thresholdInput.value = String(DEFAULT_THRESHOLD_SECONDS);
    renderRuleEditors(getFallbackClipSettings().rules);
    renderFollowSettings(getFallbackFollowSettings());
    renderDecisionRecords([], []);
    renderStatus('共享配置未加载，已使用默认值', true);
    return;
  }
  Promise.all([shared.readThreshold(storageArea), shared.readClipSettings(storageArea)])
    .then(([rawThreshold, rawClipSettings]) => {
      const value = shared.normalizeThreshold(rawThreshold);
      thresholdInput.value = String(value);
      const normalizedClip =
        typeof shared.normalizeClipSettings === 'function'
          ? shared.normalizeClipSettings(rawClipSettings)
          : rawClipSettings;
      renderRuleEditors(normalizedClip?.rules);
      refreshFollowSettingsFromStorage();
      refreshDecisionRecords();
    })
    .catch(() => {
      thresholdInput.value = String(DEFAULT_THRESHOLD_SECONDS);
      renderRuleEditors(getFallbackClipSettings().rules);
      currentFollowSettings = getFallbackFollowSettings();
      renderFollowSettings(currentFollowSettings);
      renderDecisionRecords([], []);
      renderStatus('读取存储失败，已使用默认值', true);
    });
}

function handleSubmit(event) {
  event.preventDefault();
  if (!shared) {
    renderStatus('共享配置未加载，无法保存', true);
    return;
  }
  const thresholdValue = shared.normalizeThreshold(thresholdInput.value);
  const clipRules = gatherRulesFromDom();
  const clipPayload = { rules: clipRules.length ? clipRules : getFallbackClipSettings().rules };
  const followPayload = {
    ...currentFollowSettings,
    enabled: followEnableInput ? followEnableInput.checked : currentFollowSettings.enabled
  };
  currentFollowSettings = followPayload;
  Promise.all([
    shared.saveThreshold(thresholdValue, storageArea),
    shared.saveClipSettings(clipPayload, storageArea),
    shared.saveFollowSettings ? shared.saveFollowSettings(followPayload, storageArea) : Promise.resolve()
  ])
    .then(() => {
      renderStatus('设置已保存');
    })
    .catch(() => {
      renderStatus('保存失败，请重试', true);
    });
}

function renderRuleEditors(rules) {
  if (!rulesContainer) {
    return;
  }
  rulesContainer.innerHTML = '';
  const list =
    Array.isArray(rules) && rules.length ? rules : getFallbackClipSettings().rules;
  list.forEach((rule) => addRuleEditor(rule));
  if (!rulesContainer.children.length) {
    addRuleEditor();
  }
}

function addRuleEditor(rule = {}) {
  if (!rulesContainer || !ruleTemplate) {
    return;
  }
  const fragment = ruleTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.rule-card');
  const enabledInput = card.querySelector('[data-field="enabled"]');
  const durationInput = card.querySelector('[data-field="duration"]');
  const keywordsInput = card.querySelector('[data-field="keywords"]');
  const authorsInput = card.querySelector('[data-field="authors"]');
  const removeButton = card.querySelector('[data-action="remove-rule"]');

  enabledInput.checked = rule.enabled !== false;
  const minutes = rule.maxDurationSeconds
    ? Math.max(1, Math.round(rule.maxDurationSeconds / 60))
    : 20;
  durationInput.value = String(minutes);
  keywordsInput.value = Array.isArray(rule.keywords)
    ? rule.keywords.join('\n')
    : '';
  authorsInput.value = Array.isArray(rule.allowedAuthors)
    ? rule.allowedAuthors.join('\n')
    : '';

  if (removeButton) {
    removeButton.addEventListener('click', () => {
      card.remove();
      if (!rulesContainer.children.length) {
        addRuleEditor();
      }
      refreshRuleIndexes();
    });
  }

  rulesContainer.appendChild(fragment);
  refreshRuleIndexes();
}

function gatherRulesFromDom() {
  if (!rulesContainer) {
    return [];
  }
  const cards = Array.from(rulesContainer.querySelectorAll('.rule-card'));
  return cards
    .map((card) => {
      const enabled = card.querySelector('[data-field="enabled"]').checked;
      const durationMinutes = Number.parseInt(
        card.querySelector('[data-field="duration"]').value,
        10
      );
      const keywords = parseTextList(
        card.querySelector('[data-field="keywords"]').value
      );
      const allowedAuthors = parseTextList(
        card.querySelector('[data-field="authors"]').value
      );
      const maxDurationSeconds =
        Number.isFinite(durationMinutes) && durationMinutes > 0
          ? durationMinutes * 60
          : 60;
      return {
        enabled,
        keywords,
        allowedAuthors,
        maxDurationSeconds
      };
    })
    .filter((rule) => rule.keywords.length > 0);
}

function parseTextList(text) {
  return String(text || '')
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFallbackClipSettings() {
  if (shared && typeof shared.normalizeClipSettings === 'function') {
    return shared.normalizeClipSettings({ rules: FALLBACK_CLIP_SETTINGS.rules || [] });
  }
  return {
    rules: Array.isArray(FALLBACK_CLIP_SETTINGS.rules)
      ? FALLBACK_CLIP_SETTINGS.rules.map((rule) => ({
          ...rule,
          keywords: [...rule.keywords],
          allowedAuthors: [...rule.allowedAuthors]
        }))
      : []
  };
}

function getFallbackFollowSettings() {
  if (shared && typeof shared.normalizeFollowSettings === 'function') {
    return shared.normalizeFollowSettings(FALLBACK_FOLLOW_SETTINGS);
  }
  return { ...FALLBACK_FOLLOW_SETTINGS, follows: [] };
}

function refreshRuleIndexes() {
  if (!rulesContainer) {
    return;
  }
  const labels = rulesContainer.querySelectorAll('[data-rule-index]');
  labels.forEach((node, index) => {
    node.textContent = String(index + 1);
  });
}

function renderFollowSettings(settings) {
  if (!settings) {
    return;
  }
  if (followEnableInput) {
    followEnableInput.checked = Boolean(settings.enabled);
  }
  if (followStatusText) {
    const count = Array.isArray(settings.follows) ? settings.follows.length : 0;
    const timeText =
      settings.lastFetched && Number.isFinite(Number(settings.lastFetched))
        ? new Date(settings.lastFetched).toLocaleString()
        : '尚未同步';
    if (!settings.enabled) {
      followStatusText.textContent = '关注白名单已禁用';
    } else if (count === 0) {
      followStatusText.textContent = '已启用，等待同步关注列表';
    } else {
      followStatusText.textContent = `已同步 ${count} 个关注（${timeText}）`;
    }
  }
  if (followListContainer) {
    const follows = Array.isArray(settings.follows) ? settings.follows : [];
    if (!follows.length) {
      followListContainer.textContent = '暂无缓存的关注名单';
    } else {
      followListContainer.innerHTML = follows
        .map((entry) => `<span class="follow-list__item">${entry.name || ''}</span>`)
        .join('');
    }
  }
}

function refreshDecisionRecords(showStatusOnError = false) {
  if (!shared || typeof shared.readDecisionRecords !== 'function') {
    renderDecisionRecords([], []);
    return Promise.resolve();
  }
  const area = followStorageArea || storageArea;
  return shared
    .readDecisionRecords(area)
    .then((records) => {
      const block = [];
      const allow = [];
      (records || []).forEach((record) => {
        if (record && record.result === 'allow') {
          allow.push(record);
        } else if (record) {
          block.push(record);
        }
      });
      latestDecisionRecords = { block, allow };
      renderDecisionRecords(block, allow);
    })
    .catch(() => {
      if (showStatusOnError) {
        renderStatus('读取决策记录失败', true);
      }
      renderDecisionRecords([], []);
    });
}

function renderDecisionRecords(blockList, allowList) {
  renderDecisionList(decisionBlockList, blockList, '暂无屏蔽缓存');
  renderDecisionList(decisionAllowList, allowList, '暂无放行缓存');
}

function renderDecisionList(container, records, emptyText) {
  if (!container) {
    return;
  }
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    container.textContent = emptyText;
    return;
  }
  container.innerHTML = list
    .map((record) => {
      const timeText = record.timestamp
        ? new Date(record.timestamp).toLocaleString()
        : '';
      const durationText = Number.isFinite(Number(record.durationSeconds))
        ? `${Math.round(record.durationSeconds)}s`
        : '未知时长';
      const reasonText = record.reason ? `原因：${record.reason}` : '';
      const reasonLabel = reasonText || '原因：-';
      return `
        <div class="decision-item">
          <div class="decision-item__title">${escapeHtml(record.title || '未命名视频')}</div>
          <div class="decision-item__meta">UP：${escapeHtml(record.author || '未知')} ｜ 时长：${durationText}</div>
          <div class="decision-item__meta">${escapeHtml(reasonLabel)}${timeText ? ` ｜ ${escapeHtml(timeText)}` : ''}</div>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function handleDecisionClear() {
  if (!shared || typeof shared.clearDecisionRecords !== 'function') {
    renderStatus('当前环境不支持清空决策记录', true);
    return;
  }
  const area = followStorageArea || storageArea;
  shared
    .clearDecisionRecords(area)
    .then(() => {
      latestDecisionRecords = { block: [], allow: [] };
      renderDecisionRecords([], []);
      renderStatus('决策记录已清空');
    })
    .catch(() => {
      renderStatus('清空决策记录失败', true);
    });
}

function handleFollowRefresh() {
  if (!shared || !shared.saveFollowSettings) {
    renderStatus('共享配置未加载，无法清空关注缓存', true);
    return;
  }
  currentFollowSettings = {
    ...currentFollowSettings,
    follows: [],
    lastFetched: 0
  };
  renderFollowSettings(currentFollowSettings);
  shared
    .saveFollowSettings(currentFollowSettings, followStorageArea || storageArea)
    .then(() => {
      renderStatus('关注缓存已清空，下次访问 B 站页面时会重新同步');
    })
    .catch(() => {
      renderStatus('清空关注缓存失败', true);
    });
}

function refreshFollowSettingsFromStorage(showStatusOnError = false) {
  if (!shared || !shared.readFollowSettings) {
    currentFollowSettings = getFallbackFollowSettings();
    renderFollowSettings(currentFollowSettings);
    return Promise.resolve();
  }
  return shared
    .readFollowSettings(followStorageArea || storageArea)
    .then((rawFollowSettings) => {
      currentFollowSettings = normalizeFollowSettings(rawFollowSettings);
      renderFollowSettings(currentFollowSettings);
    })
    .catch(() => {
      currentFollowSettings = getFallbackFollowSettings();
      renderFollowSettings(currentFollowSettings);
      if (showStatusOnError) {
        renderStatus('刷新关注列表失败', true);
      }
    });
}

function normalizeFollowSettings(rawFollowSettings) {
  if (typeof shared.normalizeFollowSettings === 'function') {
    return shared.normalizeFollowSettings(rawFollowSettings);
  }
  return rawFollowSettings || getFallbackFollowSettings();
}

function renderStatus(message, isError = false) {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = isError ? 'status status--error' : 'status status--success';
  if (!message) {
    return;
  }
  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 2000);
}
