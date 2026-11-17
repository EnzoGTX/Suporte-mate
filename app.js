(() => {
  'use strict';

  const KEY = 'satisfacao-clientes:v1';
  const $ = (s) => document.querySelector(s);

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () =>
    window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const norm = (s) => String(s).trim().toLowerCase();
  const clampScore = (n) => Math.min(10, Math.max(0, Math.round(Number(n) || 0)));

  // ---------- Estado ----------
  // companies: [{ id, name, score (0-10), problems: [problemId], notes, updatedAt }]
  // problems:  [{ id, title, prevention }]
  let state = load();
  let draft = []; // títulos dos problemas no formulário de empresa
  let editingCompany = null;
  let editingProblem = null;

  function sanitize(raw) {
    const problems = (Array.isArray(raw && raw.problems) ? raw.problems : [])
      .filter((p) => p && typeof p.title === 'string' && p.title.trim())
      .map((p) => ({ id: String(p.id || uid()), title: p.title.trim().slice(0, 80), prevention: String(p.prevention || '').slice(0, 600) }));
    const ids = new Set(problems.map((p) => p.id));
    const companies = (Array.isArray(raw && raw.companies) ? raw.companies : [])
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .map((c) => ({
        id: String(c.id || uid()),
        name: c.name.trim().slice(0, 80),
        score: clampScore(c.score),
        problems: (Array.isArray(c.problems) ? c.problems : []).map(String).filter((id) => ids.has(id)),
        notes: String(c.notes || '').slice(0, 600),
        updatedAt: Number(c.updatedAt) || Date.now(),
      }));
    return { companies, problems };
  }

  function load() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      return { companies: [], problems: [] };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('Não foi possível salvar neste navegador.');
    }
  }

  // ---------- Regras ----------
  function tier(score) {
    if (score >= 9) return { label: 'Elite', cls: 'elite' };
    if (score >= 7) return { label: 'Estável', cls: 'stable' };
    if (score >= 5) return { label: 'Atenção', cls: 'warn' };
    return { label: 'Crítico', cls: 'critical' };
  }

  const problemById = (id) => state.problems.find((p) => p.id === id);
  const problemByTitle = (title) => state.problems.find((p) => norm(p.title) === norm(title));
  const companiesWith = (problemId) => state.companies.filter((c) => c.problems.includes(problemId));

  function ranked() {
    return [...state.companies].sort(
      (a, b) => b.score - a.score || a.problems.length - b.problems.length || a.name.localeCompare(b.name, 'pt-BR')
    );
  }

  function problemsByFrequency() {
    return state.problems
      .map((p) => ({ ...p, companies: companiesWith(p.id) }))
      .sort((a, b) => b.companies.length - a.companies.length || a.title.localeCompare(b.title, 'pt-BR'));
  }

  // ---------- Render ----------
  function bar(score) {
    let cells = '';
    for (let i = 1; i <= 10; i++) cells += `<i class="${i <= score ? 'on' : ''}"></i>`;
    return `<div class="bar ${score < 7 ? 'low' : ''}" aria-hidden="true">${cells}</div>`;
  }

  function renderStats() {
    const n = state.companies.length;
    $('#stat-total').textContent = n;
    $('#stat-avg').textContent = n
      ? (state.companies.reduce((s, c) => s + c.score, 0) / n).toFixed(1).replace('.', ',')
      : '—';
    $('#stat-critical').textContent = state.companies.filter((c) => c.score < 5).length;
    const top = problemsByFrequency()[0];
    const el = $('#stat-top-problem');
    if (top && top.companies.length) {
      el.textContent = `${top.title} (${top.companies.length})`;
      el.title = top.title;
    } else {
      el.textContent = '—';
      el.title = '';
    }
  }

  function renderCompanies() {
    const q = norm($('#company-search').value);
    const list = [...state.companies]
      .filter((c) => !q || norm(c.name).includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const el = $('#company-list');

    if (!list.length) {
      el.innerHTML = `<div class="empty">${
        state.companies.length ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa registrada. Use o formulário para começar.'
      }</div>`;
      return;
    }

    el.innerHTML = list
      .map((c) => {
        const t = tier(c.score);
        const chips = c.problems
          .map(problemById)
          .filter(Boolean)
          .map((p) => `<span class="chip">${esc(p.title)}</span>`)
          .join('');
        return `
        <article class="item">
          <div class="item-head">
            <h3 class="item-title">${esc(c.name)}</h3>
            <div class="item-score">${c.score}<small>/10</small></div>
          </div>
          <div class="item-foot">
            ${bar(c.score)}
            <span class="tier ${t.cls}">${t.label}</span>
          </div>
          <div>
            <p class="label">Problemas recorrentes</p>
            ${chips ? `<div class="chips">${chips}</div>` : '<p class="muted">Nenhum problema registrado.</p>'}
          </div>
          ${c.notes ? `<div><p class="label">Observações</p><p>${esc(c.notes)}</p></div>` : ''}
          <div class="item-foot">
            <span class="hint">Atualizado em ${new Date(c.updatedAt).toLocaleDateString('pt-BR')}</span>
            <div class="item-actions">
              <button class="btn ghost small" data-action="edit-company" data-id="${esc(c.id)}">Editar</button>
              <button class="btn danger small" data-action="delete-company" data-id="${esc(c.id)}">Excluir</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  function renderDraft() {
    $('#draft-chips').innerHTML = draft
      .map(
        (t, i) =>
          `<span class="chip">${esc(t)}<button type="button" data-action="remove-draft" data-index="${i}" aria-label="Remover ${esc(t)}">&times;</button></span>`
      )
      .join('');
    $('#problem-suggestions').innerHTML = state.problems
      .filter((p) => !draft.some((t) => norm(t) === norm(p.title)))
      .map((p) => `<option value="${esc(p.title)}"></option>`)
      .join('');
  }

  function renderProblems() {
    const list = problemsByFrequency();
    const el = $('#problem-list');
    if (!list.length) {
      el.innerHTML = '<div class="empty">Nenhum problema registrado ainda.</div>';
      return;
    }
    const max = Math.max(1, ...list.map((p) => p.companies.length));
    el.innerHTML = list
      .map((p, i) => {
        const n = p.companies.length;
        const names = p.companies.map((c) => esc(c.name)).join(', ');
        return `
        <article class="item">
          <div class="item-head">
            <h3 class="item-title"><span class="muted">${String(i + 1).padStart(2, '0')}</span> ${esc(p.title)}</h3>
            <div class="count">${n}<small>${n === 1 ? 'empresa' : 'empresas'}</small></div>
          </div>
          <div class="freq" aria-hidden="true"><span style="width:${(n / max) * 100}%"></span></div>
          ${n ? `<div><p class="label">Empresas afetadas</p><p>${names}</p></div>` : ''}
          <div>
            <p class="label">Como evitar</p>
            ${p.prevention ? `<p class="prevention">${esc(p.prevention)}</p>` : '<p class="muted">Ainda sem orientação. Edite para adicionar.</p>'}
          </div>
          <div class="item-foot">
            <span></span>
            <div class="item-actions">
              <button class="btn ghost small" data-action="edit-problem" data-id="${esc(p.id)}">Editar</button>
              <button class="btn danger small" data-action="delete-problem" data-id="${esc(p.id)}">Excluir</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  function renderRanking() {
    const list = ranked();
    $('#rank-empty').hidden = list.length > 0;
    $('#rank-body').innerHTML = list
      .map((c, i) => {
        const t = tier(c.score);
        return `
        <tr class="${i < 3 ? 'top' : ''}">
          <td class="pos">${String(i + 1).padStart(2, '0')}</td>
          <td class="name">${esc(c.name)}</td>
          <td><div class="score-cell"><span class="score-num">${c.score}</span>${bar(c.score)}</div></td>
          <td>${c.problems.length}</td>
          <td><span class="tier ${t.cls}">${t.label}</span></td>
        </tr>`;
      })
      .join('');
  }

  function renderAll() {
    renderStats();
    renderCompanies();
    renderDraft();
    renderProblems();
    renderRanking();
  }

  // ---------- Formulário de empresa ----------
  function updateScoreOut() {
    const v = clampScore($('#company-score').value);
    $('#company-score-out').textContent = v;
    $('#company-score-tier').textContent = `Classificação: ${tier(v).label}`;
  }

  function addDraft() {
    const input = $('#problem-input');
    const title = input.value.trim();
    if (!title) return;
    if (!draft.some((t) => norm(t) === norm(title))) {
      const existing = problemByTitle(title);
      draft.push(existing ? existing.title : title);
    }
    input.value = '';
    renderDraft();
    input.focus();
  }

  function resetCompanyForm() {
    editingCompany = null;
    draft = [];
    $('#company-form').reset();
    $('#company-form-title').textContent = 'Registrar empresa';
    $('#company-submit').textContent = 'Salvar empresa';
    $('#company-cancel').hidden = true;
    updateScoreOut();
    renderDraft();
  }

  function submitCompany(e) {
    e.preventDefault();
    addDraft(); // inclui o que ficou digitado sem Enter
    const name = $('#company-name').value.trim();
    if (!name) return;

    const clash = state.companies.find((c) => norm(c.name) === norm(name) && c.id !== editingCompany);
    if (clash) {
      toast('Essa empresa já está registrada. Use Editar para atualizar.');
      return;
    }

    const problemIds = draft.map((title) => {
      let p = problemByTitle(title);
      if (!p) {
        p = { id: uid(), title, prevention: '' };
        state.problems.push(p);
      }
      return p.id;
    });

    const data = {
      name,
      score: clampScore($('#company-score').value),
      problems: problemIds,
      notes: $('#company-notes').value.trim(),
      updatedAt: Date.now(),
    };

    if (editingCompany) {
      Object.assign(state.companies.find((c) => c.id === editingCompany), data);
      toast('Empresa atualizada.');
    } else {
      state.companies.push({ id: uid(), ...data });
      toast('Empresa registrada.');
    }
    save();
    resetCompanyForm();
    renderAll();
  }

  function editCompany(id) {
    const c = state.companies.find((x) => x.id === id);
    if (!c) return;
    editingCompany = id;
    $('#company-name').value = c.name;
    $('#company-score').value = c.score;
    $('#company-notes').value = c.notes;
    draft = c.problems.map(problemById).filter(Boolean).map((p) => p.title);
    $('#company-form-title').textContent = 'Editar empresa';
    $('#company-submit').textContent = 'Atualizar empresa';
    $('#company-cancel').hidden = false;
    updateScoreOut();
    renderDraft();
    $('#company-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#company-name').focus();
  }

  function deleteCompany(id) {
    const c = state.companies.find((x) => x.id === id);
    if (!c || !confirm(`Excluir a empresa "${c.name}"?`)) return;
    state.companies = state.companies.filter((x) => x.id !== id);
    if (editingCompany === id) resetCompanyForm();
    save();
    renderAll();
    toast('Empresa excluída.');
  }

  // ---------- Formulário de problema ----------
  function resetProblemForm() {
    editingProblem = null;
    $('#problem-form').reset();
    $('#problem-form-title').textContent = 'Registrar problema';
    $('#problem-submit').textContent = 'Salvar problema';
    $('#problem-cancel').hidden = true;
  }

  function submitProblem(e) {
    e.preventDefault();
    const title = $('#problem-title').value.trim();
    if (!title) return;
    const prevention = $('#problem-prevention').value.trim();

    const clash = state.problems.find((p) => norm(p.title) === norm(title) && p.id !== editingProblem);
    if (clash) {
      toast('Esse problema já existe na lista.');
      return;
    }

    if (editingProblem) {
      const old = problemById(editingProblem);
      // mantém o rascunho do formulário de empresa coerente se o título mudar
      draft = draft.map((t) => (norm(t) === norm(old.title) ? title : t));
      Object.assign(old, { title, prevention });
      toast('Problema atualizado.');
    } else {
      state.problems.push({ id: uid(), title, prevention });
      toast('Problema registrado.');
    }
    save();
    resetProblemForm();
    renderAll();
  }

  function editProblem(id) {
    const p = problemById(id);
    if (!p) return;
    editingProblem = id;
    $('#problem-title').value = p.title;
    $('#problem-prevention').value = p.prevention;
    $('#problem-form-title').textContent = 'Editar problema';
    $('#problem-submit').textContent = 'Atualizar problema';
    $('#problem-cancel').hidden = false;
    $('#problem-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#problem-title').focus();
  }

  function deleteProblem(id) {
    const p = problemById(id);
    if (!p) return;
    const n = companiesWith(id).length;
    const extra = n ? ` Ele será removido de ${n} ${n === 1 ? 'empresa' : 'empresas'}.` : '';
    if (!confirm(`Excluir o problema "${p.title}"?${extra}`)) return;
    state.problems = state.problems.filter((x) => x.id !== id);
    state.companies.forEach((c) => (c.problems = c.problems.filter((pid) => pid !== id)));
    draft = draft.filter((t) => norm(t) !== norm(p.title));
    if (editingProblem === id) resetProblemForm();
    save();
    renderAll();
    toast('Problema excluído.');
  }

  // ---------- Exportar / importar ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `satisfacao-clientes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let next;
      try {
        const raw = JSON.parse(reader.result);
        if (!raw || !Array.isArray(raw.companies) || !Array.isArray(raw.problems)) throw new Error('formato');
        next = sanitize(raw);
      } catch (e) {
        toast('Arquivo inválido. Use um arquivo exportado por este painel.');
        return;
      }
      const msg = `Importar ${next.companies.length} empresas e ${next.problems.length} problemas? Isso substitui os dados atuais deste navegador.`;
      if (!confirm(msg)) return;
      state = next;
      save();
      resetCompanyForm();
      resetProblemForm();
      renderAll();
      toast('Dados importados.');
    };
    reader.readAsText(file);
  }

  // ---------- UI ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.panel').forEach((p) => {
      const on = p.id === `tab-${name}`;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) return showTab(tab.dataset.tab);

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'add-draft': return addDraft();
      case 'remove-draft':
        draft.splice(Number(btn.dataset.index), 1);
        return renderDraft();
      case 'cancel-company': return resetCompanyForm();
      case 'edit-company': return editCompany(id);
      case 'delete-company': return deleteCompany(id);
      case 'cancel-problem': return resetProblemForm();
      case 'edit-problem': return editProblem(id);
      case 'delete-problem': return deleteProblem(id);
      case 'export': return exportData();
      case 'import': return $('#import-file').click();
    }
  });

  $('#company-form').addEventListener('submit', submitCompany);
  $('#problem-form').addEventListener('submit', submitProblem);
  $('#company-score').addEventListener('input', updateScoreOut);
  $('#company-search').addEventListener('input', renderCompanies);
  $('#problem-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraft();
    }
  });
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  updateScoreOut();
  renderAll();
})();
