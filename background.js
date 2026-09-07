// [Glancit] 배경 서비스 워커 로딩됨

// --- 전역 설정 캐시 및 초기화 ---
let gSettings = {
  translationEngine: "google",
  defaultTargetLang: "ko",
  geminiApiKey: "",
  geminiModel: "gemini-flash-lite-latest",
  displayMode: "popup",
  customLangs: "ko,en",
  shortcutKey: "",
  disableAutoPopup: false,
};

// --- Gemini 가용 모델 리스트 ---
const availableModels = [];

async function loadAvailableModels() {
  if (availableModels.length > 0) return availableModels;

  try {
    const apiKey = gSettings.geminiApiKey;
    if (!apiKey) {
      console.warn("[Glancit] Gemini API 키가 설정되지 않았습니다. 모델 리스트를 가져올 수 없습니다.");
      return [];
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`모델 리스트 조회 실패 (${response.status})`);
    }

    const data = await response.json();
    if (data.models) {
      availableModels.push(...data.models);
      console.log(`[Glancit] 가용 모델 ${availableModels.length}개 로드 완료`);
    }
  } catch (error) {
    console.error("[Glancit] 모델 리스트 로드 실패:", error.message);
  }

  return availableModels;
}

// 가용 모델 중 generateContent 를 지원하는 모델만 필터링
function getGenerativeModels() {
  return availableModels.filter((m) => m.supportedGenerationMethods?.includes("generateContent"));
}

// --- Rate Limiter ---
const rateLimiter = {
  requests: [],
  maxRequests: 50, // 분당 최대 50 회 요청 (Google Translate API 권장)
  windowMs: 60000, // 1 분 윈도우
  lastReset: Date.now(),

  reset() {
    this.requests = [];
    this.lastReset = Date.now();
  },

  canRequest() {
    const now = Date.now();
    if (now - this.lastReset > this.windowMs) {
      this.reset();
      return true;
    }
    return this.requests.length < this.maxRequests;
  },

  acquire() {
    if (!this.canRequest()) {
      const waitMs = this.windowMs - (Date.now() - this.lastReset);
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitMs / 1000)}s`);
    }
    this.requests.push(Date.now());
  },
};

// --- 캐싱 ---
const translationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 분 유효기간

// 초기 설정 로드
async function loadSettings() {
  const settings = await chrome.storage.sync.get(Object.keys(gSettings));
  gSettings = { ...gSettings, ...settings };
  // console.log('[Glancit] 설정 로드 완료:', gSettings.translationEngine);
}
loadSettings();

// 설정 변경 감지 및 캐시 업데이트
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in gSettings) {
        gSettings[key] = newValue;
      }
    }
    // console.log('[Glancit] 설정 변경 반영됨');
  }
});
// ------------------------------

// 1. 메시지 전송 헬퍼 (컨텍스트 유실 시 자동 재주입 시도)
async function sendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (err.message.includes("Could not establish connection")) {
      console.log("[번역기] 컨텍스트 유실 감지 - 스크립트 재주입 시도");
      await chrome.scripting
        .executeScript({
          target: { tabId: tabId },
          files: ["content.js"],
        })
        .catch((e) => console.error("스크립트 주입 실패:", e));

      await chrome.scripting
        .insertCSS({
          target: { tabId: tabId },
          files: ["content.css"],
        })
        .catch((e) => console.error("CSS 주입 실패:", e));

      return await chrome.tabs.sendMessage(tabId, message);
    }
    throw err;
  }
}

// 2. 번역 요청 처리 (Content Script -> Background)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    handleTranslation(request.text, request.targetLang)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ error: error.message }));
    return true; // 비동기 응답 처리
  }

  // 연결 테스트용
  if (request.action === "test-connection") {
    handleTranslation("Hello", "ko")
      .then((res) => sendResponse({ status: "ok", result: res.translation }))
      .catch((err) => sendResponse({ status: "fail", error: err.message }));
    return true;
  }
});

async function handleTranslation(text, targetLang) {
  // 캐시된 설정 사용 (storage.sync.get 생략)
  const target = targetLang || gSettings.defaultTargetLang;
  const engineInfo = gSettings.translationEngine === "gemini" ? gSettings.geminiModel : "Google";

  // Rate Limiter 적용
  rateLimiter.acquire();

  let result;
  if (gSettings.translationEngine === "gemini") {
    result = await translateWithGemini(text, gSettings.geminiApiKey, target, gSettings.geminiModel);
  } else {
    result = await translateWithGoogle(text, target);
  }

  return { ...result, engineInfo };
}

async function translateWithGoogle(text, targetLang) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || "5";
        const waitMs = retryAfter === "0" ? 1000 : parseInt(retryAfter) * 1000;
        throw new Error(`Rate limit exceeded. Waiting ${waitMs / 1000}s...`);
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (data && data[0]) {
        const fullTranslation = data[0]
          .map((item) => item[0])
          .filter((item) => item !== null)
          .join("");
        return { translation: fullTranslation, targetLang };
      }
      throw new Error("올바르지 않은 구글 번역 응답");
    } catch (error) {
      lastError = error;
      if (error.message.includes("Rate limit")) {
        const waitMs = attempt === maxRetries ? 5000 : 1000 * attempt;
        console.log(`[Glancit] Rate limit - 재시도 (${attempt}/${maxRetries}): ${waitMs}ms 대기`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error("번역 실패");
}

async function translateWithGemini(text, apiKey, targetLang, modelName) {
  if (!apiKey) throw new Error("Gemini API 키가 설정되지 않았습니다.");

  const langMap = { ko: "Korean", en: "English", ja: "Japanese", "zh-CN": "Chinese (Simplified)", es: "Spanish" };
  const targetName = langMap[targetLang] || targetLang;

  const model = modelName || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Please translate the ENTIRE text below into ${targetName} accurately, without omitting any parts. Output ONLY the translated text and nothing else:\n\n"${text}"`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini 오류 (${response.status}): ${data.error?.message || "알 수 없는 오류"}`);

  if (data.candidates && data.candidates[0]?.content?.parts) {
    return {
      translation: data.candidates[0].content.parts
        .map((p) => p.text)
        .join("")
        .trim(),
      targetLang,
    };
  } else {
    throw new Error("Gemini 응답 형식이 올바르지 않습니다.");
  }
}
