import { APP_CONFIG } from './config.js';
import {
  store,
  initSupabaseClient,
  loadLocalFallback,
  saveLocalFallback,
  syncWithSupabase,
  compressImageFile
} from './store.js';
import { showToast, openModal, escapeHtml } from './ui.js';
import {
  renderInventory,
  setInventorySearch,
  setInventoryCategory,
  openAddFlavorModal
} from './inventory.js';
import { generateWeeklySchedule, renderSchedule, exportSchedulePng } from './schedule.js';
import {
  renderFinanceAndPayroll,
  renderSocialGenerator,
  openManualPosModal,
  triggerServerIposSync
} from './finance-social.js';

function switchTab(tabName) {
  store.state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });

  if (tabName === 'stany') renderInventory();
  if (tabName === 'grafik') renderSchedule();
  if (tabName === 'finanse') renderFinanceAndPayroll();
  if (tabName === 'social') renderSocialGenerator();
}

function updateAuthBadge() {
  const badge = document.getElementById('authStatusBadge');
  const loginBtn = document.getElementById('openAuthModalBtn');
  if (!badge) return;

  if (store.state.user) {
    badge.textContent = `${store.state.user.email} (Supabase)`;
    badge.className = 'auth-badge auth-online';
    if (loginBtn) loginBtn.textContent = 'Wyloguj';
  } else {
    badge.textContent = 'Tryb lokalny';
    badge.className = 'auth-badge auth-local';
    if (loginBtn) loginBtn.textContent = 'Zaloguj Supabase';
  }
}

function openAuthModal() {
  if (store.state.user && store.supabase) {
    store.supabase.auth.signOut().then(() => {
      store.state.user = null;
      store.state.profile = null;
      saveLocalFallback();
      updateAuthBadge();
      showToast('Wylogowano z Supabase.', 'info');
    });
    return;
  }

  openModal({
    title: 'Logowanie / Rejestracja (Supabase Auth)',
    confirmText: 'Zaloguj',
    bodyHtml: `
      <label class="field-label" for="sfAuthEmail">Adres e-mail</label>
      <input id="sfAuthEmail" class="input-control" type="email" placeholder="wlasciciel@lodyulucjana.pl" />
      <label class="field-label" for="sfAuthPassword">Hasło</label>
      <input id="sfAuthPassword" class="input-control" type="password" placeholder="Minimum 8 znaków" />
      <label class="field-label" for="sfOrgCode">Kod organizacji (opcjonalnie przy rejestracji)</label>
      <input id="sfOrgCode" class="input-control" type="text" value="${escapeHtml(store.state.org.accessCode)}" />
      <button type="button" class="btn btn-sm btn-ghost mt-2" id="sfRegisterBtn">Utwórz konto w Supabase</button>
    `,
    onConfirm: async () => {
      const email = document.getElementById('sfAuthEmail')?.value.trim();
      const password = document.getElementById('sfAuthPassword')?.value || '';
      if (!email || !password) {
        showToast('Podaj e-mail i hasło.', 'error');
        return false;
      }
      if (!store.supabase) {
        store.state.user = { email };
        saveLocalFallback();
        updateAuthBadge();
        showToast('Zalogowano w trybie lokalnym (uzupełnij SUPABASE_CONFIG dla chmury).', 'info');
        return true;
      }
      const { data, error } = await store.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(`Błąd logowania: ${error.message}`, 'error');
        return false;
      }
      store.state.user = data.user;
      saveLocalFallback();
      updateAuthBadge();
      await syncWithSupabase(() => renderInventory());
      renderInventory();
      showToast('Zalogowano pomyślnie do Supabase!', 'success');
    }
  });

  setTimeout(() => {
    document.getElementById('sfRegisterBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('sfAuthEmail')?.value.trim();
      const password = document.getElementById('sfAuthPassword')?.value || '';
      const orgCode = document.getElementById('sfOrgCode')?.value.trim() || store.state.org.accessCode;
      if (!email || password.length < 6) {
        showToast('Podaj poprawny e-mail i hasło (min. 6 znaków).', 'error');
        return;
      }
      if (!store.supabase) {
        showToast('Skonfiguruj URL i anonKey Supabase w js/config.js.', 'warning');
        return;
      }
      const { data, error } = await store.supabase.auth.signUp({
        email,
        password,
        options: { data: { org_code: orgCode } }
      });
      if (error) {
        showToast(`Błąd rejestracji: ${error.message}`, 'error');
      } else {
        if (data.user) {
          await store.supabase.from('profiles').upsert({
            id: data.user.id,
            org_id: store.state.org.id,
            email,
            full_name: email.split('@')[0],
            role: 'staff',
            status: 'active'
          });
        }
        showToast('Konto utworzone. Sprawdź skrzynkę e-mail, jeśli włączono potwierdzenie.', 'success');
      }
    });
  }, 50);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Rejestracja Service Worker nieudana:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadLocalFallback();
  initSupabaseClient();
  registerServiceWorker();

  document.getElementById('brandTitle').textContent = `${APP_CONFIG.appName} • ${store.state.org.name}`;
  updateAuthBadge();

  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('openAuthModalBtn')?.addEventListener('click', openAuthModal);
  document.getElementById('addFlavorBtn')?.addEventListener('click', openAddFlavorModal);
  document.getElementById('searchFlavorInput')?.addEventListener('input', (e) => setInventorySearch(e.target.value));
  document.getElementById('categoryFilterSelect')?.addEventListener('change', (e) => setInventoryCategory(e.target.value));

  document.getElementById('generateScheduleBtn')?.addEventListener('click', () => {
    generateWeeklySchedule(store.state.activeLocation, 2);
  });
  document.getElementById('exportSchedulePngBtn')?.addEventListener('click', exportSchedulePng);

  document.getElementById('manualPosBtn')?.addEventListener('click', openManualPosModal);
  document.getElementById('serverIposSyncBtn')?.addEventListener('click', triggerServerIposSync);

  document.getElementById('logoUploadInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 320, 320, 0.85);
      store.state.org.logoDataUrl = compressed;
      saveLocalFallback();
      const logoImg = document.getElementById('brandLogoImg');
      if (logoImg) {
        logoImg.src = compressed;
        logoImg.style.display = 'inline-block';
      }
      showToast('Zaktualizowano i skompresowano logo.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  if (store.supabase) {
    const { data } = await store.supabase.auth.getSession();
    if (data?.session?.user) {
      store.state.user = data.session.user;
      updateAuthBadge();
      await syncWithSupabase(() => renderInventory());
    }
  }

  renderInventory();
  renderSchedule();
  renderFinanceAndPayroll();
  renderSocialGenerator();
});
