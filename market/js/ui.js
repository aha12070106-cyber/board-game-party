// 화면 공통 도구: 글자 이스케이프, 토스트, 모달, 날짜 표시, 상품 카드 이미지

import { categoryOf } from './shared.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 사용자가 입력한 글자는 반드시 이걸 거쳐서 HTML 에 넣어요. (스크립트 삽입 방지)
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const safeUrl = u => (typeof u === 'string' && /^(https?:|data:image\/)/.test(u)) ? u : '';

export function toast(message, kind = 'info', ms = 3200) {
  let box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const icon = { info: 'ℹ️', success: '✅', error: '⚠️', bell: '🔔' }[kind] || 'ℹ️';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(message)}</span>`;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove(); // 너무 많이 쌓이지 않게
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// actions: [{ label, kind: 'primary'|'danger'|'ghost', onClick(close, btn) → 반환값이 false 면 닫지 않음 }]
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn modal-x" aria-label="닫기">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-actions"></div>
    </div>`;
  const bodyEl = $('.modal-body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  let closed = false;
  const prevFocus = document.activeElement;
  const close = () => {
    if (closed) return; closed = true;
    back.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => back.remove(), 200);
    onClose && onClose();
    prevFocus && prevFocus.focus && prevFocus.focus();
  };
  const onKey = e => { if (e.key === 'Escape' && !back.dataset.busy) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', e => { if (e.target === back && !back.dataset.busy) close(); });
  $('.modal-x', back).onclick = () => { if (!back.dataset.busy) close(); };
  const actEl = $('.modal-actions', back);
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || 'ghost'}`;
    b.textContent = a.label;
    if (a.id) b.id = a.id;
    b.onclick = async () => {
      if (!a.onClick) return close();
      const r = await a.onClick(close, b);
      if (r !== false) close();
    };
    actEl.appendChild(b);
  });
  document.getElementById('modal-root').appendChild(back);
  requestAnimationFrame(() => back.classList.add('show'));
  setTimeout(() => { const f = $('input,select,textarea,.btn.primary,.btn.danger', back); f && f.focus(); }, 50);
  return { close, el: back, body: bodyEl, setBusy(v) { if (v) back.dataset.busy = '1'; else delete back.dataset.busy; } };
}

export function confirmDialog({ title, message, okLabel = '확인', danger = false }) {
  return new Promise(resolve => {
    let ok = false;
    modal({
      title, body: `<p class="pre">${esc(message)}</p>`,
      actions: [
        { label: '취소', kind: 'ghost' },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { ok = true; } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

// 짧은 입력을 받는 모달. fields: [{ name, label, type, value, placeholder, min, max }]
export function promptDialog({ title, fields, okLabel = '확인', danger = false, onSubmit, note = '' }) {
  const form = document.createElement('form');
  form.className = 'form';
  form.innerHTML = (note ? `<p class="muted small">${note}</p>` : '') + fields.map(f => `
    <label class="field"><span>${esc(f.label)}</span>
      ${f.type === 'textarea'
        ? `<textarea name="${f.name}" rows="6" placeholder="${esc(f.placeholder || '')}" maxlength="${f.maxlength || 3000}">${esc(f.value || '')}</textarea>`
        : f.type === 'checkbox'
          ? `<span class="check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}> ${esc(f.hint || '')}</span>`
          : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`}
    </label>`).join('') + '<p class="form-error" hidden></p>';
  const errEl = $('.form-error', form);
  let m;
  const submit = async (close, btn) => {
    const data = {};
    fields.forEach(f => { const el = form.elements[f.name]; data[f.name] = f.type === 'checkbox' ? el.checked : el.value; });
    errEl.hidden = true;
    btn && (btn.disabled = true);
    m.setBusy(true);
    try { await onSubmit(data); m.setBusy(false); close(); }
    catch (e) { errEl.textContent = e.message || String(e); errEl.hidden = false; m.setBusy(false); btn && (btn.disabled = false); }
    return false;
  };
  m = modal({
    title, body: form,
    actions: [{ label: '취소', kind: 'ghost' }, { label: okLabel, kind: danger ? 'danger' : 'primary', id: 'prompt-ok', onClick: submit }],
  });
  form.addEventListener('submit', e => { e.preventDefault(); $('#prompt-ok', m.el).click(); });
  return m;
}

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return fmtDate(ms, false);
}
export function fmtDate(ms, withTime = true) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
}

// 상품 이미지. 이미지가 없으면 카테고리 색과 이모지로 그림을 대신해요.
export function thumb(p, cls = '') {
  const url = safeUrl(p.imageUrl || p.productImage);
  const cat = categoryOf(p.category);
  if (url) return `<div class="thumb ${cls}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></div>`;
  return `<div class="thumb ph cat-${esc(cat.id)} ${cls}" aria-hidden="true"><span>${cat.emoji}</span></div>`;
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
