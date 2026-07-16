import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { firebaseConfig } from "../../core/firebase-config.js";
import { setupLayout, getCachedAuth, setCachedAuth, clearCachedAuth } from '../../core/layout.js';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.'))
  ? `http://${window.location.hostname}:3000/api`
  : '/api';

let currentUser = null;
let currentRole = null;
let userLevel = 1;
let appInitialized = false;
let initializedRole = null;

// Estado da ficha
let pacientes = [];
let pacienteAtual = null;
let atendimentos = [];
let fichasAntigas = [];   // metadados das fichas de papel digitalizadas do paciente atual
let fichasPendentes = []; // imagens já comprimidas aguardando o cadastro do novo paciente
let pinCount = 0;
let dirty = false;

async function apiFetch(endpoint, options = {}) {
  const token = await currentUser.getIdToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro na API: ${res.status}`);
  }
  return res.json();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ==========================================
// AUTH GUARD E INICIALIZAÇÃO
// ==========================================
const cached = getCachedAuth();
if (cached && (cached.role === 'adm_l1' || cached.role === 'adm_l2')) {
  currentUser = cached.user;
  currentRole = cached.role;
  initApp(cached.user, cached.role);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    clearCachedAuth();
    window.location.href = '../../auth/login.html';
    return;
  }

  currentUser = user;
  try {
    const token = await user.getIdToken();
    let role = 'visitante';
    try {
      const userData = await apiFetch('/usuarios/me');
      role = userData.role || 'visitante';
    } catch (err) {
      role = cached ? cached.role : 'visitante';
    }

    setCachedAuth(user, role, token);

    // Carregar nível de acesso dinâmico do módulo
    let level = 1;
    if (role === 'adm_l1') {
      level = 3;
    } else {
      try {
        const perms = await apiFetch('/usuarios/config/permissions');
        const rolePerms = perms[role] || {};
        const rawPerm = rolePerms['ferida'];
        level = (rawPerm !== undefined && typeof rawPerm === 'object')
          ? (rawPerm.execute ? 3 : (rawPerm.view ? 2 : 1))
          : (parseInt(rawPerm) || 1);
      } catch (e) {
        if (role === 'adm_l2') level = 3;
      }
    }
    userLevel = level;

    // Dado sensível de saúde: sem permissão de visualização, volta pro Meu Espaço
    if (level < 2) {
      window.location.href = '../../meu-espaco/index.html';
      return;
    }

    if (level < 3) {
      document.body.classList.add('hide-execute');
    } else {
      document.body.classList.remove('hide-execute');
    }

    if (!appInitialized || initializedRole !== role || (cached && (cached.user.displayName !== user.displayName || cached.user.email !== user.email))) {
      currentRole = role;
      initApp(user, role);
    }
  } catch (err) {
    console.error("Erro na revalidação de auth:", err);
  }
});

async function initApp(user, role) {
  if (appInitialized && initializedRole === role) return;
  appInitialized = true;
  initializedRole = role;

  setupLayout(user, role, 'ferida', async () => {
    clearCachedAuth();
    await signOut(auth);
    window.location.href = '../../auth/login.html';
  });

  document.getElementById('app').classList.remove('hidden');
  document.getElementById('meta-data').textContent = new Date().toLocaleDateString('pt-BR');

  setupBodyMap();
  setupChips();
  setupFormListeners();
  setupPacienteModal();
  setupFichasAntigas();
  await loadPacientes();
}

// ==========================================
// PACIENTES
// ==========================================

async function loadPacientes(selecionarId = null) {
  const sel = document.getElementById('sel-paciente');
  try {
    pacientes = await apiFetch('/ferida/pacientes');
    sel.innerHTML = '<option value="">Selecione o paciente...</option>';
    pacientes.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const idade = calcIdade(p.dataNascimento);
      opt.textContent = idade !== null ? `${p.nome} — ${idade} anos` : p.nome;
      sel.appendChild(opt);
    });

    if (selecionarId) {
      sel.value = selecionarId;
      await selecionarPaciente(selecionarId);
    }
  } catch (err) {
    sel.innerHTML = '<option value="">Erro ao carregar pacientes</option>';
    showToast('Erro ao carregar pacientes: ' + err.message, 'error');
  }
}

function calcIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento + 'T00:00:00');
  if (isNaN(nasc)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

async function selecionarPaciente(id) {
  pacienteAtual = pacientes.find(p => p.id === id) || null;
  const badge = document.getElementById('badge-retorno');
  const btnFichas = document.getElementById('btn-fichas-antigas');

  if (!pacienteAtual) {
    document.getElementById('meta-municipio').textContent = '—';
    badge.classList.add('hidden');
    btnFichas.classList.add('hidden');
    atendimentos = [];
    fichasAntigas = [];
    renderTimeline(false);
    return;
  }

  document.getElementById('meta-municipio').textContent = pacienteAtual.municipio || '—';

  try {
    [atendimentos, fichasAntigas] = await Promise.all([
      apiFetch(`/ferida/pacientes/${id}/atendimentos`),
      apiFetch(`/ferida/pacientes/${id}/fichas-antigas`)
    ]);
  } catch (err) {
    atendimentos = [];
    fichasAntigas = [];
    showToast('Erro ao carregar histórico: ' + err.message, 'error');
  }

  const n = atendimentos.length + 1;
  badge.textContent = n === 1 ? '1º atendimento' : `${n}º retorno`;
  badge.classList.remove('hidden');

  document.getElementById('fichas-count').textContent = fichasAntigas.length;
  btnFichas.classList.remove('hidden');

  renderTimeline(true);
}

function setupPacienteModal() {
  const modal = document.getElementById('modal-paciente');
  document.getElementById('btn-novo-paciente')?.addEventListener('click', () => {
    document.getElementById('form-paciente').reset();
    document.getElementById('pac-municipio').value = 'Ivaiporã';
    fichasPendentes = [];
    renderThumbsPendentes();
    modal.classList.remove('hidden');
    document.getElementById('pac-nome').focus();
  });
  document.getElementById('btn-cancelar-paciente')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  // Upload das fichas antigas de papel (fotos), comprimidas no navegador
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('pac-fichas');
  zone?.addEventListener('click', () => input.click());
  zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragging'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    adicionarPendentes(e.dataTransfer.files);
  });
  input?.addEventListener('change', (e) => { adicionarPendentes(e.target.files); input.value = ''; });

  document.getElementById('form-paciente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-paciente');
    btn.disabled = true;
    btn.textContent = 'Cadastrando...';
    try {
      const resp = await apiFetch('/ferida/pacientes', {
        method: 'POST',
        body: JSON.stringify({
          nome: document.getElementById('pac-nome').value.trim(),
          dataNascimento: document.getElementById('pac-nascimento').value || null,
          municipio: document.getElementById('pac-municipio').value.trim()
        })
      });

      // Anexar as fichas antigas selecionadas
      let enviadas = 0, falhas = 0;
      for (const ficha of fichasPendentes) {
        btn.textContent = `Anexando ficha ${enviadas + falhas + 1}/${fichasPendentes.length}...`;
        try {
          await apiFetch(`/ferida/pacientes/${resp.id}/fichas-antigas`, {
            method: 'POST',
            body: JSON.stringify({ imagem: ficha.dataUrl, nome: ficha.nome })
          });
          enviadas++;
        } catch (err) {
          falhas++;
          console.error('Falha ao anexar ficha antiga:', err);
        }
      }
      fichasPendentes = [];

      modal.classList.add('hidden');
      if (falhas) showToast(`Paciente cadastrado, mas ${falhas} imagem(ns) não subiram. Anexe de novo em "Fichas antigas".`, 'error');
      else showToast(enviadas ? `Paciente cadastrado com ${enviadas} ficha(s) antiga(s)` : 'Paciente cadastrado');
      await loadPacientes(resp.id);
    } catch (err) {
      showToast('Erro ao cadastrar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cadastrar';
    }
  });

  document.getElementById('sel-paciente')?.addEventListener('change', (e) => {
    selecionarPaciente(e.target.value);
  });
}

// ==========================================
// FICHAS ANTIGAS (imagens da ficha de papel)
// ==========================================

// Comprime a imagem no navegador até caber no limite de 1 MiB
// por documento do Firestore (data URL base64 <= ~950 mil chars).
const LIMITE_BASE64 = 950000;

function comprimirImagem(file) {
  const tentativas = [
    { dim: 1600, q: 0.85 },
    { dim: 1400, q: 0.72 },
    { dim: 1200, q: 0.62 },
    { dim: 1000, q: 0.52 },
    { dim: 800,  q: 0.45 }
  ];
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        for (const t of tentativas) {
          const scale = Math.min(1, t.dim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', t.q);
          if (dataUrl.length <= LIMITE_BASE64) return resolve(dataUrl);
        }
        reject(new Error('imagem grande demais mesmo após compressão'));
      };
      img.onerror = () => reject(new Error('arquivo de imagem inválido'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('não foi possível ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

async function adicionarPendentes(fileList) {
  for (const file of [...fileList]) {
    if (!file.type.startsWith('image/')) {
      showToast(`"${file.name}" não é uma imagem.`, 'error');
      continue;
    }
    try {
      const dataUrl = await comprimirImagem(file);
      fichasPendentes.push({ nome: file.name, dataUrl });
    } catch (err) {
      showToast(`Não deu pra usar "${file.name}": ${err.message}`, 'error');
    }
  }
  renderThumbsPendentes();
}

function renderThumbsPendentes() {
  const wrap = document.getElementById('pac-thumbs');
  wrap.innerHTML = '';
  fichasPendentes.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img alt="${esc(f.nome)}"><button type="button" class="rm-thumb" title="Remover">×</button>`;
    div.querySelector('img').src = f.dataUrl;
    div.querySelector('.rm-thumb').addEventListener('click', () => {
      fichasPendentes.splice(i, 1);
      renderThumbsPendentes();
    });
    wrap.appendChild(div);
  });
}

function setupFichasAntigas() {
  const modal = document.getElementById('modal-fichas');
  document.getElementById('btn-fichas-antigas')?.addEventListener('click', () => {
    if (!pacienteAtual) return;
    document.getElementById('modal-fichas-title').textContent = `Fichas antigas — ${pacienteAtual.nome}`;
    mostrarListaFichas();
    renderFichasList();
    modal.classList.remove('hidden');
  });
  document.getElementById('btn-fechar-fichas')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  document.getElementById('btn-voltar-fichas')?.addEventListener('click', mostrarListaFichas);

  const addInput = document.getElementById('fichas-add-input');
  addInput?.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    addInput.value = '';
    if (!files.length || !pacienteAtual) return;
    let enviadas = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) { showToast(`"${file.name}" não é uma imagem.`, 'error'); continue; }
      try {
        const dataUrl = await comprimirImagem(file);
        await apiFetch(`/ferida/pacientes/${pacienteAtual.id}/fichas-antigas`, {
          method: 'POST',
          body: JSON.stringify({ imagem: dataUrl, nome: file.name })
        });
        enviadas++;
      } catch (err) {
        showToast(`Falha em "${file.name}": ${err.message}`, 'error');
      }
    }
    if (enviadas) showToast(`${enviadas} ficha(s) anexada(s)`);
    fichasAntigas = await apiFetch(`/ferida/pacientes/${pacienteAtual.id}/fichas-antigas`);
    document.getElementById('fichas-count').textContent = fichasAntigas.length;
    renderFichasList();
  });
}

function mostrarListaFichas() {
  document.getElementById('fichas-lista-wrap').classList.remove('hidden');
  document.getElementById('ficha-viewer').classList.add('hidden');
}

function renderFichasList() {
  const list = document.getElementById('fichas-list');
  list.innerHTML = '';
  if (!fichasAntigas.length) {
    list.innerHTML = '<p class="fichas-empty">Nenhuma ficha antiga anexada.</p>';
    return;
  }
  fichasAntigas.forEach(f => {
    const quando = f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '—';
    const quem = f.createdByName ? ` · por ${f.createdByName}` : '';
    const row = document.createElement('div');
    row.className = 'ficha-row';
    row.innerHTML = `
      <span class="fic-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
      <div class="fic-info">
        <div class="fic-nome">${esc(f.nome)}</div>
        <div class="fic-meta">${esc(quando)}${esc(quem)}</div>
      </div>
      <button type="button" class="fic-btn fic-ver">Ver</button>
      <button type="button" class="fic-btn danger fic-excluir action-execute">Excluir</button>`;
    row.querySelector('.fic-ver').addEventListener('click', () => verFicha(f));
    row.querySelector('.fic-excluir').addEventListener('click', () => excluirFicha(f));
    list.appendChild(row);
  });
}

async function verFicha(meta) {
  try {
    const full = await apiFetch(`/ferida/pacientes/${pacienteAtual.id}/fichas-antigas/${meta.id}`);
    document.getElementById('ficha-viewer-img').src = full.imagem;
    const quando = full.createdAt ? new Date(full.createdAt).toLocaleString('pt-BR') : '—';
    document.getElementById('ficha-viewer-meta').textContent =
      `${full.nome} · anexada em ${quando}${full.createdByName ? ' por ' + full.createdByName : ''}`;
    document.getElementById('fichas-lista-wrap').classList.add('hidden');
    document.getElementById('ficha-viewer').classList.remove('hidden');
  } catch (err) {
    showToast('Erro ao abrir a ficha: ' + err.message, 'error');
  }
}

async function excluirFicha(meta) {
  if (!confirm(`Excluir a imagem "${meta.nome}" do paciente? Essa ação não tem volta.`)) return;
  try {
    await apiFetch(`/ferida/pacientes/${pacienteAtual.id}/fichas-antigas/${meta.id}`, { method: 'DELETE' });
    fichasAntigas = fichasAntigas.filter(f => f.id !== meta.id);
    document.getElementById('fichas-count').textContent = fichasAntigas.length;
    renderFichasList();
    showToast('Ficha antiga removida');
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ==========================================
// MAPA DO CORPO (assinatura da ficha)
// ==========================================

function setupBodyMap() {
  document.querySelectorAll('svg[data-region]').forEach(svg => {
    svg.addEventListener('click', e => {
      if (userLevel < 3) return;                          // leitura: não marca
      if (e.target.classList.contains('pin')) return;     // ignora cliques em pinos
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      addPin(svg, loc.x, loc.y, svg.dataset.region);
    });
  });
}

function addPin(svg, x, y, region) {
  pinCount++;
  const id = pinCount;
  const list = document.getElementById('pinlist');
  const g = svg.querySelector('.pins');

  const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  grp.dataset.id = id;
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 8); c.setAttribute('class', 'pin');
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('class', 'pinnum'); t.textContent = id;
  grp.appendChild(c); grp.appendChild(t); g.appendChild(grp);

  if (list.querySelector('.empty')) list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'pinrow';
  li.dataset.id = id;
  li.dataset.region = region;
  li.dataset.x = x.toFixed(2);
  li.dataset.y = y.toFixed(2);
  li.innerHTML = `<span class="dot">${id}</span><span class="reg">${esc(region)}</span>` +
    `<input type="text" placeholder="Nomear local (ex.: calcâneo D)" aria-label="Nome do local ${id}">` +
    `<button type="button" class="rm" title="Remover" aria-label="Remover marcação ${id}">×</button>`;
  list.appendChild(li);

  const hi = () => c.classList.add('pin-hi'), un = () => c.classList.remove('pin-hi');
  li.addEventListener('mouseenter', hi);
  li.addEventListener('mouseleave', un);
  li.querySelector('.rm').addEventListener('click', () => {
    grp.remove(); li.remove();
    if (!list.children.length) resetEmpty();
    markDirty();
  });
  li.querySelector('input').addEventListener('input', markDirty);
  markDirty();
}

function resetEmpty() {
  document.getElementById('pinlist').innerHTML =
    '<li class="empty">Nenhuma marcação ainda. Toque no corpo pra indicar onde está a ferida.</li>';
}

function coletarMarcacoes() {
  return [...document.querySelectorAll('#pinlist .pinrow')].map(li => ({
    numero: parseInt(li.dataset.id),
    regiao: li.dataset.region,
    x: parseFloat(li.dataset.x),
    y: parseFloat(li.dataset.y),
    rotulo: li.querySelector('input').value.trim()
  }));
}

// ==========================================
// CHIPS (multi e single)
// ==========================================

function setupChips() {
  document.querySelectorAll('.chips').forEach(group => {
    const single = group.hasAttribute('data-single');
    group.addEventListener('click', e => {
      if (userLevel < 3) return;
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (single) { group.querySelectorAll('.chip').forEach(c => { if (c !== chip) c.classList.remove('on'); }); }
      chip.classList.toggle('on');
      markDirty();
    });
    group.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('chip')) {
        e.preventDefault();
        e.target.click();
      }
    });
  });
}

function chipsSelecionados(field) {
  return [...document.querySelectorAll(`.chips[data-field="${field}"] .chip.on`)].map(c => c.textContent.trim());
}

function chipUnico(field) {
  const on = document.querySelector(`.chips[data-field="${field}"] .chip.on`);
  return on ? on.textContent.trim() : null;
}

// ==========================================
// FICHA: salvar / limpar / estado
// ==========================================

function setupFormListeners() {
  document.querySelectorAll('.ferida-content input, .ferida-content textarea')
    .forEach(el => el.addEventListener('input', markDirty));
  document.getElementById('btn-salvar')?.addEventListener('click', salvarAtendimento);
  document.getElementById('btn-limpar')?.addEventListener('click', () => {
    limparFicha();
    showToast('Formulário limpo');
  });
}

function markDirty() {
  dirty = true;
  document.getElementById('status').textContent = 'Rascunho não salvo';
}

function dim(id) {
  const v = document.getElementById(id).value.trim();
  return v === '' ? null : v;
}

async function salvarAtendimento() {
  if (!pacienteAtual) {
    showToast('Selecione o paciente antes de salvar.', 'error');
    return;
  }

  const payload = {
    dimensoes: {
      comprimento:  dim('dim-comprimento'),
      largura:      dim('dim-largura'),
      profundidade: dim('dim-profundidade'),
      descolamento: dim('dim-descolamento')
    },
    marcacoes: coletarMarcacoes(),
    tecido: chipsSelecionados('tecido'),
    bordas: chipsSelecionados('bordas'),
    exsudato: {
      tipo:         chipUnico('exsudatoTipo'),
      cor:          chipUnico('exsudatoCor'),
      consistencia: chipUnico('exsudatoConsistencia'),
      quantidade:   chipUnico('exsudatoQuantidade')
    },
    infeccaoSuperficial: chipsSelecionados('infeccaoSuperficial'),
    infeccaoProfunda:    chipsSelecionados('infeccaoProfunda'),
    biofilme: chipUnico('biofilme') === null ? null : chipUnico('biofilme') === 'Sim',
    conduta: document.getElementById('conduta').value.trim()
  };

  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await apiFetch(`/ferida/pacientes/${pacienteAtual.id}/atendimentos`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    dirty = false;
    document.getElementById('status').textContent =
      'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    showToast('Atendimento salvo');
    limparFicha(true);
    await selecionarPaciente(pacienteAtual.id);
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar atendimento';
  }
}

function limparFicha(manterStatus = false) {
  document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
  ['dim-comprimento', 'dim-largura', 'dim-profundidade', 'dim-descolamento']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('conduta').value = '';
  document.querySelectorAll('svg[data-region] .pins').forEach(g => g.innerHTML = '');
  pinCount = 0;
  resetEmpty();
  if (!manterStatus) {
    dirty = false;
    document.getElementById('status').textContent = 'Rascunho não salvo';
  }
}

// ==========================================
// HISTÓRICO / EVOLUÇÃO
// ==========================================

function areaDe(at) {
  const c = at?.dimensoes?.comprimento, l = at?.dimensoes?.largura;
  return (typeof c === 'number' && typeof l === 'number') ? c * l : null;
}

function fmtDim(v) {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : null;
}

function renderTimeline(temPaciente) {
  const tl = document.getElementById('timeline');
  tl.innerHTML = '';

  if (!temPaciente) {
    tl.innerHTML = '<div class="tl"><div class="what">Selecione um paciente para ver o histórico.</div></div>';
    return;
  }

  atendimentos.forEach((at, i) => {
    const quando = new Date(at.createdAt).toLocaleDateString('pt-BR');
    const c = fmtDim(at.dimensoes?.comprimento), l = fmtDim(at.dimensoes?.largura);
    const dims = (c && l) ? `${c} × ${l} cm` : 'sem medidas';

    const resumoPartes = [];
    if (at.tecido?.length) resumoPartes.push(at.tecido[0].toLowerCase());
    if (at.exsudato?.quantidade) resumoPartes.push(`exsudato ${at.exsudato.quantidade.toLowerCase()}`);
    const resumo = resumoPartes.length ? ' · ' + esc(resumoPartes.join(', ')) : '';

    let trend;
    if (i === 0) {
      trend = '<span class="trend flat">1º registro</span>';
    } else {
      const aAtual = areaDe(at), aAnterior = areaDe(atendimentos[i - 1]);
      if (aAtual === null || aAnterior === null) trend = '';
      else if (aAtual < aAnterior) trend = '<span class="trend up">melhora</span>';
      else if (aAtual > aAnterior) trend = '<span class="trend down">piora</span>';
      else trend = '<span class="trend flat">estável</span>';
    }

    const quem = at.createdByName ? `<span class="who">por ${esc(at.createdByName)}</span>` : '';

    const row = document.createElement('div');
    row.className = 'tl';
    row.innerHTML = `<div class="when">${esc(quando)}</div><div class="what"><b>${esc(dims)}</b>${resumo} ${trend}${quem}</div>`;
    tl.appendChild(row);
  });

  const hoje = document.createElement('div');
  hoje.className = 'tl';
  hoje.innerHTML = '<div class="when">Hoje</div><div class="what"><b>em preenchimento…</b></div>';
  tl.appendChild(hoje);
}

// ==========================================
// TOAST
// ==========================================

let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}
