import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, 
  onSnapshot, query, orderBy, where, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

import { firebaseConfig } from "../firebase-config.js";
import { setupLayout } from "../layout.js";
import { getRoleConfig } from "../permissions.js";
import { secureAction, sanitizeHTML } from "../security.js";

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

let currentUser = null;
let currentRole = null;

// ================================================================
//  AUTH GUARD & INIT
// ================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    currentRole = 'ti';
    if (snap.exists()) currentRole = snap.data().role || 'ti';

    initApp(user, currentRole);
  } else {
    window.location.href = '../login.html';
  }
});

async function initApp(user, role) {
  setupLayout(user, role, 'dashboard', async () => {
    await signOut(auth);
    window.location.href = '../login.html';
  });

  renderWidgets(role);
  setupNotes();
  setupNotices(role);
  setupEventListeners();
}

// ================================================================
//  WIDGETS (CONFORME PERMISSÃO)
// ================================================================
async function renderWidgets(role) {
  const container = document.getElementById('widgets-grid');
  container.innerHTML = '';
  
  const roleConfig = getRoleConfig(role);
  const modules = roleConfig.modules;

  // Widget Empréstimos
  if (modules.includes('emprestimo')) {
    const card = createWidgetCard('📦', 'Empréstimos Ativos', '0', 'emprestimo');
    container.appendChild(card);
    // TODO: Buscar contagem real na coleção 'items' onde status == 'Cedido'
  }

  // Widget Usuários
  if (modules.includes('usuarios')) {
    const card = createWidgetCard('👥', 'Usuários Ativos', '...', 'usuarios');
    container.appendChild(card);
    const snap = await getDocs(collection(db, 'users'));
    card.querySelector('.widget-value').textContent = snap.size;
  }

  // Widget Ensalamento
  if (modules.includes('ensalamento')) {
    const card = createWidgetCard('🏫', 'Salas em Uso', '0', 'ensalamento');
    container.appendChild(card);
    // TODO: Buscar contagem real na coleção 'ensalamento'
  }

  // Widget Carga Horária
  if (modules.includes('carga-horaria')) {
    const card = createWidgetCard('⏰', 'Eventos do Mês', '0', 'carga-horaria');
    container.appendChild(card);
  }

  // Widget Administração (Só N1)
  if (role === 'adm_l1') {
    const card = createWidgetCard('🛡️', 'Admin Status', 'Ativo', 'dashboard');
    container.appendChild(card);
  }
}

function createWidgetCard(icon, label, value, modId) {
  const div = document.createElement('div');
  div.className = 'widget-card';
  div.innerHTML = `
    <div class="widget-icon">${icon}</div>
    <div class="widget-info">
      <span class="widget-label">${label}</span>
      <span class="widget-value">${value}</span>
    </div>
  `;
  return div;
}

// ================================================================
//  QUADRO DO FUNCIONÁRIO (POST-ITS)
// ================================================================
function setupNotes() {
  const notesGrid = document.getElementById('notes-grid');
  const notesRef = collection(db, 'users', currentUser.uid, 'notes');
  // Simplificar consulta para evitar erro de índice composto
  const q = query(notesRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snap) => {
    notesGrid.innerHTML = '';
    if (snap.empty) {
      notesGrid.innerHTML = '<div class="loading-state">Nenhuma nota criada. Que tal começar agora?</div>';
      return;
    }

    const allNotes = [];
    snap.forEach(docSnap => allNotes.push({ id: docSnap.id, ...docSnap.data() }));

    // Ordenar manualmente: Pinned primeiro
    allNotes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    allNotes.forEach(note => {
      const id = note.id;
      const card = document.createElement('div');
      card.className = `note-card ${note.pinned ? 'pinned' : ''}`;
      card.style.backgroundColor = note.color || '#fef9c3';
      
      // Posicionamento livre
      if (note.x !== undefined && note.y !== undefined) {
        card.style.position = 'absolute';
        card.style.left = note.x + 'px';
        card.style.top = note.y + 'px';
        card.style.margin = '0';
      }

      card.innerHTML = `
        ${note.pinned ? '<span class="pin-indicator">📌</span>' : ''}
        <div class="note-title">${esc(note.title || 'Sem título')}</div>
        <div class="note-text-display">${note.text || ''}</div>
        <div class="note-actions">
          <button class="note-btn btn-pin" title="${note.pinned ? 'Desafixar' : 'Fixar'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c-5.07 0-9.17-4.1-9.17-9.17"/><path d="M10 21c0-5.07-4.1-9.17-9.17-9.17"/></svg>
          </button>
          <button class="note-btn btn-edit" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="note-btn btn-delete" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      `;

      // Drag Logic
      setupDraggable(card, id);

      card.querySelector('.btn-pin').onclick = (e) => { e.stopPropagation(); togglePinNote(id, note.pinned); };
      card.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); openNoteModal(id, note); };
      card.querySelector('.btn-delete').onclick = (e) => { e.stopPropagation(); deleteNote(id); };

      notesGrid.appendChild(card);
    });
  });
}

async function saveNote(e) {
  e.preventDefault();
  const id = document.getElementById('note-id').value;
  const title = document.getElementById('note-title').value.trim();
  const rawText = document.getElementById('note-text').innerHTML;
  const text = sanitizeHTML(rawText);
  const color = document.querySelector('input[name="note-color"]:checked').value;

  if (!text || text === '<br>') return;

  const noteData = {
    title,
    text,
    color,
    updatedAt: serverTimestamp()
  };

  try {
    await secureAction(currentUser.uid, async () => {
      if (id) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'notes', id), noteData);
      } else {
        noteData.pinned = false;
        noteData.x = 20 + (Math.random() * 50);
        noteData.y = 20 + (Math.random() * 50);
        noteData.createdAt = serverTimestamp();
        await setDoc(doc(collection(db, 'users', currentUser.uid, 'notes')), noteData);
      }
    });
    fecharModal('modal-note');
  } catch (err) {
    if (err.message.includes("Rate limit")) return; // Alerta já mostrado pelo security.js
    alert("Erro ao salvar nota: " + err.message);
  }
}

function setupDraggable(el, id) {
  let isDragging = false;
  let startX, startY;

  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.note-actions')) return;
    isDragging = true;
    startX = e.clientX - el.offsetLeft;
    startY = e.clientY - el.offsetTop;
    el.style.zIndex = '1000';
    el.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const canvas = document.getElementById('notes-grid');
    const rect = canvas.getBoundingClientRect();
    
    let x = e.clientX - startX;
    let y = e.clientY - startY;

    // Limitar movimento ao canvas
    const maxX = rect.width - el.offsetWidth;
    const maxY = rect.height - el.offsetHeight;
    
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    el.style.position = 'absolute';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });

  document.addEventListener('mouseup', async () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = 'default';
    el.style.zIndex = '10';

    const x = parseInt(el.style.left);
    const y = parseInt(el.style.top);

    try {
      await secureAction(currentUser.uid, async () => {
        await updateDoc(doc(db, 'users', currentUser.uid, 'notes', id), { x, y });
      });
    } catch (err) {
      console.error("Erro ao salvar posição:", err);
    }
  });
}

async function togglePinNote(id, current) {
  await updateDoc(doc(db, 'users', currentUser.uid, 'notes', id), { pinned: !current });
}

async function deleteNote(id) {
  if (confirm("Deseja excluir esta nota?")) {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'notes', id));
  }
}

function openNoteModal(id = '', data = null) {
  document.getElementById('form-note').reset();
  document.getElementById('note-id').value = id;
  document.getElementById('note-modal-title').textContent = id ? 'Editar Nota' : 'Nova Nota';
  
  if (data) {
    document.getElementById('note-title').value = data.title || '';
    document.getElementById('note-text').innerHTML = data.text || '';
    const radio = document.querySelector(`input[name="note-color"][value="${data.color}"]`);
    if (radio) radio.checked = true;
  } else {
    document.getElementById('note-text').innerHTML = '';
  }
  
  abrirModal('modal-note');
}

// FORMATAÇÃO RICH TEXT
window.formatDoc = (cmd, val = null) => {
  document.execCommand(cmd, false, val);
  document.getElementById('note-text').focus();
};

// ================================================================
//  QUADRO DE AVISOS (INSTITUCIONAL)
// ================================================================
function setupNotices(role) {
  const noticesList = document.getElementById('notices-list');
  const btnManage = document.getElementById('btn-new-notice');
  
  // Liberar para N1 e N2
  const canManage = (role === 'adm_l1' || role === 'adm_l2');
  if (canManage) btnManage.classList.remove('hidden');

  const noticesRef = collection(db, 'institutionalNotices');
  // Simplificar consulta para evitar erro de índice composto
  const q = query(noticesRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snap) => {
    noticesList.innerHTML = '';
    
    const activeNotices = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.active) activeNotices.push({ id: docSnap.id, ...data });
    });

    if (activeNotices.length === 0) {
      noticesList.innerHTML = '<div class="loading-state">Nenhum aviso no momento.</div>';
      return;
    }

    activeNotices.forEach(notice => {
      const id = notice.id;
      const card = document.createElement('div');
      card.className = `notice-card priority-${notice.priority}`;
      card.innerHTML = `
        <div class="notice-title">${esc(notice.title)}</div>
        <div class="notice-message">${esc(notice.message)}</div>
        <div class="notice-meta">
          <span>${notice.createdAt ? new Date(notice.createdAt.toDate()).toLocaleDateString('pt-BR') : 'Agora'}</span>
          ${canManage ? `
            <div class="notice-admin-actions">
              <button class="btn-edit-notice" title="Editar">Editar</button>
              <button class="btn-delete-notice" title="Excluir">Excluir</button>
            </div>
          ` : ''}
        </div>
      `;
      
      if (canManage) {
        card.querySelector('.btn-edit-notice').onclick = () => openNoticeModal(id, notice);
        card.querySelector('.btn-delete-notice').onclick = () => deleteNotice(id, notice.title);
      }

      noticesList.appendChild(card);
    });
  });
}

async function saveNotice(e) {
  e.preventDefault();
  const id = document.getElementById('notice-id').value;
  const title = document.getElementById('notice-title').value.trim();
  const message = document.getElementById('notice-message').value.trim();
  const priority = document.getElementById('notice-priority').value;

  const data = {
    title, message, priority,
    active: true,
    updatedAt: serverTimestamp(),
    createdBy: currentUser.uid
  };

  try {
    if (id) {
      await updateDoc(doc(db, 'institutionalNotices', id), data);
    } else {
      data.createdAt = serverTimestamp();
      await setDoc(doc(collection(db, 'institutionalNotices')), data);
    }
    fecharModal('modal-notice');
  } catch (err) {
    alert("Erro ao salvar aviso: " + err.message);
  }
}

async function deleteNotice(id, title) {
  if (confirm(`Deseja excluir permanentemente o aviso "${title}"?`)) {
    try {
      await deleteDoc(doc(db, 'institutionalNotices', id));
    } catch (err) {
      alert("Erro ao excluir: " + err.message);
    }
  }
}

function openNoticeModal(id = '', data = null) {
  document.getElementById('form-notice').reset();
  document.getElementById('notice-id').value = id;
  if (data) {
    document.getElementById('notice-title').value = data.title;
    document.getElementById('notice-message').value = data.message;
    document.getElementById('notice-priority').value = data.priority;
  }
  abrirModal('modal-notice');
}

// ================================================================
//  HELPERS & EVENTS
// ================================================================
function setupEventListeners() {
  document.getElementById('btn-new-note').onclick = () => openNoteModal();
  document.getElementById('btn-new-notice').onclick = () => openNoticeModal();
  document.getElementById('form-note').onsubmit = saveNote;
  document.getElementById('form-notice').onsubmit = saveNotice;
}

window.abrirModal = (id) => document.getElementById(id).classList.add('active');
window.fecharModal = (id) => document.getElementById(id).classList.remove('active');

function esc(str) {
  if (!str) return "";
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function getDocs(colRef) {
  const { getDocs: getDocsOrig } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
  return await getDocsOrig(colRef);
}
