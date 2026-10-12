const form = document.getElementById('threshold-form');
const thresholdInput = document.getElementById('threshold-input');
const cleanEndingEnableInput = document.getElementById('clean-ending-enable');
const hideOperatorCardsEnableInput = document.getElementById('hide-operator-cards-enable');
const rulesContainer = document.getElementById('clip-rules');
const addRuleButton = document.getElementById('add-rule');
const ruleTemplate = document.getElementById('clip-rule-template');
const followEnableInput = document.getElementById('follow-enable');
const followStatusText = document.getElementById('follow-status-text');
const followRefreshButton = document.getElementById('follow-refresh');
const followReloadButton = document.getElementById('follow-reload');
const followListContainer = document.getElementById('follow-list');
const blacklistEnableInput = document.getElementById('blacklist-enable');
const customBlacklistInput = document.getElementById('custom-blacklist-input');
const blacklistStatusText = document.getElementById('blacklist-status-text');
const blacklistRefreshButton = document.getElementById('blacklist-refresh');
const blacklistReloadButton = document.getElementById('blacklist-reload');
const blacklistListContainer = document.getElementById('blacklist-list');
const blockVideoInput = document.getElementById('block-video-input');
const blockVideoBtn = document.getElementById('block-video-btn');
const blockedVideosStatus = document.getElementById('blocked-videos-status');
const blockedVideosListContainer = document.getElementById('blocked-videos-list');
const clearBlockedVideosBtn = document.getElementById('clear-blocked-videos-btn');
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
const BLACKLIST_SETTINGS_KEY =
  shared && shared.BLACKLIST_SETTINGS_KEY ? shared.BLACKLIST_SETTINGS_KEY : 'authorBlacklistSettings';
const CLEAN_ENDING_KEY =
  shared && shared.CLEAN_ENDING_KEY ? shared.CLEAN_ENDING_KEY : 'cleanEndingEnabled';
const OPERATOR_CARDS_KEY =
  shared && shared.OPERATOR_CARDS_KEY ? shared.OPERATOR_CARDS_KEY : 'hideOperatorCardsEnabled';
const BLOCKED_VIDEOS_KEY =
  shared && shared.BLOCKED_VIDEOS_KEY ? shared.BLOCKED_VIDEOS_KEY : 'customBlockedVideos';
const DECISION_RECORDS_KEY =
  shared && shared.DECISION_RECORDS_KEY ? shared.DECISION_RECORDS_KEY : 'decisionRecords';
const FALLBACK_FOLLOW_SETTINGS = shared
  ? { ...shared.DEFAULT_FOLLOW_SETTINGS }
  : { enabled: true, lastFetched: 0, follows: [] };
const FALLBACK_BLACKLIST_SETTINGS = shared
  ? { ...shared.DEFAULT_BLACKLIST_SETTINGS }
  : { enabled: true, lastFetched: 0, biliBlacks: [], customBlacks: [] };

let currentFollowSettings = getFallbackFollowSettings();
let currentBlacklistSettings = getFallbackBlacklistSettings();
let currentBlockedVideos = [];
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
  if (blacklistRefreshButton) {
    blacklistRefreshButton.addEventListener('click', handleBlacklistRefresh);
  }
  if (blacklistReloadButton) {
    blacklistReloadButton.addEventListener('click', () => {
      refreshBlacklistSettingsFromStorage(true);
    });
  }
  if (blockVideoBtn) {
    blockVideoBtn.addEventListener('click', handleManualVideoBlock);
  }
  if (blockVideoInput) {
    blockVideoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleManualVideoBlock();
      }
    });
  }
  if (clearBlockedVideosBtn) {
    clearBlockedVideosBtn.addEventListener('click', handleClearBlockedVideos);
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
      if (changes[BLACKLIST_SETTINGS_KEY] && changes[BLACKLIST_SETTINGS_KEY].newValue) {
        currentBlacklistSettings = normalizeBlacklistSettings(changes[BLACKLIST_SETTINGS_KEY].newValue);
        renderBlacklistSettings(currentBlacklistSettings);
      }
      if (changes[BLOCKED_VIDEOS_KEY] && changes[BLOCKED_VIDEOS_KEY].newValue) {
        currentBlockedVideos = normalizeBlockedVideos(changes[BLOCKED_VIDEOS_KEY].newValue);
        renderBlockedVideos(currentBlockedVideos);
      }
      if (changes[CLEAN_ENDING_KEY] && cleanEndingEnableInput) {
        cleanEndingEnableInput.checked = changes[CLEAN_ENDING_KEY].newValue !== false;
      }
      if (changes[OPERATOR_CARDS_KEY] && hideOperatorCardsEnableInput) {
        hideOperatorCardsEnableInput.checked = changes[OPERATOR_CARDS_KEY].newValue !== false;
      }
      if (changes[DECISION_RECORDS_KEY]) {
        refreshDecisionRecords();
      }
    });
  }
}

function loadSettings() {
  if (!shared) {
    // 输入框留空而不是填默认值：填了默认值就会在下次保存时被写回，
    // 把用户已存的真实阈值覆盖掉。
    thresholdInput.value = '';
    thresholdInput.placeholder = '读取失败，未加载';
    renderRuleEditors(getFallbackClipSettings().rules);
    renderFollowSettings(getFallbackFollowSettings());
    renderDecisionRecords([], []);
    renderStatus('共享配置未加载，请重新打开本页面', true);
    return;
  }
  Promise.all([
    shared.readThreshold(storageArea),
    shared.readClipSettings(storageArea),
    typeof shared.readCleanEnding === 'function'
      ? shared.readCleanEnding(storageArea)
      : Promise.resolve(true),
    typeof shared.readHideOperatorCards === 'function'
      ? shared.readHideOperatorCards(storageArea)
      : Promise.resolve(true)
  ])
    .then(([rawThreshold, rawClipSettings, rawCleanEnding, rawHideOperatorCards]) => {
      const value = shared.normalizeThreshold(rawThreshold);
      thresholdInput.value = String(value);
      if (cleanEndingEnableInput) {
        cleanEndingEnableInput.checked = rawCleanEnding !== false;
      }
      if (hideOperatorCardsEnableInput) {
        hideOperatorCardsEnableInput.checked = rawHideOperatorCards !== false;
      }
      const normalizedClip =
        typeof shared.normalizeClipSettings === 'function'
          ? shared.normalizeClipSettings(rawClipSettings)
          : rawClipSettings;
      renderRuleEditors(normalizedClip?.rules);
      refreshFollowSettingsFromStorage();
      refreshBlacklistSettingsFromStorage();
      refreshBlockedVideosFromStorage();
      refreshDecisionRecords();
    })
    .catch(() => {
      // 同上：读取失败时留空，避免把默认值写回覆盖真实配置。
      thresholdInput.value = '';
      thresholdInput.placeholder = '读取失败，未加载';
      if (cleanEndingEnableInput) {
        cleanEndingEnableInput.checked = true;
      }
      renderRuleEditors(getFallbackClipSettings().rules);
      currentFollowSettings = getFallbackFollowSettings();
      renderFollowSettings(currentFollowSettings);
      currentBlacklistSettings = getFallbackBlacklistSettings();
      renderBlacklistSettings(currentBlacklistSettings);
      renderDecisionRecords([], []);
      renderStatus('读取存储失败，其他设置已按默认值显示；阈值未加载，保存时会保留原值', true);
    });
}

function handleSubmit(event) {
  event.preventDefault();
  if (!shared) {
    renderStatus('共享配置未加载，无法保存', true);
    return;
  }
  // 只在输入框里确实填了合法阈值时才写回。读取失败或尚在异步加载窗口时，
  // 输入框会空着（或被填成默认值），一旦照写就会把用户已存的阈值静默覆盖成默认值。
  const rawThresholdText = thresholdInput.value.trim();
  const parsedThreshold = Number.parseInt(rawThresholdText, 10);
  const thresholdWritable = rawThresholdText !== '' && Number.isFinite(parsedThreshold) && parsedThreshold >= 0;
  const thresholdValue = thresholdWritable ? parsedThreshold : null;
  const clipRules = gatherRulesFromDom();
  const clipPayload = { rules: clipRules.length ? clipRules : getFallbackClipSettings().rules };
  const followPayload = {
    ...currentFollowSettings,
    enabled: followEnableInput ? followEnableInput.checked : currentFollowSettings.enabled
  };
  currentFollowSettings = followPayload;

  const customBlacklistText = customBlacklistInput ? customBlacklistInput.value : '';
  const customBlacks = parseCustomBlacklistUids(customBlacklistText);
  const blacklistPayload = {
    ...currentBlacklistSettings,
    enabled: blacklistEnableInput ? blacklistEnableInput.checked : currentBlacklistSettings.enabled,
    customBlacks
  };
  currentBlacklistSettings = blacklistPayload;

  Promise.all([
    thresholdWritable ? shared.saveThreshold(thresholdValue, storageArea) : Promise.resolve(),
    shared.saveClipSettings(clipPayload, storageArea),
    shared.saveFollowSettings ? shared.saveFollowSettings(followPayload, followStorageArea || storageArea) : Promise.resolve(),
    shared.saveBlacklistSettings
      ? shared.saveBlacklistSettings(blacklistPayload, followStorageArea || storageArea)
      : Promise.resolve(),
    shared.saveCleanEnding
      ? shared.saveCleanEnding(cleanEndingEnableInput ? cleanEndingEnableInput.checked : true, storageArea)
      : Promise.resolve(),
    shared.saveHideOperatorCards
      ? shared.saveHideOperatorCards(
          hideOperatorCardsEnableInput ? hideOperatorCardsEnableInput.checked : true,
          storageArea
        )
      : Promise.resolve()
  ])
    .then(() => {
      renderStatus(thresholdWritable ? '设置已保存' : '设置已保存（阈值未填写或无效，已保留原值）');
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

function getFallbackBlacklistSettings() {
  if (shared && typeof shared.normalizeBlacklistSettings === 'function') {
    return shared.normalizeBlacklistSettings(FALLBACK_BLACKLIST_SETTINGS);
  }
  return { ...FALLBACK_BLACKLIST_SETTINGS, biliBlacks: [], customBlacks: [] };
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
        .map((entry) => `<span class="follow-list__item">${escapeHtml(entry.name || '')}</span>`)
        .join('');
    }
  }
}

function parseCustomBlacklistUids(text) {
  if (!text) return [];
  const uids = [];
  const lines = text.split(/[\n,，\s]+/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    const match = clean.match(/(?:space\.bilibili\.com\/)?(\d+)/);
    if (match && match[1]) {
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && !uids.includes(num)) {
        uids.push(num);
      }
    }
  }
  return uids;
}

function renderBlacklistSettings(settings) {
  if (!settings) {
    return;
  }
  if (blacklistEnableInput) {
    blacklistEnableInput.checked = Boolean(settings.enabled);
  }
  if (customBlacklistInput) {
    customBlacklistInput.value = Array.isArray(settings.customBlacks)
      ? settings.customBlacks.join('\n')
      : '';
  }
  if (blacklistStatusText) {
    const biliCount = Array.isArray(settings.biliBlacks) ? settings.biliBlacks.length : 0;
    const customCount = Array.isArray(settings.customBlacks) ? settings.customBlacks.length : 0;
    const timeText =
      settings.lastFetched && Number.isFinite(Number(settings.lastFetched))
        ? new Date(settings.lastFetched).toLocaleString()
        : '尚未同步';
    if (!settings.enabled) {
      blacklistStatusText.textContent = 'UP 主黑名单（仅比对 UID）已禁用';
    } else if (biliCount === 0 && customCount === 0) {
      blacklistStatusText.textContent = '已启用，等待同步 B 站黑名单或添加自定义 UID';
    } else {
      blacklistStatusText.textContent = `已同步 ${biliCount} 位 B 站拉黑 UID，自定义 ${customCount} 个 UID（${timeText}）`;
    }
  }
  if (blacklistListContainer) {
    const biliList = Array.isArray(settings.biliBlacks) ? settings.biliBlacks : [];
    const customList = Array.isArray(settings.customBlacks) ? settings.customBlacks : [];
    const items = [
      ...customList.map((uid) => ({ uid, label: `UID: ${uid}`, type: '自定义' })),
      ...biliList.map((entry) => ({
        uid: entry.uid || entry.mid,
        label: entry.name ? `${entry.name} (${entry.uid || entry.mid})` : `UID: ${entry.uid || entry.mid}`,
        type: 'B站拉黑'
      }))
    ];
    if (!items.length) {
      blacklistListContainer.textContent = '暂无黑名单 UID';
    } else {
      blacklistListContainer.innerHTML = items
        .map(
          (entry) =>
            `<span class="follow-list__item" style="background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;">${escapeHtml(
              entry.label
            )} <small style="color:#ff7875;">(${escapeHtml(entry.type)})</small></span>`
        )
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
      const reasonMap = {
        duration: '低于时长阈值',
        clip_rule: '命中切片规则',
        follow_whitelist: '关注白名单放行',
        author_blacklist: '命中 UP 主黑名单',
        single_video_blacklist: '手动拉黑该视频'
      };
      const reasonText = record.reason
        ? `原因：${reasonMap[record.reason] || record.reason}`
        : '';
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

function normalizeBlacklistSettings(rawBlacklistSettings) {
  if (typeof shared.normalizeBlacklistSettings === 'function') {
    return shared.normalizeBlacklistSettings(rawBlacklistSettings);
  }
  return rawBlacklistSettings || getFallbackBlacklistSettings();
}

function handleBlacklistRefresh() {
  if (!shared || !shared.saveBlacklistSettings) {
    renderStatus('共享配置未加载，无法清空黑名单缓存', true);
    return;
  }
  currentBlacklistSettings = {
    ...currentBlacklistSettings,
    biliBlacks: [],
    lastFetched: 0
  };
  renderBlacklistSettings(currentBlacklistSettings);
  shared
    .saveBlacklistSettings(currentBlacklistSettings, followStorageArea || storageArea)
    .then(() => {
      renderStatus('B 站黑名单缓存已清空，下次访问 B 站页面时会重新同步');
    })
    .catch(() => {
      renderStatus('清空黑名单缓存失败', true);
    });
}

function refreshBlacklistSettingsFromStorage(showStatusOnError = false) {
  if (!shared || !shared.readBlacklistSettings) {
    currentBlacklistSettings = getFallbackBlacklistSettings();
    renderBlacklistSettings(currentBlacklistSettings);
    return Promise.resolve();
  }
  return shared
    .readBlacklistSettings(followStorageArea || storageArea)
    .then((rawBlacklistSettings) => {
      currentBlacklistSettings = normalizeBlacklistSettings(rawBlacklistSettings);
      renderBlacklistSettings(currentBlacklistSettings);
    })
    .catch(() => {
      currentBlacklistSettings = getFallbackBlacklistSettings();
      renderBlacklistSettings(currentBlacklistSettings);
      if (showStatusOnError) {
        renderStatus('刷新黑名单失败', true);
      }
    });
}

function renderBlockedVideos(videos) {
  const list = Array.isArray(videos) ? videos : [];
  if (blockedVideosStatus) {
    blockedVideosStatus.textContent = `已屏蔽 ${list.length} 个视频`;
  }
  if (!blockedVideosListContainer) {
    return;
  }
  if (!list.length) {
    blockedVideosListContainer.textContent = '暂无拉黑的视频';
    return;
  }
  blockedVideosListContainer.innerHTML = list
    .map((item) => {
      const timeText = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
      const bvid = item.bvid || (item.aid ? `av${item.aid}` : item.id || '');
      return `
        <div class="decision-item" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="flex: 1; min-width: 0;">
            <div class="decision-item__title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(
              item.title || bvid || '未命名视频'
            )}</div>
            <div class="decision-item__meta">${item.author ? `UP：${escapeHtml(item.author)} ｜ ` : ''}${bvid ? `ID：${escapeHtml(bvid)}` : ''}${timeText ? ` ｜ ${escapeHtml(timeText)}` : ''}</div>
          </div>
          <button type="button" class="button button--secondary unblock-video-btn" data-video-id="${escapeHtml(
            item.id
          )}" style="padding: 3px 8px; font-size: 11px; flex-shrink: 0;">解除</button>
        </div>
      `;
    })
    .join('');

  blockedVideosListContainer.querySelectorAll('.unblock-video-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const vid = btn.getAttribute('data-video-id');
      handleUnblockVideo(vid);
    });
  });
}

function handleManualVideoBlock() {
  if (!blockVideoInput) return;
  const raw = blockVideoInput.value.trim();
  if (!raw) return;
  let bvid = '';
  let aid = null;
  const bvMatch = raw.match(/BV[0-9A-Za-z]{10}/i);
  if (bvMatch) {
    bvid = bvMatch[0];
  } else {
    const avMatch = raw.match(/av(\\d+)/i);
    if (avMatch) {
      aid = Number.parseInt(avMatch[1], 10);
    }
  }
  if (!bvid && aid == null) {
    renderStatus('未能识别出有效的 BV 号或 AV 号', true);
    return;
  }
  const id = bvid || `aid:${aid}`;
  if (currentBlockedVideos.some((item) => item && item.id === id)) {
    renderStatus('该视频已在黑名单中', true);
    return;
  }
  const entry = {
    id,
    bvid,
    aid,
    title: `手动拉黑 (${bvid || `av${aid}`})`,
    author: '',
    authorUid: null,
    timestamp: Date.now()
  };
  currentBlockedVideos = [entry, ...currentBlockedVideos];
  renderBlockedVideos(currentBlockedVideos);
  blockVideoInput.value = '';
  const area = followStorageArea || storageArea;
  if (shared && typeof shared.saveBlockedVideos === 'function') {
    shared.saveBlockedVideos(currentBlockedVideos, area).then(() => {
      renderStatus(`已拉黑视频 ${bvid || `av${aid}`}`);
    });
  }
}

function handleUnblockVideo(videoId) {
  if (!videoId) return;
  currentBlockedVideos = currentBlockedVideos.filter((item) => item && item.id !== videoId);
  renderBlockedVideos(currentBlockedVideos);
  const area = followStorageArea || storageArea;
  if (shared && typeof shared.saveBlockedVideos === 'function') {
    shared.saveBlockedVideos(currentBlockedVideos, area).then(() => {
      renderStatus('已解除该视频拉黑');
    });
  }
}

function handleClearBlockedVideos() {
  if (!currentBlockedVideos.length) {
    renderStatus('视频黑名单已为空');
    return;
  }
  currentBlockedVideos = [];
  renderBlockedVideos(currentBlockedVideos);
  const area = followStorageArea || storageArea;
  if (shared && typeof shared.saveBlockedVideos === 'function') {
    shared.saveBlockedVideos([], area).then(() => {
      renderStatus('视频黑名单已清空');
    });
  }
}

function refreshBlockedVideosFromStorage() {
  if (!shared || typeof shared.readBlockedVideos !== 'function') {
    currentBlockedVideos = [];
    renderBlockedVideos([]);
    return Promise.resolve();
  }
  const area = followStorageArea || storageArea;
  return shared.readBlockedVideos(area).then((videos) => {
    currentBlockedVideos = Array.isArray(videos) ? videos : [];
    renderBlockedVideos(currentBlockedVideos);
  });
}

function normalizeBlockedVideos(value) {
  if (shared && typeof shared.normalizeBlockedVideos === 'function') {
    return shared.normalizeBlockedVideos(value);
  }
  return Array.isArray(value) ? value : [];
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
