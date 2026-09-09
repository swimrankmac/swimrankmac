/* =====================================================================
 * 澳門游泳成績排行 — 互動邏輯（簡化版）
 * 只做長池 50m · 無泳會／年齡組別／初賽決賽
 * 功能：性別切換、項目／比賽篩選、姓名搜尋、達標標準彈窗
 * ===================================================================== */
(function () {
  'use strict';

  // 當前使用的數據（內建於 data-2026.js）
  let DATA = (window.SWIM_DATA || []).slice();
  const STANDARDS = window.SWIM_STANDARDS || { M: {}, F: {} };

  const STROKE_ORDER = ['Fr', 'Ba', 'Br', 'Fly', 'IM'];
  const STROKE_ZH = { Fr: '自由泳', Ba: '背泳', Br: '蛙泳', Fly: '蝶泳', IM: '混合泳' };
  const DISTANCES = [50, 100, 200, 400, 800, 1500];

  const state = {
    gender: 'M',
    eventKey: null,   // `${stroke}|${distance}`
    meet: 'all',
    search: '',
    sort: 'time',
    bestOnly: false,  // 只顯示每位運動員在每個項目嘅最快成績
    yearFrom: null,   // 年份下界（含）；null = 唔篩
    yearTo: null,     // 年份上界（含）；null = 唔篩
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const eventSel = $('eventSel');
  const meetSel = $('meetSel');
  const searchBox = $('searchBox');
  const sortSel = $('sortSel');
  const rankBody = $('rankBody');
  const resultCount = $('resultCount');
  const resultEvent = $('resultEvent');
  const emptyHint = $('emptyHint');
  const bestBtn = $('bestBtn');
  const yearFrom = $('yearFrom');
  const yearTo = $('yearTo');
  const yearApply = $('yearApply');
  const yearHint = $('yearHint');

  // ---- 工具：時間轉換 ----
  function formatTime(sec) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const ss = s.toFixed(2);
    if (m > 0) return m + ':' + (s < 10 ? '0' : '') + ss;
    return ss;
  }

  function parseTime(str) {
    if (str == null) return null;
    let s = String(str).trim().replace(',', '.');
    if (!s) return null;
    if (s.indexOf(':') !== -1) {
      const parts = s.split(':');
      const min = parseFloat(parts[0]) || 0;
      const sec = parseFloat(parts[1]) || 0;
      return +(min * 60 + sec).toFixed(2);
    }
    const v = parseFloat(s);
    return isNaN(v) ? null : +v.toFixed(2);
  }

  // ---- 建立下拉選項 ----
  function uniq(arr) { return [...new Set(arr)]; }

  function fillSelect(sel, values, allLabel) {
    const cur = sel.value;
    sel.innerHTML =
      `<option value="all">${allLabel}</option>` +
      values.map((v) => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(cur)) sel.value = cur;
  }

  function buildSelectors() {
    // 項目（由數據自動列出；唔理有冇人達標都顯示 → 空列表見提示）
    const events = uniq(DATA.map((d) => `${d.stroke}|${d.distance}`));
    events.sort((a, b) => {
      const [sa, da] = a.split('|');
      const [sb, db] = b.split('|');
      if (STROKE_ORDER.indexOf(sa) !== STROKE_ORDER.indexOf(sb))
        return STROKE_ORDER.indexOf(sa) - STROKE_ORDER.indexOf(sb);
      return parseInt(da, 10) - parseInt(db, 10);
    });
    eventSel.innerHTML = events
      .map((e) => {
        const [s, d] = e.split('|');
        return `<option value="${e}">${d}米${STROKE_ZH[s]}</option>`;
      })
      .join('');
    if (!state.eventKey || !events.includes(state.eventKey)) {
      state.eventKey = events[0] || null;
    }
    eventSel.value = state.eventKey || '';

    fillSelect(meetSel, uniq(DATA.map((d) => d.meet)).sort(), '全部比賽');
  }

  // ---- 二級標準查詢 ----
  // 未設定標準（null）= 暫顯示全部；設定後只顯示 timeSec <= 標準
  function getStandard(gender, stroke, distance) {
    const g = STANDARDS[gender];
    if (!g || !g[stroke]) return null;
    const v = g[stroke][distance];
    return (typeof v === 'number' && v > 0) ? v : null;
  }

  // ---- 渲染排行榜 ----
  function render() {
    if (!state.eventKey) {
      rankBody.innerHTML = '';
      resultCount.textContent = '0 筆';
      resultEvent.textContent = '尚無資料';
      emptyHint.hidden = false;
      emptyHint.textContent = '尚無資料。';
      return;
    }
    const [stroke, distance] = state.eventKey.split('|');
    const kw = state.search.trim().toLowerCase();
    const standard = getStandard(state.gender, stroke, parseInt(distance, 10));

    let rows = DATA.filter((d) => {
      if (d.gender !== state.gender) return false;
      if ((d.course || '50m') !== '50m') return false;          // 只做長池
      if (d.stroke !== stroke || String(d.distance) !== String(distance)) return false;
      if (state.meet !== 'all' && d.meet !== state.meet) return false;
      if (kw && !(d.name || '').toLowerCase().includes(kw)) return false;
      if (standard != null && (d.timeSec || 0) > standard) return false; // 二級達標
      // 年份範圍篩選
      if (state.yearFrom != null || state.yearTo != null) {
        const yr = d.date ? parseInt(d.date.slice(0, 4), 10) : NaN;
        if (isNaN(yr)) return false;
        if (state.yearFrom != null && yr < state.yearFrom) return false;
        if (state.yearTo != null && yr > state.yearTo) return false;
      }
      return true;
    });

    // 只顯示最佳成績：每位運動員在每個項目（泳式×距離）只留最快一次
    if (state.bestOnly) {
      const best = new Map();
      for (const d of rows) {
        const key = `${d.name}|${d.stroke}|${d.distance}`;
        const cur = best.get(key);
        if (!cur || (d.timeSec || 0) < (cur.timeSec || 0)) best.set(key, d);
      }
      rows = [...best.values()];
    }

    rows.sort((a, b) => {
      if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      if (state.sort === 'date') return (b.date || '').localeCompare(a.date || '');
      return (a.timeSec || 0) - (b.timeSec || 0); // 成績快→慢
    });

    // 名次：按成績排序時用「並列名次」（同時間同分，下一個跳號 1,1,3）；其他排序顯示 —
    let lastTime = null;
    let lastRank = 0;
    rankBody.innerHTML = rows
      .map((d, i) => {
        if (state.sort === 'time') {
          if (lastTime === null || d.timeSec !== lastTime) {
            lastTime = d.timeSec;
            lastRank = i + 1;
          }
        }
        const num = state.sort === 'time' ? lastRank : '—';
        return `<tr>
          <td class="col-rank"><span class="rank-pill">${num}</span></td>
          <td class="col-name">${escapeHtml(d.name || '—')}</td>
          <td class="col-meet">${escapeHtml(d.meet || '—')}</td>
          <td class="col-date">${escapeHtml(d.date || '—')}</td>
          <td class="col-time"><span class="time-cell">${d.time || formatTime(d.timeSec || 0)}</span></td>
        </tr>`;
      })
      .join('');

    resultCount.textContent = `${rows.length} 筆`;
    const gTxt = state.gender === 'M' ? '男子' : '女子';
    resultEvent.textContent = `${gTxt} · ${distance}米${STROKE_ZH[stroke]} · 長池50m`;

    emptyHint.hidden = rows.length > 0;
    if (rows.length === 0) {
      emptyHint.textContent = standard != null
        ? '此項目暫無達到標準嘅成績。'
        : '沒有符合條件的成績，試試調整篩選。';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ---- 事件綁定 ----
  document.querySelectorAll('.gender-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gender-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.gender = btn.dataset.gender;
      render();
    });
  });
  eventSel.addEventListener('change', (e) => { state.eventKey = e.target.value; render(); });
  meetSel.addEventListener('change', (e) => { state.meet = e.target.value; render(); });
  sortSel.addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  searchBox.addEventListener('input', (e) => { state.search = e.target.value; render(); });
  $('resetBtn').addEventListener('click', () => {
    state.meet = 'all'; state.search = ''; state.sort = 'time';
    state.yearFrom = null; state.yearTo = null;
    meetSel.value = 'all'; searchBox.value = ''; sortSel.value = 'time';
    yearFrom.value = ''; yearTo.value = ''; yearHint.textContent = ''; yearHint.classList.remove('error');
    render();
  });

  bestBtn.addEventListener('click', () => {
    state.bestOnly = !state.bestOnly;
    bestBtn.classList.toggle('active', state.bestOnly);
    bestBtn.setAttribute('aria-pressed', String(state.bestOnly));
    render();
  });

  // ---- 年份篩選（範圍）----
  function applyYearFilter() {
    const f = yearFrom.value.trim();
    const t = yearTo.value.trim();
    const fy = f === '' ? null : parseInt(f, 10);
    const ty = t === '' ? null : parseInt(t, 10);
    if ((f !== '' && isNaN(fy)) || (t !== '' && isNaN(ty))) {
      yearHint.textContent = '請輸入有效年份';
      yearHint.classList.add('error');
      return;
    }
    if (fy != null && ty != null && fy > ty) {
      yearHint.textContent = '「由」年份不能大過「至」年份';
      yearHint.classList.add('error');
      return;
    }
    state.yearFrom = fy;
    state.yearTo = ty;
    yearHint.classList.remove('error');
    if (fy != null || ty != null) {
      const txt = (fy != null ? fy : '…') + ' – ' + (ty != null ? ty : '…');
      yearHint.textContent = '已篩選年份：' + txt;
    } else {
      yearHint.textContent = '';
    }
    render();
  }
  yearApply.addEventListener('click', applyYearFilter);
  [yearFrom, yearTo].forEach((el) =>
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyYearFilter(); })
  );

  // ---- 達標標準 modal ----
  const stdBtn = $('stdBtn');
  const stdModal = $('stdModal');
  const stdClose = $('stdClose');
  const stdBody = $('stdBody');
  const stdTitle = $('stdTitle');

  function fmtStd(sec) {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ':' + String(s).padStart(2, '0') + '.00';
  }

  function renderStdTable() {
    const g = state.gender === 'M' ? 'M' : 'F';
    stdTitle.textContent = (g === 'M' ? '男子' : '女子') + '達標標準';
    const gData = STANDARDS[g] || {};
    let html = '<table class="std-table"><thead><tr><th>項目</th>';
    DISTANCES.forEach((d) => { html += `<th>${d}m</th>`; });
    html += '</tr></thead><tbody>';
    STROKE_ORDER.forEach((st) => {
      const m = gData[st] || {};
      html += `<tr><th class="std-stroke">${STROKE_ZH[st]}</th>`;
      DISTANCES.forEach((d) => {
        const v = (typeof m[d] === 'number' && m[d] > 0) ? m[d] : null;
        html += `<td>${v == null ? '<span class="std-none">—</span>' : fmtStd(v)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    stdBody.innerHTML = html;
  }

  function openStd() { renderStdTable(); stdModal.hidden = false; }
  function closeStd() { stdModal.hidden = true; }
  stdBtn.addEventListener('click', openStd);
  stdClose.addEventListener('click', closeStd);
  stdModal.addEventListener('click', (e) => { if (e.target === stdModal) closeStd(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !stdModal.hidden) closeStd(); });

  // ---- 啟動 ----
  buildSelectors();
  render();
})();
