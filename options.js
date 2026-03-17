const el = id => document.getElementById(id);

const locales = {
  ko: { title: 'Glancit 설정', engine: '번역 엔진', apiKey: 'Gemini API Key', apiKeyPlaceholder: '키를 여기에 붙여넣으세요', model: '모델 선택', uiLang: 'UI 언어 (Locale)', customLangs: '다국어 번역 버튼', customLangsPlaceholder: '예: 한영 또는 영일한', customLangsHelp: "입력한 언어 순서대로 버튼이 생성됩니다. (한, 영, 일, 중 등)", shortcut: '번역 단축키', shortcutPlaceholder: '이곳을 클릭 후 원하는 단축키를 누르세요', shortcutHelp: '텍스트 선택 후 지정한 단축키를 누르면 번역됩니다. 지우려면 Backspace를 누르세요.', disableAutoPopup: '드래그 시 팝업 띄우지 않기 (단축키로만 실행)', exclude: '번역 제외 도메인', excludePlaceholder: 'github.com, example.net', displayMode: '번역 표시 방식', displayPopup: '팝업으로 표시 (Popup)', displayInline: '페이지 내에 번역 내용 추가 (Inline)', save: '설정 저장', test: '연결 테스트', testing: '테스트 중...', testSuccess: '성공: ', testFailed: '실패: ', saved: '설정이 저장되었습니다. 페이지를 새로고침해 주세요!' },
  en: { title: 'Glancit Settings', engine: 'Translation Engine', apiKey: 'Gemini API Key', apiKeyPlaceholder: 'Paste your key here', model: 'Select Model', uiLang: 'UI Language (Locale)', customLangs: 'Custom Translate Buttons', customLangsPlaceholder: 'e.g., 한영 or 영일한 (or ko,en)', customLangsHelp: "Enter strings(한,영,일..) or codes(ko,en) to generate buttons.", shortcut: 'Translation Shortcut', shortcutPlaceholder: 'Click here and press keys', shortcutHelp: 'Select text and press shortcut to translate. Press Backspace to clear.', disableAutoPopup: 'Disable auto-popup on drag (Shortcut only)', exclude: 'Exclude Domains', excludePlaceholder: 'github.com, example.net', displayMode: 'Display Mode', displayPopup: 'Show as Popup', displayInline: 'Insert Inline', save: 'Save Settings', test: 'Test Connection', testing: 'Testing...', testSuccess: 'Success: ', testFailed: 'Failed: ', saved: 'Settings saved. Please refresh the page!' },
  ja: { title: 'Glancit 設定', engine: '翻訳エンジン', apiKey: 'Gemini API キー', apiKeyPlaceholder: 'キーをここに貼り付けてください', model: 'モデル選択', uiLang: 'UI言語 (Locale)', customLangs: 'カスタム翻訳ボタン', customLangsPlaceholder: '例: 한영 または 영일한 (ko,en)', customLangsHelp: "入力順にボタンが生成されます (韓、英、日など)", shortcut: '翻訳ショートカット', shortcutPlaceholder: 'ここをクリックしてキーを押す', shortcutHelp: 'テキスト選択後にショートカットを押すと翻訳します。Backspaceでクリア。', disableAutoPopup: 'ドラッグ時にポップアップを表示しない (ショートカットのみ)', exclude: '翻訳除外ドメイン', excludePlaceholder: 'github.com, example.net', displayMode: '表示方法', displayPopup: 'ポップアップ表示', displayInline: '行内に挿入', save: '設定を保存', test: '接続テスト', testing: 'テスト中...', testSuccess: '成功: ', testFailed: '失敗: ', saved: '設定が保存されました。ページをリロードしてください！' }
};

function applyLocale(lang) {
  const t = locales[lang] || locales.ko;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerText = t[el.getAttribute('data-i18n')];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t[el.getAttribute('data-i18n-placeholder')];
  });
}

// UI 언어 변경 시 즉시 반영
el('lang').addEventListener('change', (e) => {
  applyLocale(e.target.value);
});

el('engine').addEventListener('change', (e) => {
  el('gemini-box').style.display = e.target.value === 'gemini' ? 'block' : 'none';
});

el('save').addEventListener('click', () => {
  chrome.storage.sync.set({
    translationEngine: el('engine').value,
    defaultTargetLang: el('lang').value,
    geminiApiKey: el('api-key').value,
    geminiModel: el('model').value,
    excludedSites: el('exclude').value,
    displayMode: el('display-mode').value,
    customLangs: el('custom-langs').value,
    shortcutKey: el('shortcut').value,
    disableAutoPopup: el('disable-auto-popup').checked
  }, () => {
    const t = locales[el('lang').value] || locales.ko;
    showStatus(t.saved, '#188038');
  });
});

el('shortcut').addEventListener('keydown', (e) => {
  e.preventDefault();

  if (e.key === 'Backspace' || e.key === 'Delete') {
    el('shortcut').value = '';
    return;
  }

  // 특수키単독 입력 무시
  const ignoredKeys = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Enter', 'Escape'];
  if (ignoredKeys.includes(e.key)) return;

  const modifiers = [];
  if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');

  const keyDisplay = e.key.toUpperCase();
  const finalShortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${keyDisplay}` : keyDisplay;

  el('shortcut').value = finalShortcut;
});

el('test').addEventListener('click', () => {
  el('test').disabled = true;
  const t = locales[el('lang').value] || locales.ko;
  showStatus(t.testing, '#1a73e8');

  chrome.runtime.sendMessage({ action: 'test-connection' }, (res) => {
    el('test').disabled = false;
    if (res && res.status === 'ok') {
      showStatus(t.testSuccess + res.result, '#188038');
    } else {
      showStatus(t.testFailed + (res?.error || '배경 서비스 연결 불가'), '#d93025');
    }
  });
});

function restore() {
  chrome.storage.sync.get({
    translationEngine: 'google',
    defaultTargetLang: 'ko',
    geminiApiKey: '',
    geminiModel: 'gemini-3-flash-preview',
    excludedSites: '',
    displayMode: 'popup',
    customLangs: 'ko,en',
    shortcutKey: '',
    disableAutoPopup: false
  }, (items) => {
    el('engine').value = items.translationEngine;
    el('lang').value = items.defaultTargetLang;
    el('api-key').value = items.geminiApiKey;
    el('model').value = items.geminiModel;
    el('exclude').value = items.excludedSites;
    el('display-mode').value = items.displayMode;
    el('custom-langs').value = items.customLangs;
    el('shortcut').value = items.shortcutKey;
    el('disable-auto-popup').checked = items.disableAutoPopup;
    if (items.translationEngine === 'gemini') el('gemini-box').style.display = 'block';

    applyLocale(items.defaultTargetLang);
  });
}

function showStatus(msg, color) {
  const s = el('status');
  s.innerText = msg;
  s.style.color = color;
}

document.addEventListener('DOMContentLoaded', restore);
