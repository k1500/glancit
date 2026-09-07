const el = (id) => document.getElementById(id);

const locales = {
  ko: {
    title: "Glancit 설정",
    engine: "번역 엔진",
    apiKey: "Gemini API Key",
    apiKeyPlaceholder: "키를 여기에 붙여넣으세요",
    model: "모델 선택",
    uiLang: "UI 언어 (Locale)",
    customLangs: "다국어 번역 버튼",
    customLangsPlaceholder: "예: 한영 또는 영일한",
    customLangsHelp: "입력한 언어 순서대로 버튼이 생성됩니다.",
    shortcut: "번역 단축키",
    shortcutPlaceholder: "이곳을 클릭 후 원하는 단축키를 누르세요",
    shortcutHelp: "텍스트 선택 후 지정한 단축키를 누르면 번역됩니다. 지우려면 Backspace 를 누르세요.",
    disableAutoPopup: "드래그 시 팝업 띄우지 않기 (단축키로만 실행)",
    exclude: "번역 제외 도메인",
    excludePlaceholder: "github.com, example.net",
    displayMode: "번역 표시 방식",
    displayPopup: "팝업으로 표시 (Popup)",
    displayInline: "페이지 내에 번역 내용 추가 (Inline)",
    save: "설정 저장",
    test: "연결 테스트",
    testing: "테스트 중...",
    testSuccess: "성공: ",
    testFailed: "실패: ",
    saved: "설정이 저장되었습니다. 페이지를 새로고침해 주세요!",
  },
  en: {
    title: "Glancit Settings",
    engine: "Translation Engine",
    apiKey: "Gemini API Key",
    apiKeyPlaceholder: "Paste your key here",
    model: "Select Model",
    uiLang: "UI Language (Locale)",
    customLangs: "Custom Translate Buttons",
    customLangsPlaceholder: "e.g., 한영 or 영일한 (or ko,en)",
    customLangsHelp: "Buttons are generated in the order you enter languages.",
    shortcut: "Translation Shortcut",
    shortcutPlaceholder: "Click here and press keys",
    shortcutHelp: "Select text and press shortcut to translate. Press Backspace to clear.",
    disableAutoPopup: "Disable auto-popup on drag (Shortcut only)",
    exclude: "Exclude Domains",
    excludePlaceholder: "github.com, example.net",
    displayMode: "Display Mode",
    displayPopup: "Show as Popup",
    displayInline: "Insert Inline",
    save: "Save Settings",
    test: "Test Connection",
    testing: "Testing...",
    testSuccess: "Success: ",
    testFailed: "Failed: ",
    saved: "Settings saved. Please refresh the page!",
  },
  ja: {
    title: "Glancit 設定",
    engine: "翻訳エンジン",
    apiKey: "Gemini API キー",
    apiKeyPlaceholder: "キーをここに貼り付けてください",
    model: "モデル選択",
    uiLang: "UI 言語 (Locale)",
    customLangs: "カスタム翻訳ボタン",
    customLangsPlaceholder: "例：한영 または 영일한 (ko,en)",
    customLangsHelp: "入力順にボタンが生成されます (韓、英、日など)",
    shortcut: "翻訳ショートカット",
    shortcutPlaceholder: "ここをクリックしてキーを押す",
    shortcutHelp: "テキスト選択後にショートカットを押すと翻訳します。Backspace でクリア。",
    disableAutoPopup: "ドラッグ時にポップアップを表示しない (ショートカットのみ)",
    exclude: "翻訳除外ドメイン",
    excludePlaceholder: "github.com, example.net",
    displayMode: "表示方法",
    displayPopup: "ポップアップ表示",
    displayInline: "行内に挿入",
    save: "設定を保存",
    test: "接続テスト",
    testing: "テスト中...",
    testSuccess: "成功：",
    testFailed: "失敗：",
    saved: "設定が保存されました。ページをリロードしてください！",
  },
};

function applyLocale(lang) {
  const t = locales[lang] || locales.ko;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.innerText = t[el.getAttribute("data-i18n")];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t[el.getAttribute("data-i18n-placeholder")];
  });
}

// UI 언어 변경 시 즉시 반영
el("lang").addEventListener("change", (e) => {
  applyLocale(e.target.value);
});

el("engine").addEventListener("change", async (e) => {
  el("gemini-box").style.display = e.target.value === "gemini" ? "block" : "none";
  if (e.target.value === "gemini") {
    await loadModels(false);
  }
});

let apiKeyDebounceTimer = null;
el("api-key").addEventListener("input", (e) => {
  clearTimeout(apiKeyDebounceTimer);
  apiKeyDebounceTimer = setTimeout(async () => {
    await loadModels(true);
  }, 400);
});

el("refresh-models").addEventListener("click", async () => {
  await loadModels(true);
});

// 모델 캐시 (새로고침 전까지 기존 목록 유지)
let cachedModels = [];

async function loadModels(forceRefresh = false, preferredModel = null) {
  const apiKey = el("api-key").value.trim();
  const modelSelect = el("model");

  if (!apiKey) {
    modelSelect.innerHTML = '<option value="" disabled selected>API 키를 입력하세요</option>';
    return;
  }

  // 복원할 대상 모델 결정: 인자값 -> 현재 선택된 값 -> storage에 저장된 값
  let targetModel = preferredModel || modelSelect.value;
  if (!targetModel) {
    const saved = await chrome.storage.sync.get(["geminiModel"]);
    targetModel = saved.geminiModel;
  }

  try {
    let filteredModels = [];

    // 캐시가 있고 강제 새로고침이 아닌 경우 캐시 사용
    if (!forceRefresh && cachedModels.length > 0) {
      filteredModels = cachedModels;
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

      if (!response.ok) {
        modelSelect.innerHTML = `<option value="" disabled selected>API 키가 올바르지 않습니다</option>`;
        return;
      }

      const data = await response.json();
      const generativeModels = (data.models || []).filter((m) => m.supportedGenerationMethods?.includes("generateContent"));

      // 원치 않는 모델 필터링 (Nano Banana, Lyria, Deep Research, Antigravity, TTS, Image, Veo, Omni 등)
      const excludedKeywords = ["banana", "image", "lyria", "research", "antigravity", "tts", "omni", "veo", "imagen"];

      filteredModels = generativeModels.filter((m) => {
        const name = (m.name || "").toLowerCase();
        const disp = (m.displayName || "").toLowerCase();
        return !excludedKeywords.some((ex) => name.includes(ex) || disp.includes(ex));
      });

      cachedModels = filteredModels;
    }

    if (filteredModels.length === 0) {
      modelSelect.innerHTML = '<option value="" disabled selected>지원하는 모델이 없습니다</option>';
      return;
    }

    modelSelect.innerHTML = "";
    filteredModels.forEach((model) => {
      const modelId = model.name.replace(/^models\//, "");
      const option = document.createElement("option");
      option.value = modelId;
      option.textContent = `${model.displayName || modelId} (${model.version || "latest"})`;
      option.dataset.description = model.description || "";
      option.dataset.inputLimit = model.inputTokenLimit || 0;
      option.dataset.outputLimit = model.outputTokenLimit || 0;
      modelSelect.appendChild(option);
    });

    // 타겟 모델 복원 (정확한 ID 매칭 -> displayName 매칭 -> models/ 접두어 제거 매칭)
    if (targetModel) {
      const cleanTarget = targetModel.replace(/^models\//, "");
      const exists = Array.from(modelSelect.options).some((opt) => opt.value === cleanTarget);
      if (exists) {
        modelSelect.value = cleanTarget;
      } else {
        const matched = filteredModels.find((m) => m.name.replace(/^models\//, "") === cleanTarget || m.displayName === targetModel || m.displayName === cleanTarget);
        if (matched) {
          modelSelect.value = matched.name.replace(/^models\//, "");
        }
      }
    }
  } catch (error) {
    modelSelect.innerHTML = `<option value="" disabled selected>모델 로드 실패: ${error.message}</option>`;
  }
}

el("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      translationEngine: el("engine").value,
      defaultTargetLang: el("lang").value,
      geminiApiKey: el("api-key").value,
      geminiModel: el("model").value,
      excludedSites: el("exclude").value,
      displayMode: el("display-mode").value,
      customLangs: el("custom-langs").value,
      shortcutKey: el("shortcut").value,
      disableAutoPopup: el("disable-auto-popup").checked,
    },
    () => {
      const t = locales[el("lang").value] || locales.ko;
      showStatus(t.saved, "#188038");
    },
  );
});

el("shortcut").addEventListener("keydown", (e) => {
  e.preventDefault();

  if (e.key === "Backspace" || e.key === "Delete") {
    el("shortcut").value = "";
    return;
  }

  // 특수키 입력 무시
  const ignoredKeys = ["Control", "Shift", "Alt", "Meta", "CapsLock", "Tab", "Enter", "Escape"];
  if (ignoredKeys.includes(e.key)) return;

  const modifiers = [];
  if (e.ctrlKey || e.metaKey) modifiers.push("Ctrl");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");

  const keyDisplay = e.key.toUpperCase();
  const finalShortcut = modifiers.length > 0 ? `${modifiers.join("+")}+${keyDisplay}` : keyDisplay;

  el("shortcut").value = finalShortcut;
});

el("test").addEventListener("click", () => {
  el("test").disabled = true;
  const t = locales[el("lang").value] || locales.ko;
  showStatus(t.testing, "#1a73e8");

  chrome.runtime.sendMessage({ action: "test-connection" }, (res) => {
    el("test").disabled = false;
    if (res && res.status === "ok") {
      showStatus(t.testSuccess + res.result, "#188038");
    } else {
      showStatus(t.testFailed + (res?.error || "배경 서비스 연결 불가"), "#d93025");
    }
  });
});

function restore() {
  chrome.storage.sync.get(
    {
      translationEngine: "google",
      defaultTargetLang: "ko",
      geminiApiKey: "",
      geminiModel: "gemini-2.5-flash",
      excludedSites: "",
      displayMode: "popup",
      customLangs: "ko,en",
      shortcutKey: "",
      disableAutoPopup: false,
    },
    async (items) => {
      el("engine").value = items.translationEngine;
      el("lang").value = items.defaultTargetLang;
      el("api-key").value = items.geminiApiKey;
      el("exclude").value = items.excludedSites;
      el("display-mode").value = items.displayMode;
      el("custom-langs").value = items.customLangs;
      el("shortcut").value = items.shortcutKey;
      el("disable-auto-popup").checked = items.disableAutoPopup;
      if (items.translationEngine === "gemini") el("gemini-box").style.display = "block";

      applyLocale(items.defaultTargetLang);

      // 저장된 모델이 있으면 기본 option으로 먼저 넣어둔 후 목록 로드
      if (items.geminiModel) {
        el("model").innerHTML = `<option value="${items.geminiModel}">${items.geminiModel}</option>`;
        el("model").value = items.geminiModel;
      }

      if (items.geminiApiKey) {
        await loadModels(false, items.geminiModel);
      }
    },
  );
}

function showStatus(msg, color) {
  const s = el("status");
  s.innerText = msg;
  s.style.color = color;
}

document.addEventListener("DOMContentLoaded", restore);
