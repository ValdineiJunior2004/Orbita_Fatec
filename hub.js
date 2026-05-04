import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { setupLayout } from "./layout.js";
import { MODULES, getRoleConfig } from "./permissions.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    let role = 'ti';
    if (snap.exists()) role = snap.data().role || 'ti';

    // AUTO-PROMOÇÃO PARA ADM NÍVEL 1 (Migração)
    if (user.uid === 'rSw36LAa8fPI94aYFoVv7JggB6w2' && role !== 'adm_l1') {
      await updateDoc(doc(db, 'users', user.uid), { role: 'adm_l1' });
      role = 'adm_l1';
    }

    initDashboard(user, role);
  } else {
    window.location.href = '/login.html';
  }
});

async function initDashboard(user, role) {
  // Configura layout base e validação de tela
  setupLayout(user, role, 'dashboard', async () => {
    await signOut(auth);
    window.location.href = '/login.html';
  });

  // Bem-vindo
  const name = user.displayName || user.email.split('@')[0];
  const welcomeName = document.getElementById('welcome-name');
  if (welcomeName) welcomeName.textContent = name;

  // Preencher Acesso Rápido
  const quickAccessGrid = document.getElementById('quick-access-grid');
  const roleConfig = getRoleConfig(role);
  
  if (quickAccessGrid) {
    roleConfig.modules.forEach(modKey => {
      if (modKey === 'dashboard') return;
      const mod = MODULES[modKey];
      if (!mod) return;

      const card = document.createElement('a');
      card.href = mod.url;
      card.className = 'quick-card';
      card.innerHTML = `
        <div class="quick-card-icon">${mod.icon}</div>
        <h4>${mod.title}</h4>
      `;
      quickAccessGrid.appendChild(card);
    });
  }

  // Carregar KPIs do Firebase (Exemplo Assíncrono)
  loadKPIs();
}

async function loadKPIs() {
  try {
    // 1. Empréstimos ativos
    const kpiEmprestimos = document.getElementById('kpi-emprestimos');
    if (kpiEmprestimos) {
      const equipSnap = await getDocs(collection(db, 'notebooks'));
      let ativos = 0;
      equipSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'emprestado' || data.status === 'cedido') ativos++;
      });
      kpiEmprestimos.textContent = ativos.toString();
    }
  } catch (e) {
    console.error("Erro ao carregar KPIs de equipamentos:", e);
  }

  try {
    // 2. Usuários ativos
    const kpiUsuarios = document.getElementById('kpi-usuarios');
    if (kpiUsuarios) {
      const userSnap = await getDocs(collection(db, 'users'));
      kpiUsuarios.textContent = userSnap.size.toString();
    }
  } catch(e) {
    console.error("Erro ao carregar KPIs de usuários:", e);
  }

  try {
    // 3. Salas Ocupadas Hoje
    const kpiSalas = document.getElementById('kpi-salas');
    if (kpiSalas) {
      // Pega o dia da semana atual (1=Segunda ... 5=Sexta). Domingo=0, Sábado=6
      let diaHoje = new Date().getDay(); 
      if (diaHoje >= 1 && diaHoje <= 5) {
        const calSnap = await getDocs(collection(db, 'calendarEntries'));
        let ocupadas = 0;
        let salasVistas = new Set();
        calSnap.forEach(doc => {
          const data = doc.data();
          if (data.weekday === diaHoje && data.roomId) {
            salasVistas.add(data.roomId);
          }
        });
        kpiSalas.textContent = salasVistas.size.toString();
      } else {
        kpiSalas.textContent = "0"; // Fim de semana
      }
    }
  } catch(e) {
    console.error("Erro ao carregar KPIs de salas:", e);
  }

  try {
    // 4. Horas Registradas
    const kpiHoras = document.getElementById('kpi-horas');
    if (kpiHoras) {
      const funcSnap = await getDocs(collection(db, 'funcionarios_rh'));
      let totalHoras = 0;
      funcSnap.forEach(doc => {
        const data = doc.data();
        if (data.totalHorasExtras) totalHoras += data.totalHorasExtras;
      });
      kpiHoras.textContent = `${Math.round(totalHoras)}h`;
    }
  } catch(e) {
    console.error("Erro ao carregar KPIs de horas:", e);
  }
}
