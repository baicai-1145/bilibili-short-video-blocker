const form = document.getElementById('threshold-form');
const thresholdInput = document.getElementById('threshold-input');
const rulesContainer = document.getElementById('clip-rules');
const addRuleButton = document.getElementById('add-rule');
const ruleTemplate = document.getElementById('clip-rule-template');
const status = document.getElementById('status-text');

const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || null;
const storageInfo = shared ? shared.resolveStorageArea() : { area: null };
const storageArea = storageInfo.area;

const DEFAULT_THRESHOLD_SECONDS = shared
  ? shared.DEFAULT_THRESHOLD_SECONDS
  : 60;

const FALLBACK_CLIP_SETTINGS = {
  rules: []
};

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
}

function loadSettings() {
  if (!shared) {
    thresholdInput.value = String(DEFAULT_THRESHOLD_SECONDS);
    renderRuleEditors(getFallbackClipSettings().rules);
    renderStatus('共享配置未加载，已使用默认值', true);
    return;
  }
  Promise.all([
    shared.readThreshold(storageArea),
    shared.readClipSettings(storageArea)
  ])
    .then(([rawThreshold, rawClipSettings]) => {
      const value = shared.normalizeThreshold(rawThreshold);
      thresholdInput.value = String(value);
      const normalizedClip =
        typeof shared.normalizeClipSettings === 'function'
          ? shared.normalizeClipSettings(rawClipSettings)
          : rawClipSettings;
      renderRuleEditors(normalizedClip?.rules);
    })
    .catch(() => {
      thresholdInput.value = String(DEFAULT_THRESHOLD_SECONDS);
      renderRuleEditors(getFallbackClipSettings().rules);
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
  Promise.all([
    shared.saveThreshold(thresholdValue, storageArea),
    shared.saveClipSettings(clipPayload, storageArea)
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
    ? rule.keywords.join('\\n')
    : '';
  authorsInput.value = Array.isArray(rule.allowedAuthors)
    ? rule.allowedAuthors.join('\\n')
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

function refreshRuleIndexes() {
  if (!rulesContainer) {
    return;
  }
  const labels = rulesContainer.querySelectorAll('[data-rule-index]');
  labels.forEach((node, index) => {
    node.textContent = String(index + 1);
  });
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
