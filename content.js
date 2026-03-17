(function () {
    // [Glancit] 활성화됨 (최적화 모드)


    let lastSelectionData = null;
    let gSettings = { displayMode: 'popup', excludedSites: '', customLangs: 'ko,en', shortcutKey: '', defaultTargetLang: 'ko', disableAutoPopup: false };

    // 1. 초기화
    async function init() {
        try {
            // 초기 설정 로드
            const settings = await chrome.storage.sync.get(['displayMode', 'excludedSites', 'customLangs', 'shortcutKey', 'defaultTargetLang', 'disableAutoPopup']);
            gSettings = { ...gSettings, ...settings };

            const currentHost = window.location.hostname;
            const excluded = gSettings.excludedSites.split(',').map(s => s.trim().toLowerCase());
            if (excluded.some(site => site && currentHost.includes(site))) return;

            setupSelectionListener();
        } catch (err) { console.error('[Glancit] 초기화 에러:', err); }
    }

    // 설정 변경 감지
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            for (const [key, { newValue }] of Object.entries(changes)) {
                if (key in gSettings) gSettings[key] = newValue;
            }
        }
    });

    // 2. 드래그 인식 리스너
    function setupSelectionListener() {
        document.addEventListener('mouseup', (e) => {
            // 버블 내부 클릭 시 무시
            if (e.target.closest('.selection-bubble')) return;

            // 단축키 설정이 있고, 좌클릭이 아니면 리턴(드래그 무시)할 수도 있으나
            // 일반적인 사용성을 위해 드래그 검사는 진행합니다.

            // 이미 버블이 있다면 제거
            removeBubble();

            // 트리플 클릭의 경우 브라우저 텍스트 선택이 지연되므로 타임아웃 딜레이 연장
            const delay = e.detail >= 3 ? 200 : 10;

            // 선택 영역 확인 (비동기 지연 실행)
            setTimeout(() => {
                const selection = window.getSelection();
                const text = selection.toString().trim();

                if (text && text.length > 1 && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0).cloneRange();
                    lastSelectionData = { text, range };
                    // 드래그 시 자동 팝업 비활성화 옵션이 꺼져있을 때만 말풍선 표시
                    if (!gSettings.disableAutoPopup) {
                        showBubble(text, range);
                    }
                } else {
                    lastSelectionData = null;
                }
            }, delay);
        });

        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.selection-bubble')) {
                removeBubble();
            }
        });

        // 단축키 입력 이벤트 감지
        document.addEventListener('keydown', (e) => {
            if (!gSettings.shortcutKey) return;
            if (!lastSelectionData || !lastSelectionData.text) return;

            // 특수키 조합 조립
            const modifiers = [];
            if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
            if (e.altKey) modifiers.push('Alt');
            if (e.shiftKey) modifiers.push('Shift');

            const keyDisplay = e.key.toUpperCase();

            // 단순 Modifier 키만 누른 경우는 무시
            if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(keyDisplay)) return;

            const pressedShortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${keyDisplay}` : keyDisplay;

            if (pressedShortcut === gSettings.shortcutKey) {
                e.preventDefault();
                showBubble(lastSelectionData.text, lastSelectionData.range);
            }
        });
    }

    function showBubble(text, range) {
        removeBubble(); // 기존 버블이 있다면 먼저 제거 (단축키 호출 대비)

        const rect = range.getBoundingClientRect();
        const x = rect.left + window.scrollX;
        const y = rect.top + window.scrollY;

        const bubble = document.createElement('div');
        bubble.className = 'selection-bubble';
        bubble.style.left = `${x}px`;
        bubble.style.top = `${y - 40}px`;

        // 언어별 UI 텍스트 매핑
        const i18n = {
            ko: { copy: '복사', copied: '복사됨!', replace: '대체', failed: '실패', error: '오류', dot: '...' },
            en: { copy: 'Copy', copied: 'Copied!', replace: 'Replace', failed: 'Failed', error: 'Error', dot: '...' },
            ja: { copy: 'コピー', copied: 'コピー完了!', replace: '置換', failed: '失敗', error: 'エラー', dot: '...' }
        };
        const loc = i18n[gSettings.defaultTargetLang] || i18n.ko;
        // 동적 전달을 위해 말풍선 DOM에 loc 객체를 바인딩합니다.
        bubble.loc = loc;

        // 단일 글자 언어 매핑 (UI 언어에 따라 표시 문자가 다름)
        const langMap = {
            'ko': { ko: '한', en: 'KR', ja: '韓' },
            'en': { ko: '영', en: 'EN', ja: '英' },
            'ja': { ko: '일', en: 'JP', ja: '日' },
            'zh-CN': { ko: '중', en: 'CN', ja: '中' },
            'zh-TW': { ko: '대', en: 'TW', ja: '台' },
            'es': { ko: '스', en: 'ES', ja: '西' },
            'fr': { ko: '프', en: 'FR', ja: '仏' },
            'de': { ko: '독', en: 'DE', ja: '独' }
        };

        let customLangsInput = gSettings.customLangs ? gSettings.customLangs.trim() : '';
        if (!customLangsInput) customLangsInput = '한영'; // 비어있을 경우 한영을 기본값으로 Fallback
        let customLangs = [];
        const hangulMap = { '한': 'ko', '영': 'en', '일': 'ja', '중': 'zh-CN', '대': 'zh-TW', '스': 'es', '프': 'fr', '독': 'de' };

        if (/[한영일중대스프독]/.test(customLangsInput)) {
            for (let char of customLangsInput) {
                if (hangulMap[char]) customLangs.push(hangulMap[char]);
            }
        } else {
            customLangs = customLangsInput.split(',').map(s => s.trim()).filter(Boolean);
        }

        const uiType = gSettings.defaultTargetLang;

        customLangs.forEach((langCode, index) => {
            if (!langCode) return;
            const btn = document.createElement('div');
            // 첫 번째 버튼에는 구분을 위한 border를 주지 않음
            btn.className = index === 0 ? 'glancit-btn' : 'glancit-btn glancit-btn-border';
            btn.innerText = (langMap[langCode] && langMap[langCode][uiType]) ? langMap[langCode][uiType] : langCode.toUpperCase();
            btn.onclick = (e) => {
                e.stopPropagation();
                processTranslation(range, text, bubble, langCode);
            };
            bubble.appendChild(btn);
        });

        (document.body || document.documentElement).appendChild(bubble);
    }

    async function processTranslation(range, text, bubbleEl, targetLang) {
        if (bubbleEl) {
            bubbleEl.replaceChildren(); // 초기화
            const loading = document.createElement('div');
            loading.className = 'loading-padding';
            loading.textContent = bubbleEl.loc ? bubbleEl.loc.dot : '...';
            bubbleEl.appendChild(loading);
        }

        chrome.runtime.sendMessage({ action: 'translate', text: text, targetLang: targetLang }, (response) => {
            if (response && response.translation) {
                if (gSettings.displayMode === 'popup') {
                    showResultInBubble(bubbleEl, response.translation, response.engineInfo);
                } else {
                    insertTranslation(range, response.translation, response.engineInfo);
                    removeBubble();
                }
            } else if (bubbleEl) {
                bubbleEl.replaceChildren();
                const errorDiv = document.createElement('div');
                errorDiv.className = 'loading-padding';
                errorDiv.textContent = bubbleEl.loc ? bubbleEl.loc.error : '오류';
                bubbleEl.appendChild(errorDiv);
                setTimeout(removeBubble, 2000);
            }
        });
    }

    function showResultInBubble(bubbleEl, translation, engineInfo) {
        if (!bubbleEl) return;
        bubbleEl.className = 'selection-bubble expanded';
        bubbleEl.replaceChildren(); // innerHTML = '' 대신 사용

        const content = document.createElement('div');
        content.style.fontSize = '14px';
        content.style.lineHeight = '1.5';
        content.textContent = translation;

        const footer = document.createElement('div');
        footer.className = 'bubble-footer';

        const engineText = document.createElement('span');
        engineText.className = 'engine-label';
        engineText.textContent = `[${engineInfo}]`;

        const loc = bubbleEl.loc || { copy: '복사', copied: '복사됨!', replace: '대체', failed: '실패' };

        const copyBtn = document.createElement('span');
        copyBtn.className = 'copy-btn';
        copyBtn.innerText = loc.copy;
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(translation).then(() => {
                const originalText = copyBtn.innerText;
                copyBtn.innerText = loc.copied;
                setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
            });
        };

        const replaceBtn = document.createElement('span');
        replaceBtn.className = 'replace-btn';
        replaceBtn.innerText = loc.replace;
        replaceBtn.onclick = (e) => {
            e.stopPropagation();
            if (lastSelectionData && lastSelectionData.range) {
                try {
                    const range = lastSelectionData.range;
                    range.deleteContents();
                    range.insertNode(document.createTextNode(translation));
                    window.getSelection().removeAllRanges();
                    removeBubble();
                } catch (err) {
                    console.error('[Glancit] 대체 실패:', err);
                    replaceBtn.innerText = loc.failed;
                }
            }
        };

        footer.append(engineText, copyBtn, replaceBtn);
        bubbleEl.append(content, footer);
    }

    function insertTranslation(range, translation, engineInfo) {
        try {
            const insRange = range.cloneRange();
            insRange.collapse(false);

            const span = document.createElement('span');
            span.className = 'translated-text';

            const tNode = document.createTextNode(` (${translation}) `);
            const mSpan = document.createElement('span');
            mSpan.className = 'model-info';
            mSpan.textContent = `[${engineInfo}]`;

            span.append(tNode, mSpan);
            insRange.insertNode(span);
            window.getSelection().removeAllRanges();
        } catch (err) { console.error('[Glancit] 결과 삽입 실패:', err); }
    }

    function removeBubble() {
        const ex = document.querySelector('.selection-bubble');
        if (ex) ex.remove();
    }

    init();
})();
