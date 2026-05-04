import { MODULES, getRoleConfig, hasPermission } from './permissions.js';

export function setupLayout(user, role, activeModuleId, onLogout) {
  // Validar permissão (se não for o dashboard ou visitante)
  if (activeModuleId !== 'dashboard' && !hasPermission(role, activeModuleId)) {
    window.location.href = '/index.html';
    return;
  }

  const roleConfig = getRoleConfig(role);
  const name = user.displayName || user.email.split('@')[0];
  const initial = name.charAt(0).toUpperCase();

  // Criar Sidebar
  const sidebar = document.createElement('aside');
  sidebar.className = 'layout-sidebar';
  
  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'layout-sidebar-header';
  sidebarHeader.innerHTML = `
    <a href="/index.html" class="layout-brand">
      <div class="orbit-container">
        <div class="orbit-center">F</div>
        <div class="orbit-planet"></div>
      </div>
      <span class="logo-orbita">ÓRBITA</span><span class="logo-fatec">FATEC</span>
    </a>
  `;
  sidebar.appendChild(sidebarHeader);

  const nav = document.createElement('nav');
  nav.className = 'layout-nav';
  
  Object.keys(MODULES).forEach(key => {
    if (roleConfig.modules.includes(key)) {
      const mod = MODULES[key];
      const link = document.createElement('a');
      link.href = mod.url;
      link.className = `layout-nav-item ${key === activeModuleId ? 'active' : ''}`;
      link.innerHTML = `${mod.icon} <span>${mod.title}</span>`;
      nav.appendChild(link);
    }
  });
  sidebar.appendChild(nav);

  // Criar Header
  const header = document.createElement('header');
  header.className = 'layout-header';
  const activeMod = MODULES[activeModuleId];
  header.innerHTML = `
    <div class="layout-header-title">
      ${activeMod ? activeMod.title : 'Dashboard'}
    </div>
    <div class="layout-header-actions">
      <span class="layout-user-role">${roleConfig.label}</span>
      <div class="layout-user-info">
        <div class="layout-user-avatar">${initial}</div>
        <span class="layout-user-name">${name}</span>
      </div>
      <button class="layout-logout-btn" id="layout-logout-btn" title="Sair">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  `;

  // Injetar no DOM
  const wrapper = document.querySelector('.layout-wrapper');
  if (wrapper) {
    wrapper.insertBefore(sidebar, wrapper.firstChild);
    const main = wrapper.querySelector('.layout-main');
    if (main) {
      main.insertBefore(header, main.firstChild);
    }
  }

  // Evento de Logout
  const logoutBtn = document.getElementById('layout-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (onLogout) onLogout();
    });
  }

  // Remover auth-guard e mostrar app
  const authGuard = document.getElementById('auth-guard');
  if (authGuard) authGuard.style.display = 'none';
  
  const app = document.getElementById('app');
  if (app) app.classList.remove('hidden');
}
