// app.js
(() => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('card-search');
    const searchBtn = document.getElementById('search-btn');
    const searchResults = document.getElementById('search-results');
    const deckResults = document.getElementById('deck-results');
    const canvas = document.getElementById('combo-canvas');
    const clearBtn = document.getElementById('clear-btn');
    const customCardBtn = document.getElementById('custom-card-btn');
    const comboTitle = document.getElementById('combo-title');
    
    // Multi-Deck Elements
    const deckSelector = document.getElementById('deck-selector');
    const newDeckBtn = document.getElementById('new-deck-btn');
    const renameDeckBtn = document.getElementById('rename-deck-btn');
    const deleteDeckBtn = document.getElementById('delete-deck-btn');

    // Import Elements
    const importDeckBtn = document.getElementById('import-deck-btn');
    const importModal = document.getElementById('import-modal');
    const importTextarea = document.getElementById('import-textarea');
    const importCancelBtn = document.getElementById('import-cancel-btn');
    const importRunBtn = document.getElementById('import-run-btn');

    const imageCropBtn = document.getElementById('image-crop-btn');
    const imageCropModal = document.getElementById('image-crop-modal');
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas ? cropCanvas.getContext('2d') : null;
    const cropBox = document.getElementById('crop-box');
    const cropPreview = document.getElementById('crop-preview');
    const cropPreviewContainer = document.getElementById('crop-preview-container');
    const cropCardName = document.getElementById('crop-card-name');
    const cropAddBtn = document.getElementById('crop-add-btn');
    const cropCancelBtn = document.getElementById('crop-cancel-btn');
    const imageUpload = document.getElementById('image-upload');

    const cropModeRadios = document.querySelectorAll('input[name="crop-mode"]');
    const gridControls = document.getElementById('grid-controls');
    const gridColsInput = document.getElementById('grid-cols');
    const gridRowsInput = document.getElementById('grid-rows');

    let currentCropMode = 'single';
    let currentCropImg = null;
    let isDrawingCrop = false;
    let cropStartX = 0, cropStartY = 0;
    let lastCropDataUrl = null;
    let finalCropData = null; // {x, y, w, h}
    const CARD_W_RATIO = 59, CARD_H_RATIO = 86;

    // --- State ---
    let cardDatabase = []; // Cached API payload
    let routeNodes = [];   // Cards & Actions on canvas
    
    let decks = { 'deck_1': { name: 'デッキ 1', cards: [] } };
    let currentDeckId = 'deck_1';

    // Load Decks from LocalStorage
    const savedDecks = localStorage.getItem('ygo_multiple_decks');
    if (savedDecks) {
        try { decks = JSON.parse(savedDecks); } catch(e){}
    }
    const savedCurrent = localStorage.getItem('ygo_current_deck_id');
    if (savedCurrent && decks[savedCurrent]) currentDeckId = savedCurrent;
    else currentDeckId = Object.keys(decks)[0];
    
    function saveDecks() {
        localStorage.setItem('ygo_multiple_decks', JSON.stringify(decks));
        localStorage.setItem('ygo_current_deck_id', currentDeckId);
    }

    // Load Title
    comboTitle.value = localStorage.getItem('ygo_combo_title') || '';
    comboTitle.addEventListener('input', (e) => localStorage.setItem('ygo_combo_title', e.target.value));

    // --- Action Map ---
    const actionMap = {
        'eff1': { text: '① 効果①' },
        'eff2': { text: '② 効果②' },
        'eff3': { text: '③ 効果③' },
        'effect': { icon: 'fa-wand-magic-sparkles', text: '効果発動' },
        'ns': { icon: 'fa-user', text: '通常召喚' },
        'ss': { icon: 'fa-rotate', text: '特殊召喚' },
        'search': { icon: 'fa-magnifying-glass', text: 'サーチ' },
        'discard': { icon: 'fa-trash-arrow-up', text: '手札から捨てる' },
        'gy': { icon: 'fa-skull', text: '墓地へ送る' },
        'banish': { icon: 'fa-ban', text: '除外する' },
        'link': { icon: 'fa-link', text: 'リンク召喚' },
        'xyz': { icon: 'fa-crosshairs', text: 'X召喚' },
        'synchro': { icon: 'fa-bolt', text: 'S召喚' },
        'fusion': { icon: 'fa-hurricane', text: '融合召喚' }
    };

    // --- Tab Interactivity ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if(activeBtn) activeBtn.classList.add('active');
        const activeTab = document.getElementById(`tab-${tabId}`);
        if(activeTab) activeTab.classList.add('active');
        if(tabId === 'cards') searchInput.focus();
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // --- Database Handling (YGOPRODeck) ---
    async function loadDatabase() {
        const saved = localStorage.getItem('ygo_db_ja');
        const timestamp = localStorage.getItem('ygo_db_time');
        const now = Date.now();
        
        if (saved && timestamp && (now - parseInt(timestamp) < 3 * 24 * 60 * 60 * 1000)) {
            cardDatabase = JSON.parse(saved);
            return;
        }

        searchResults.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding: 20px; grid-column:1/-1;">公式データ相当のリストをダウンロード中...<br>（初回のみ数秒かかります）</p>';
        
        try {
            const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?language=ja');
            if(!res.ok) throw new Error('API fetch failed');
            const data = await res.json();
            
            cardDatabase = data.data.map(c => ({
                id: c.id.toString(),
                name: c.name,
                md_limit: c.banlist_info && c.banlist_info.ban_masterduel ? c.banlist_info.ban_masterduel : null
            }));
            
            localStorage.setItem('ygo_db_ja', JSON.stringify(cardDatabase));
            localStorage.setItem('ygo_db_time', now.toString());
        } catch(e) {
            console.error(e);
            searchResults.innerHTML = `<p style="color:var(--danger); text-align:center; grid-column:1/-1;">エラー発生：${e.message}</p>`;
        }
    }

    // --- Toast Notifications ---
    function showToast(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHTML(msg)}`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    }

    // --- Multi-Deck Logic ---
    function renderDeckOptions() {
        deckSelector.innerHTML = '';
        for(const id in decks) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = decks[id].name;
            if(id === currentDeckId) opt.selected = true;
            deckSelector.appendChild(opt);
        }
    }
    
    deckSelector.addEventListener('change', (e) => {
        currentDeckId = e.target.value;
        saveDecks();
        renderDeck();
    });

    newDeckBtn.addEventListener('click', () => {
        const name = prompt("作成するデッキの名前を入力してください:");
        if(name && name.trim()){
            const id = 'deck_' + Date.now();
            decks[id] = { name: name.trim(), cards: [] };
            currentDeckId = id;
            saveDecks();
            renderDeckOptions();
            renderDeck();
            showToast("新規デッキを作成！");
        }
    });

    renameDeckBtn.addEventListener('click', () => {
        const name = prompt("デッキの新しい名前:", decks[currentDeckId].name);
        if(name && name.trim()){
            decks[currentDeckId].name = name.trim();
            saveDecks();
            renderDeckOptions();
        }
    });

    deleteDeckBtn.addEventListener('click', () => {
        if(Object.keys(decks).length <= 1) {
            alert("エラー: 最後のデッキは削除できません！\n(代わりに「新規デッキ追加」を使ってください)");
            return;
        }
        if(confirm(`現在選択中の「${decks[currentDeckId].name}」を削除しますか？\n(※この操作は元に戻せません)`)) {
            delete decks[currentDeckId];
            currentDeckId = Object.keys(decks)[0];
            saveDecks();
            renderDeckOptions();
            renderDeck();
            showToast("デッキを削除しました");
        }
    });

    function renderDeck() {
        const deckResults = document.getElementById('deck-results');
        deckResults.innerHTML = '';
        const currentCards = decks[currentDeckId].cards;
        
        if(currentCards.length === 0) {
            deckResults.innerHTML = `
                <p style="color:var(--text-muted); font-size:0.85rem; padding: 10px; grid-column: 1 / -1; line-height: 1.5;">
                    ※「追加検索」タブからサーチするか、上部の「インポート」ボタンでデッキレシピから一括追加してください。<br><br>
                    追加されたカードを1回クリックすると、右のルートに素早く配置されます。<br>
                    (不要なカードは右クリックでデッキから除外)
                </p>
            `;
            return;
        }

        currentCards.forEach((c, index) => {
            const div = document.createElement('div');
            div.className = 'card-item';
            div.title = `${c.name}\n（※右クリックでデッキから外す）`;
            
            if (c.isCustom) {
                if (c.isImageCard && c.imageData) {
                    const img = document.createElement('img');
                    img.src = c.imageData;
                    img.alt = c.name;
                    div.appendChild(img);
                } else {
                    div.innerHTML = `<div class="custom-card">${escapeHTML(c.name)}</div>`;
                }
            } else {
                const img = document.createElement('img');
                img.src = `https://images.ygoprodeck.com/images/cards_small/${c.id}.jpg`;
                img.alt = c.name;
                img.loading = "lazy";
                div.appendChild(img);
                
                if (c.md_limit) {
                    const badge = document.createElement('div');
                    badge.className = 'banlist-badge';
                    if (c.md_limit === 'Forbidden') { badge.textContent = '禁止'; }
                    else if (c.md_limit === 'Limited') { badge.textContent = '制限'; badge.classList.add('badge-limited'); }
                    else if (c.md_limit === 'Semi-Limited') { badge.textContent = '準制限'; badge.classList.add('badge-semi'); }
                    div.appendChild(badge);
                }
            }
            
            div.addEventListener('click', (e) => {
                e.preventDefault();
                addNode({ type: 'card', id: c.id, name: c.name, isCustom: c.isCustom, isImageCard: c.isImageCard, imageData: c.imageData });
            });
            
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                decks[currentDeckId].cards.splice(index, 1);
                saveDecks();
                renderDeck();
            });
            
            deckResults.appendChild(div);
        });
    }

    function addCardToDeck(card, silent = false) {
        const arr = decks[currentDeckId].cards;
        if(!arr.find(c => c.id === card.id || c.name === card.name)) {
            arr.push(card);
            if (!silent) {
                saveDecks();
                renderDeck();
                showToast(`${card.name} を追加！`);
            }
        } else {
            if (!silent) showToast("※既にデッキに存在します");
        }
    }

    customCardBtn.addEventListener('click', () => {
        const name = prompt("追加したいカード名を入力してください:\n（例: カタカナ名称、最新カード、トークンなど）");
        if (name && name.trim() !== '') {
            const customId = 'custom_' + Date.now();
            addCardToDeck({ id: customId, name: name.trim(), isCustom: true });
        }
    });

    // --- Image Crop Logic ---
    if (imageCropBtn) {
        cropModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentCropMode = e.target.value;
                gridControls.style.display = (currentCropMode === 'grid') ? 'flex' : 'none';
                cropAddBtn.innerHTML = (currentCropMode === 'grid') ? '<i class="fa-solid fa-wand-magic-sparkles"></i> 一括カットして追加' : '<i class="fa-solid fa-plus"></i> デッキに追加';
                if (currentCropImg) { cropBox.style.display = 'none'; cropPreviewContainer.style.display = 'none'; cropAddBtn.disabled = true; }
            });
        });

        function drawGridOverlay() {
            if(currentCropMode !== 'grid') { cropBox.innerHTML = ''; return; }
            cropBox.innerHTML = '';
            const cols = parseInt(gridColsInput.value) || 10;
            const rows = parseInt(gridRowsInput.value) || 4;
            for(let r = 1; r < rows; r++) {
                let line = document.createElement('div');
                line.style.cssText = `position:absolute; top:${r / rows * 100}%; left:0; right:0; border-top:1px dashed rgba(241,196,15,0.7);`;
                cropBox.appendChild(line);
            }
            for(let c = 1; c < cols; c++) {
                let line = document.createElement('div');
                line.style.cssText = `position:absolute; left:${c / cols * 100}%; top:0; bottom:0; border-left:1px dashed rgba(241,196,15,0.7);`;
                cropBox.appendChild(line);
            }
        }
        gridColsInput.addEventListener('input', drawGridOverlay);
        gridRowsInput.addEventListener('input', drawGridOverlay);

        imageCropBtn.addEventListener('click', () => {
            if(cropCtx) cropCtx.clearRect(0,0,cropCanvas.width, cropCanvas.height);
            cropCanvas.width = 0;
            cropCanvas.height = 0;
            cropBox.style.display = 'none';
            cropPreviewContainer.style.display = 'none';
            cropAddBtn.disabled = true;
            cropCardName.value = '';
            currentCropImg = null;
            imageCropModal.style.display = 'flex';
        });

        cropCancelBtn.addEventListener('click', () => {
            imageCropModal.style.display = 'none';
        });

        function loadCropImage(src) {
            const img = new Image();
            img.onload = () => {
                currentCropImg = img;
                cropCanvas.width = img.width;
                cropCanvas.height = img.height;
                cropCtx.drawImage(img, 0, 0);
                cropBox.style.display = 'none';
                cropAddBtn.disabled = true;
            };
            img.src = src;
        }

        imageUpload.addEventListener('change', (e) => {
            if(e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => loadCropImage(ev.target.result);
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        window.addEventListener('paste', (e) => {
            if (imageCropModal.style.display === 'none') return;
            const items = (e.clipboardData || window.clipboardData).items;
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (ev) => loadCropImage(ev.target.result);
                    reader.readAsDataURL(blob);
                    break;
                }
            }
        });

        cropCanvas.addEventListener('mousedown', (e) => {
            if(!currentCropImg) return;
            const rect = cropCanvas.getBoundingClientRect();
            const scaleX = cropCanvas.width / rect.width;
            const scaleY = cropCanvas.height / rect.height;
            cropStartX = (e.clientX - rect.left) * scaleX;
            cropStartY = (e.clientY - rect.top) * scaleY;
            isDrawingCrop = true;
            cropBox.style.display = 'block';
            updateCropBox(cropStartX, cropStartY, 0, 0, rect, scaleX, scaleY);
        });

        cropCanvas.addEventListener('mousemove', (e) => {
            if(!isDrawingCrop) return;
            const rect = cropCanvas.getBoundingClientRect();
            const scaleX = cropCanvas.width / rect.width;
            const scaleY = cropCanvas.height / rect.height;
            let currentX = (e.clientX - rect.left) * scaleX;
            let currentY = (e.clientY - rect.top) * scaleY;
            let width = currentX - cropStartX;
            let height = currentY - cropStartY;
            
            if (currentCropMode === 'single') {
                height = (Math.abs(width) * CARD_H_RATIO) / CARD_W_RATIO;
                if(currentY < cropStartY) height = -height;
            }
            updateCropBox(cropStartX, cropStartY, width, height, rect, scaleX, scaleY);
        });

        function updateCropBox(sx, sy, w, h, rect, scaleX, scaleY) {
            let physicalLeft = (Math.min(sx, sx + w) / scaleX) + cropCanvas.offsetLeft;
            let physicalTop = (Math.min(sy, sy + h) / scaleY) + cropCanvas.offsetTop;
            let physicalWidth = Math.abs(w) / scaleX;
            let physicalHeight = Math.abs(h) / scaleY;
            cropBox.style.left = physicalLeft + 'px';
            cropBox.style.top = physicalTop + 'px';
            cropBox.style.width = physicalWidth + 'px';
            cropBox.style.height = physicalHeight + 'px';
        }

        cropCanvas.addEventListener('mouseup', finishCrop);
        cropCanvas.addEventListener('mouseleave', (e) => { if(isDrawingCrop) finishCrop(e); });

        function finishCrop() {
            if(!isDrawingCrop) return;
            isDrawingCrop = false;
            const boxLeft = parseFloat(cropBox.style.left) - cropCanvas.offsetLeft;
            const boxTop = parseFloat(cropBox.style.top) - cropCanvas.offsetTop;
            const boxWidth = parseFloat(cropBox.style.width);
            const boxHeight = parseFloat(cropBox.style.height);
            if (boxWidth < 10 || boxHeight < 10) {
                cropBox.style.display = 'none'; return;
            }

            if(currentCropMode === 'grid') drawGridOverlay();

            const rect = cropCanvas.getBoundingClientRect();
            const scaleX = cropCanvas.width / rect.width;
            const scaleY = cropCanvas.height / rect.height;
            
            finalCropData = {
                x: boxLeft * scaleX,
                y: boxTop * scaleY,
                w: boxWidth * scaleX,
                h: boxHeight * scaleY
            };

            if (currentCropMode === 'single') {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 118; tempCanvas.height = 172;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(cropCanvas, finalCropData.x, finalCropData.y, finalCropData.w, finalCropData.h, 0, 0, tempCanvas.width, tempCanvas.height);
                lastCropDataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
                cropPreview.src = lastCropDataUrl;
                cropPreviewContainer.style.display = 'flex';
            } else {
                cropPreviewContainer.style.display = 'none';
            }
            
            cropAddBtn.disabled = false;
            if(currentCropMode === 'single') cropCardName.focus();
        }

        cropAddBtn.addEventListener('click', () => {
            if(!finalCropData) return;
            
            if (currentCropMode === 'single') {
                const nameText = cropCardName.value.trim() || `オリジナル画像 ${Math.floor(Math.random()*1000)}`;
                const customId = 'img_' + Date.now();
                addCardToDeck({ id: customId, name: nameText, isCustom: true, isImageCard: true, imageData: lastCropDataUrl });
                showToast(`「${nameText}」を追加しました！`);
            } else {
                const cols = parseInt(gridColsInput.value) || 10;
                const rows = parseInt(gridRowsInput.value) || 4;
                const cellW = finalCropData.w / cols;
                const cellH = finalCropData.h / rows;
                
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 118; tempCanvas.height = 172;
                const tempCtx = tempCanvas.getContext('2d');
                
                let added = 0;
                for(let r = 0; r < rows; r++) {
                    for(let c = 0; c < cols; c++) {
                        tempCtx.clearRect(0,0,118,172);
                        const sx = finalCropData.x + c * cellW;
                        const sy = finalCropData.y + r * cellH;
                        
                        tempCtx.drawImage(cropCanvas, sx, sy, cellW, cellH, 0, 0, 118, 172);
                        const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
                        
                        const customId = 'img_' + Date.now() + '_' + added;
                        addCardToDeck({ id: customId, name: `一括カット ${r+1}-${c+1}`, isCustom: true, isImageCard: true, imageData: dataUrl }, true);
                        added++;
                    }
                }
                saveDecks();
                renderDeck();
                showToast(`${added}枚のカードを一括追加しました！(不要な空白マスは右クリックで削除してください)`);
            }
            
            imageCropModal.style.display = 'none';
        });
    }

    // --- Import Modal Logic ---
    importDeckBtn.addEventListener('click', () => {
        importTextarea.value = '';
        importModal.style.display = 'flex';
    });
    importCancelBtn.addEventListener('click', () => {
        importModal.style.display = 'none';
    });
    importRunBtn.addEventListener('click', async () => {
        const text = importTextarea.value.trim();
        if (!text) { alert("テキストを入力してください"); return; }
        
        importRunBtn.disabled = true;
        importRunBtn.textContent = "処理中...";
        
        if (cardDatabase.length === 0) await loadDatabase();
        
        const lines = text.split('\n');
        const uniqueCardNames = new Set();
        
        lines.forEach(line => {
            let cardName = line.trim();
            if (!cardName) return;
            // 無視する行 (区切り文字など)
            if (cardName.startsWith('#') || cardName.startsWith('!')) return;
            
            // 「3 灰流うらら」「3x 増殖するG」「x2 スネークアイ」などの枚数表記を除去
            cardName = cardName.replace(/^([0-9０-９]+[xXｘＸ枚]?|[xXｘＸ][0-9０-９]+)[\s　]*/, '').trim();
            if (cardName) uniqueCardNames.add(cardName);
        });

        let addedCount = 0;
        uniqueCardNames.forEach(nameText => {
            const normalized = normalizeSearchText(nameText);
            // 完全一致検索、ダメなら正規化検索
            let found = cardDatabase.find(c => c.name === nameText) 
                     || cardDatabase.find(c => normalizeSearchText(c.name) === normalized);
            
            if (found) {
                addCardToDeck(found, true);
            } else {
                // APIに無ければ即座に自動カスタムカード化！これが最強の柔軟性
                const customId = 'custom_' + Date.now() + '_' + Math.floor(Math.random()*10000);
                addCardToDeck({ id: customId, name: nameText, isCustom: true }, true);
            }
            addedCount++;
        });
        
        saveDecks();
        renderDeck();
        showToast(`${addedCount}種のカードを一括インポートしました！`);
        
        importModal.style.display = 'none';
        importRunBtn.disabled = false;
        importRunBtn.textContent = "インポート実行";
    });

    // --- Search Logic (Furigana / Normalization) ---
    function hiraToKata(str) {
        return str.replace(/[\u3041-\u3096]/g, match => String.fromCharCode(match.charCodeAt(0) + 0x60));
    }
    function normalizeSearchText(str) {
        return hiraToKata(str).toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    }

    async function performSearch() {
        if (cardDatabase.length === 0) await loadDatabase();
        
        let q = searchInput.value.trim();
        if (!q) return;

        searchResults.innerHTML = '';
        const normalizedQuery = normalizeSearchText(q);
        const searchWords = normalizedQuery.split(/\s+/); 
        
        const results = cardDatabase.filter(c => {
            const nName = normalizeSearchText(c.name);
            return searchWords.every(word => nName.includes(word));
        }).slice(0, 40);
        
        if(results.length === 0) {
            searchResults.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 20px; background: rgba(30, 40, 50, 0.8); border: 1px solid var(--border-color); border-radius: 8px;">
                    <p style="font-size: 0.9rem; margin-bottom: 15px; line-height: 1.6; color:var(--danger)">見つかりませんでした。<br>APIデータの翻訳遅れのため、日本で発売されたばかりの最新カードはまだ公式登録されてない場合があります。</p>
                    <button class="btn primary" id="quick-custom-btn" style="width: 100%; justify-content: center; padding: 12px;">
                        <i class="fa-solid fa-pen-nib"></i> ワンクリックで「${escapeHTML(q)}」として即席カードを作成してデッキに入れる
                    </button>
                </div>
            `;
            document.getElementById('quick-custom-btn').addEventListener('click', () => {
                const customId = 'custom_' + Date.now();
                addCardToDeck({ id: customId, name: q, isCustom: true });
            });
            return;
        }
        
        results.forEach(c => {
            const div = document.createElement('div');
            div.className = 'card-item';
            div.title = "クリックして現在のデッキに送信";
            
            const img = document.createElement('img');
            img.src = `https://images.ygoprodeck.com/images/cards_small/${c.id}.jpg`;
            img.alt = c.name;
            img.loading = "lazy";
            div.appendChild(img);
            
            div.addEventListener('click', () => addCardToDeck(c));
            searchResults.appendChild(div);
        });
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (e) => { if(e.key === 'Enter') performSearch(); });

    // --- Action Button Logic ---
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => addNode({ type: 'action', actionType: btn.dataset.type }));
    });

    // --- Canvas Logic ---
    function addNode(nodeData) {
        routeNodes.push(nodeData);
        renderCanvas();
    }

    window.removeNode = function(index) {
        routeNodes.splice(index, 1);
        renderCanvas();
    }

    function renderCanvas() {
        canvas.innerHTML = '';
        if (routeNodes.length === 0) {
            canvas.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-arrow-pointer" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>パレットからカードを選択して<br>展開ルートを構築してください</p>
                </div>
            `;
            return;
        }
        
        routeNodes.forEach((n, i) => {
            const el = document.createElement('div');
            el.className = `node ${n.type}-node`;
            el.title = "クリックで削除";
            el.setAttribute('onclick', `removeNode(${i})`);
            
            if (n.type === 'card') {
                if (n.isCustom) {
                    if (n.isImageCard && n.imageData) {
                        el.innerHTML = `<img src="${n.imageData}" alt="${n.name}">`;
                    } else {
                        el.innerHTML = `<div class="custom-card">${escapeHTML(n.name)}</div>`;
                    }
                } else {
                    el.innerHTML = `<img src="https://images.ygoprodeck.com/images/cards_small/${n.id}.jpg" alt="${n.name}">`;
                }
            } else if (n.type === 'action') {
                const a = actionMap[n.actionType];
                el.innerHTML = (a.icon ? `<i class="fa-solid ${a.icon}"></i> ` : '') + a.text;
            }
            
            canvas.appendChild(el);
        });
        
        const canvasArea = document.getElementById('canvas-area');
        canvasArea.scrollTop = canvasArea.scrollHeight;
    }

    clearBtn.addEventListener('click', () => {
        if(routeNodes.length === 0) return;
        if(confirm("盤面のルートをすべてクリアしますか？")) {
            routeNodes = [];
            comboTitle.value = '';
            localStorage.removeItem('ygo_combo_title');
            renderCanvas();
        }
    });

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag]));
    }

    renderDeckOptions();
    renderDeck();

})();
