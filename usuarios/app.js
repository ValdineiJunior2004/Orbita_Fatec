// ================================================================
//  ÓRBITA — MÓDULO USUÁRIOS
//  Gestão completa: criar, listar, editar role, deletar
//  Técnica: Secondary Firebase App para criar usuários sem deslogar o ADM
// ================================================================
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAnalytics }             from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

import { firebaseConfig } from "../firebase-config.js";
import { setupLayout } from "../layout.js";


const fbApp    = initializeApp(firebaseConfig);
const analytics = getAnalytics(fbApp);
const auth     = getAuth(fbApp);
const db       = getFirestore(fbApp);

// ---- State ----
let currentUser = null;
let currentRole = null;
let allUsers    = [];
let allRoles    = [];
let globalPermissions = {}; // Carregado do Firestore (config/permissions)
let activeRoleTab     = 'adm_l2';

// ---- Elements ----
const authGuard    = document.getElementById('auth-guard');
const mainContent  = document.getElementById('main-content');
const userCount    = document.getElementById('user-count');
const searchInput  = document.getElementById('search-users');
const userList     = document.getElementById('user-list');

// Função de escape para prevenir XSS
const esc = (str) => String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

// ================================================================
//  AUTH GUARD — Só ADM entra
// ================================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = '/login'; return; }

  currentUser = user;
  const name  = user.displayName || user.email.split('@')[0];

  // Busca role e permissões do usuário
  try {
    // 1. Busca role do usuário
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : { role: 'visitante' };
    currentRole = userData.role || 'visitante';

    // 2. AUTO-PROMOÇÃO (Migração)
    if (user.uid === 'rSw36LAa8fPI94aYFoVv7JggB6w2' && currentRole !== 'adm_l1') {
      await updateDoc(doc(db, 'users', user.uid), { role: 'adm_l1' });
      currentRole = 'adm_l1';
    }

    // 3. BUSCA PERMISSÕES GLOBAIS (O TI agora depende disso)
    let perms = { view: false, execute: false };
    const permSnap = await getDoc(doc(db, 'config', 'permissions'));
    if (permSnap.exists()) {
      const globalData = permSnap.data();
      const rolePerms = globalData[currentRole] || {};
      perms = rolePerms['usuarios'] || { view: false, execute: false };
    }

    // ADM L1 entra direto. Outros precisam de permissão 'view' vinda do Config Global.
    if (currentRole !== 'adm_l1' && !perms.view) {
      authGuard.classList.remove('hidden');
      return;
    }

    // Se não tiver permissão 'execute', bloqueia ações de edição/delete
    if (currentRole !== 'adm_l1' && !perms.execute) {
      document.body.classList.add('hide-execute');
    }
  } catch (err) { 
    console.error("Erro auth guard:", err);
    authGuard.classList.remove('hidden');
    return;
  }

  // Inicializar o novo Layout
  setupLayout(user, currentRole, 'usuarios', async () => {
    await signOut(auth);
    window.location.href = '/login.html';
  });

  mainContent.classList.remove('hidden');
  initPage();
});

// ================================================================
//  INIT
// ================================================================
function initPage() {
  loadUsers();
  loadRoles();
  loadGlobalPermissions();
  setupModals();
  setupPermissionTabs();
  searchInput.addEventListener('input', filterUsers);
  document.getElementById('search-roles')?.addEventListener('input', filterRoles);
  document.getElementById('btn-save-global-perms').addEventListener('click', saveGlobalPermissions);
  document.getElementById('btn-novo-cargo')?.addEventListener('click', abrirModalNovoCargo);
  
  setupMainTabs();
}

// ================================================================
//  LOAD USERS (realtime)
// ================================================================
function loadUsers() {
  const colRef = collection(db, 'users');
  onSnapshot(colRef, (snap) => {
    allUsers = [];
    snap.forEach(d => allUsers.push({ uid: d.id, ...d.data() }));
    allUsers.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    renderUsers(allUsers);
  });
}

function filterUsers() {
  const q = searchInput.value.toLowerCase();
  const filtered = allUsers.filter(u =>
    (u.name  || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q)
  );
  renderUsers(filtered);
}

function loadRoles() {
  const colRef = collection(db, 'roles');
  onSnapshot(colRef, async (snap) => {
    if (snap.empty) {
      // Se não houver cargos, popula com os padrões
      const defaults = [
        { id: 'adm_l1',    name: 'ADM N1 - Sênior/Dev' },
        { id: 'adm_l2',    name: 'ADM N2 - Setor/Chefia' },
        { id: 'ti',        name: 'TI - Suporte' },
        { id: 'visitante', name: 'Visitante - Consulta' },
        { id: 'rh',        name: 'RH - Recursos Humanos' }
      ];
      for (const r of defaults) {
        await setDoc(doc(db, 'roles', r.id), { name: r.name });
      }
      return; // O onSnapshot disparará novamente após o setDoc
    }

    allRoles = [];
    snap.forEach(d => allRoles.push({ id: d.id, ...d.data() }));
    allRoles.sort((a, b) => a.name.localeCompare(b.name));
    renderRoles(allRoles);
    updateRoleSelects();
  });
}

function filterRoles() {
  const q = document.getElementById('search-roles').value.toLowerCase();
  const filtered = allRoles.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  renderRoles(filtered);
}

function updateRoleSelects() {
  // Update ROLE_LABEL dynamically
  allRoles.forEach(r => {
    ROLE_LABEL[r.id] = r.name;
  });

  // Update Role Select in Permissions Tab
  const select = document.getElementById('role-select');
  if (select) {
    const currentVal = select.value;
    select.innerHTML = allRoles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    if (allRoles.some(r => r.id === currentVal)) select.value = currentVal;
    else if (allRoles.length > 0) select.value = allRoles[0].id;
    activeRoleTab = select.value;
  }

  const roleIcons = {
    adm_l1: '💎',
    adm_l2: '🛡️',
    ti: '🔧',
    visitante: '👤',
    rh: '👥',
    default: '💼'
  };

  const roleDescs = {
    adm_l1: 'Sênior/Dev',
    adm_l2: 'Setor/Chefia',
    ti: 'Suporte',
    visitante: 'Consulta',
    rh: 'Recursos Humanos',
    default: 'Cargo Personalizado'
  };

  const renderRoleOption = (r, nameAttr) => `
    <label class="role-option">
      <input type="radio" name="${nameAttr}" value="${r.id}" required>
      <div class="role-card">
        <span class="role-icon">${roleIcons[r.id] || roleIcons.default}</span>
        <strong>${esc(r.name)}</strong>
        <small>${roleDescs[r.id] || roleDescs.default}</small>
      </div>
    </label>
  `;

  // Update Role options in Create User Modal
  const roleRadios = document.getElementById('novo-role-options');
  if (roleRadios) {
    roleRadios.innerHTML = allRoles.map(r => renderRoleOption(r, 'novo-role')).join('');
  }

  // Update Role options in Edit User Modal
  const editRadios = document.getElementById('edit-role-options');
  if (editRadios) {
    editRadios.innerHTML = allRoles.map(r => renderRoleOption(r, 'edit-role')).join('');
  }
}

function renderRoles(list) {
  const container = document.getElementById('roles-list');
  if (!container) return;
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><p>Nenhum cargo cadastrado.</p></div>`;
    return;
  }

  list.forEach(role => {
    const card = document.createElement('div');
    card.className = 'role-item-card';
    card.innerHTML = `
      <div class="role-item-info">
        <div class="role-item-name">${esc(role.name)}</div>
        <div class="role-item-id">ID: ${esc(role.id)}</div>
      </div>
      <div class="role-item-actions">
        <button class="icon-btn delete-role-btn" data-id="${role.id}" data-name="${role.name}" title="Excluir cargo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    `;
    card.querySelector('.delete-role-btn').onclick = () => confirmarExcluirCargo(role.id, role.name);
    container.appendChild(card);
  });
}

async function confirmarExcluirCargo(id, name) {
  if (id === 'adm_l1') {
    showToast("❌ O cargo ADM N1 não pode ser excluído.", "error");
    return;
  }
  if (!confirm(`Deseja excluir permanentemente o cargo "${name}"?\nIsso pode afetar usuários vinculados.`)) return;

  try {
    await deleteDoc(doc(db, 'roles', id));
    showToast(`🗑️ Cargo ${name} removido.`, "success");
  } catch (err) {
    showToast(`❌ Erro ao excluir: ${err.message}`, "error");
  }
}

// ================================================================
//  RENDER
// ================================================================
// ================================================================
//  RENDER
// ================================================================
const ROLE_LABEL = { 
  adm_l1: 'ADM N1', 
  adm_l2: 'ADM N2', 
  ti: 'TI', 
  visitante: 'Visitante',
  rh: 'RH'
};

const MODULES = [
  { id: 'emprestimo',    name: 'Empréstimos',   icon: '📦' },
  { id: 'usuarios',     name: 'Usuários',     icon: '👥' },
  { id: 'ensalamento',  name: 'Ensalamento',  icon: '🏫' },
  { id: 'carga-horaria',name: 'Carga Horária',icon: '⏰' }
];

function renderUsers(list) {
  userCount.textContent = `${allUsers.length} usuário${allUsers.length !== 1 ? 's' : ''}`;
  userList.innerHTML    = '';

  if (!list.length) {
    userList.innerHTML = `<div class="empty-state"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>Nenhum usuário encontrado.</p></div>`;
    return;
  }

  list.forEach((u, idx) => {
    const isSelf   = u.uid === currentUser.uid;
    const role     = u.role || 'ti';
    const initial  = (u.name || u.email || '?').charAt(0).toUpperCase();
    const dateStr  = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—';

    const card = document.createElement('div');
    card.className = 'user-card';
    card.style.animationDelay = `${idx * 0.04}s`;
    card.innerHTML = `
      <div class="user-card-avatar avatar-${role.startsWith('adm') ? 'adm' : role}">${esc(initial)}</div>
      <div class="user-card-info">
        <div class="user-card-name">${esc(u.name || '(sem nome)')}</div>
        <div class="user-card-email">${esc(u.email || u.uid)}</div>
        <div class="user-card-meta">
          <span class="role-badge badge-${role}">${ROLE_LABEL[role] || role}</span>
          <span class="user-card-date">Desde ${dateStr}</span>
          ${isSelf ? '<span class="user-card-date">· você</span>' : ''}
        </div>
      </div>
      <div class="user-card-actions">
        <button class="icon-btn edit-btn action-execute ${isSelf ? 'self-btn' : ''}"
          data-uid="${u.uid}" data-name="${u.name || u.email}" data-role="${role}" data-email="${u.email || ''}"
          title="Editar usuário" ${isSelf ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn delete-btn action-execute ${isSelf ? 'self-btn' : ''}"
          data-uid="${u.uid}" data-name="${u.name || u.email}"
          title="Remover usuário" ${isSelf ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    `;
    userList.appendChild(card);
  });

  // Delegation
  userList.querySelectorAll('.edit-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => abrirModalEditar(btn.dataset.uid, btn.dataset.name, btn.dataset.role, btn.dataset.email));
  });
  userList.querySelectorAll('.delete-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => confirmarDelete(btn.dataset.uid, btn.dataset.name));
  });
}

// ================================================================
//  MODALS SETUP
// ================================================================
function setupModals() {
  // Modal Novo
  const btnNovo = document.getElementById('btn-novo-usuario');
  if (btnNovo) btnNovo.addEventListener('click', () => abrirModalNovo());
  
  document.getElementById('btn-fechar-novo').addEventListener('click',  () => fecharModal('modal-novo'));
  document.getElementById('btn-cancelar-novo').addEventListener('click',() => fecharModal('modal-novo'));
  document.getElementById('form-novo-usuario').addEventListener('submit', criarUsuario);

  // Toggle senha
  document.getElementById('toggle-pw').addEventListener('click', () => {
    const inp = document.getElementById('novo-senha');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
  });

  // Modal Editar
  document.getElementById('btn-fechar-editar').addEventListener('click',   () => fecharModal('modal-editar'));
  document.getElementById('btn-cancelar-editar').addEventListener('click', () => fecharModal('modal-editar'));
  document.getElementById('btn-salvar-role').addEventListener('click',     salvarRole);
  document.getElementById('btn-send-reset').addEventListener('click',      enviarResetSenha);

  // Modal Cargo
  document.getElementById('btn-fechar-cargo').addEventListener('click',   () => fecharModal('modal-cargo'));
  document.getElementById('btn-cancelar-cargo').addEventListener('click', () => fecharModal('modal-cargo'));
  document.getElementById('form-novo-cargo').addEventListener('submit', salvarNovoCargo);
}

function abrirModalNovoCargo() {
  document.getElementById('form-novo-cargo').reset();
  document.getElementById('cargo-error').classList.add('hidden');
  abrirModal('modal-cargo');
}

async function salvarNovoCargo(e) {
  e.preventDefault();
  const nome = document.getElementById('cargo-nome').value.trim();
  const id = document.getElementById('cargo-id').value.trim().toLowerCase().replace(/\s+/g, '_');
  const errEl = document.getElementById('cargo-error');
  const btn = document.getElementById('btn-salvar-cargo');

  if (!id.match(/^[a-z0-9_]+$/)) {
    errEl.textContent = "ID inválido. Use apenas letras, números e sublinhados.";
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  document.getElementById('cargo-salvar-text').textContent = "Criando...";

  try {
    const docRef = doc(db, 'roles', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      throw new Error("Este ID de cargo já existe.");
    }

    await setDoc(docRef, { name: nome });
    
    // Inicializar permissões padrão para o novo cargo
    const permSnap = await getDoc(doc(db, 'config', 'permissions'));
    if (permSnap.exists()) {
      const perms = permSnap.data();
      perms[id] = {
        emprestimo: {view: true, execute: false},
        usuarios: {view: false, execute: false},
        ensalamento: {view: true, execute: false},
        'carga-horaria': {view: false, execute: false}
      };
      await setDoc(doc(db, 'config', 'permissions'), perms);
    }

    fecharModal('modal-cargo');
    showToast(`✅ Cargo ${nome} criado!`, 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    document.getElementById('cargo-salvar-text').textContent = "Criar Cargo";
  }
}

function abrirModalNovo() {
  document.getElementById('form-novo-usuario').reset();
  document.getElementById('form-error').classList.add('hidden');
  abrirModal('modal-novo');
}

function abrirModalEditar(uid, name, role, email) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;

  document.getElementById('edit-uid').value         = uid;
  document.getElementById('edit-email').value       = email || '';
  document.getElementById('edit-user-name').textContent = `👤 ${name} ${email ? '· ' + email : ''}`;
  
  // Set role
  const radio = document.querySelector(`input[name="edit-role"][value="${role}"]`);
  if (radio) radio.checked = true;

  abrirModal('modal-editar');
}

// ================================================================
//  GLOBAL PERMISSIONS LOGIC
// ================================================================
async function loadGlobalPermissions() {
  try {
    const snap = await getDoc(doc(db, 'config', 'permissions'));
    if (snap.exists()) {
      globalPermissions = snap.data();
    } else {
      // Configuração inicial padrão
      globalPermissions = {
        adm_l2:    { emprestimo:{view:true, execute:false}, usuarios:{view:true, execute:false}, ensalamento:{view:true, execute:false}, 'carga-horaria':{view:true, execute:true} },
        ti:        { emprestimo:{view:true, execute:true},  usuarios:{view:false,execute:false}, ensalamento:{view:true, execute:true},  'carga-horaria':{view:false,execute:false} },
        visitante: { emprestimo:{view:true, execute:false}, usuarios:{view:false,execute:false}, ensalamento:{view:true, execute:false},  'carga-horaria':{view:false,execute:false} },
        rh:        { emprestimo:{view:false,execute:false}, usuarios:{view:false,execute:false}, ensalamento:{view:false,execute:false}, 'carga-horaria':{view:true, execute:true} }
      };
    }
    renderPermissionsGrid('global-permissions-grid', globalPermissions[activeRoleTab] || {});
  } catch (err) {
    console.error("Erro ao carregar permissões:", err);
  }
}

function setupPermissionTabs() {
  const roleSelect = document.getElementById('role-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      activeRoleTab = e.target.value;
      renderPermissionsGrid('global-permissions-grid', globalPermissions[activeRoleTab] || {});
    });
    // Trigger initial render for the first option
    activeRoleTab = roleSelect.value;
  }
}

function setupMainTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate all
      tabBtns.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      
      // Activate clicked
      btn.classList.add('active');
      
      const targetId = `tab-${btn.dataset.tab}`;
      const targetTab = document.getElementById(targetId);
      if (targetTab) {
        targetTab.classList.add('active');
        targetTab.style.display = 'block';
      }
    });
  });
}

async function saveGlobalPermissions() {
  const btn = document.getElementById('btn-save-global-perms');
  btn.disabled = true; btn.textContent = 'Salvando...';

  // Collect from grid
  const rolePerms = {};
  document.querySelectorAll('#global-permissions-grid .perm-card').forEach(card => {
    const modId = card.querySelector('input[data-type="view"]').dataset.mod;
    rolePerms[modId] = {
      view: card.querySelector('input[data-type="view"]').checked,
      execute: card.querySelector('input[data-type="execute"]').checked
    };
  });

  globalPermissions[activeRoleTab] = rolePerms;

  try {
    await setDoc(doc(db, 'config', 'permissions'), globalPermissions);
    showToast('✅ Permissões globais atualizadas!', 'success');
  } catch (err) {
    showToast('❌ Erro ao salvar permissões: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Salvar Configurações';
  }
}

function renderPermissionsGrid(containerId, currentPerms) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  MODULES.forEach(mod => {
    const perm = currentPerms[mod.id] || { view: false, execute: false };
    const card = document.createElement('div');
    card.className = `perm-card ${perm.view ? 'active' : ''}`;
    card.innerHTML = `
      <div class="perm-card-title">${mod.icon} ${mod.name}</div>
      <div class="perm-options">
        <label class="perm-checkbox">
          <input type="checkbox" data-mod="${mod.id}" data-type="view" ${perm.view ? 'checked' : ''}>
          Ver
        </label>
        <label class="perm-checkbox ${!perm.view ? 'disabled' : ''}">
          <input type="checkbox" data-mod="${mod.id}" data-type="execute" ${perm.execute ? 'checked' : ''} ${!perm.view ? 'disabled' : ''}>
          Executar
        </label>
      </div>
    `;

    const viewCheck = card.querySelector('input[data-type="view"]');
    const execCheck = card.querySelector('input[data-type="execute"]');
    const execLabel = card.querySelector('.perm-checkbox:nth-child(2)');

    viewCheck.addEventListener('change', () => {
      if (!viewCheck.checked) {
        execCheck.checked = false;
        execCheck.disabled = true;
        execLabel.classList.add('disabled');
        card.classList.remove('active');
      } else {
        execCheck.disabled = false;
        execLabel.classList.remove('disabled');
        card.classList.add('active');
      }
    });

    container.appendChild(card);
  });
}

function abrirModal(id)  { document.getElementById(id).classList.add('active'); }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); }

// ================================================================
//  CRIAR USUÁRIO (Secondary App)
// ================================================================
async function criarUsuario(e) {
  e.preventDefault();

  const nome  = document.getElementById('novo-nome').value.trim();
  const email = document.getElementById('novo-email').value.trim();
  const senha = document.getElementById('novo-senha').value;
  const role  = document.querySelector('input[name="novo-role"]:checked')?.value || 'ti';
  
  const errEl = document.getElementById('form-error');
  const btn   = document.getElementById('btn-salvar-novo');
  const text  = document.getElementById('salvar-text');
  const spin  = document.getElementById('salvar-spinner');

  errEl.classList.add('hidden');
  btn.disabled  = true;
  text.textContent = 'Criando...';
  spin.classList.remove('hidden');

  try {
    // Cria instância secundária para não deslogar o ADM atual
    const secondaryApp  = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    await updateProfile(cred.user, { displayName: nome });

    const uid = cred.user.uid;

    // Salva no Firestore
    await setDoc(doc(db, 'users', uid), {
      uid,
      name:      nome,
      email,
      role,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.uid
    });

    // Fecha instância secundária
    await secondaryAuth.signOut();
    await deleteApp(secondaryApp);

    fecharModal('modal-novo');
    showToast(`✅ ${nome} criado com sucesso!`, 'success');

  } catch (err) {
    const msgs = {
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/invalid-email':        'E-mail inválido.',
      'auth/weak-password':        'Senha muito fraca. Use pelo menos 6 caracteres.',
    };
    errEl.textContent = msgs[err.code] || `Erro: ${err.message}`;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    text.textContent = 'Criar Usuário';
    spin.classList.add('hidden');
  }
}

// ================================================================
//  ALTERAR ROLE
// ================================================================
async function salvarRole() {
  const uid     = document.getElementById('edit-uid').value;
  const newRole = document.querySelector('input[name="edit-role"]:checked')?.value;
  if (!uid || !newRole) return;

  const btn = document.getElementById('btn-salvar-role');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await updateDoc(doc(db, 'users', uid), { 
      role: newRole
    });
    showToast(`✅ Nível alterado para ${ROLE_LABEL[newRole]}`, 'success');
  } catch (err) {
    showToast(`❌ Erro ao salvar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Salvar Nível';
  }
}

// ================================================================
//  ENVIAR E-MAIL DE RESET DE SENHA
// ================================================================
async function enviarResetSenha() {
  const email = document.getElementById('edit-email').value;
  if (!email) { showToast('❌ E-mail não encontrado.', 'error'); return; }

  const btn = document.getElementById('btn-send-reset');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    await sendPasswordResetEmail(auth, email);
    showToast(`✅ Link de redefinição enviado para ${email}`, 'success');
  } catch (err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Enviar E-mail';
  }
}

// ================================================================
//  DELETAR USUÁRIO
// ================================================================
async function confirmarDelete(uid, name) {
  const confirmado = confirm(`Remover "${name}" do sistema?\n\nO usuário perderá o acesso imediatamente.\n(A conta de e-mail no Firebase Auth é mantida)`);
  if (!confirmado) return;

  try {
    await deleteDoc(doc(db, 'users', uid));
    showToast(`🗑️ ${name} removido do sistema.`, 'success');
  } catch (err) {
    showToast(`❌ Erro ao remover: ${err.message}`, 'error');
  }
}

// ================================================================
//  TOAST
// ================================================================
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast toast-${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}
