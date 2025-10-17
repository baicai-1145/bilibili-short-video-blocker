const form = document.getElementById('threshold-form');
const input = document.getElementById('threshold-input');
const status = document.getElementById('status-text');
const shared =
  (typeof window !== 'undefined' && window.BiliShortVideoBlockerShared) || null;
const storageInfo = shared ? shared.resolveStorageArea() : { area: null };
const storageArea = storageInfo.area;

const DEFAULT_THRESHOLD_SECONDS = shared
  ? shared.DEFAULT_THRESHOLD_SECONDS
  : 60;

init();

function init() {
  if (!form || !input) {
    return;
  }
  loadThreshold();
  form.addEventListener('submit', handleSubmit);
}

function loadThreshold() {
  if (!shared) {
    input.value = String(DEFAULT_THRESHOLD_SECONDS);
    renderStatus('共享配置未加载，已使用默认阈值', true);
    return;
  }
  shared
    .readThreshold(storageArea)
    .then((raw) => {
      const value = shared.normalizeThreshold(raw);
      input.value = String(value);
    })
    .catch(() => {
      input.value = String(DEFAULT_THRESHOLD_SECONDS);
      renderStatus('读取存储失败，已使用默认值', true);
    });
}

function handleSubmit(event) {
  event.preventDefault();
  if (!shared) {
    renderStatus('共享配置未加载，无法保存', true);
    return;
  }
  const value = shared.normalizeThreshold(input.value);
  shared
    .saveThreshold(value, storageArea)
    .then(() => {
      renderStatus('阈值已保存');
    })
    .catch(() => {
      renderStatus('保存失败，请重试', true);
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
