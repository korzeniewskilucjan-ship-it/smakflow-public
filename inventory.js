import { APP_CONFIG } from './config.js';
import {
  store,
  getLocationStock,
  setLocationStock,
  getTotalStock,
  upsertFlavorCloud,
  saveLocalFallback
} from './store.js';
import { showToast, openModal, escapeHtml } from './ui.js';

let searchQuery = '';
let categoryFilter = 'Wszystkie';

export function setInventorySearch(q) {
  searchQuery = (q || '').trim().toLowerCase();
  renderInventory();
}

export function setInventoryCategory(cat) {
  categoryFilter = cat || 'Wszystkie';
  renderInventory();
}

export function renderInventory() {
  const listEl = document.getElementById('flavorsList');
  const locBarEl = document.getElementById('locationSwitcher');
  if (!listEl) return;

  if (locBarEl) {
    locBarEl.innerHTML = store.state.org.locations
      .map((loc) => {
        const active = loc === store.state.activeLocation ? 'active' : '';
        return `<button type="button" class="loc-pill ${active}" data-loc="${escapeHtml(loc)}">${escapeHtml(loc)}</button>`;
      })
      .join('');

    locBarEl.querySelectorAll('.loc-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.activeLocation = btn.dataset.loc;
        renderInventory();
      });
    });
  }

  const filtered = store.state.flavors.filter((f) => {
    const matchesSearch =
      !searchQuery ||
      f.nazwa.toLowerCase().includes(searchQuery) ||
      (f.alergeny || '').toLowerCase().includes(searchQuery);
    const matchesCat = categoryFilter === 'Wszystkie' || f.kategoria === categoryFilter;
    return matchesSearch && matchesCat;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">Brak smaków spełniających kryteria filtrowania.</div>`;
    return;
  }

  // Składanie HTML tablicą przed jednym przypisaniem innerHTML
  const fragmentHtml = filtered
    .map((flavor) => buildFlavorCardHtml(flavor, store.state.activeLocation))
    .join('');
  listEl.innerHTML = fragmentHtml;
  attachCardListeners(listEl);
}

function buildFlavorCardHtml(flavor, activeLoc) {
  const qty = getLocationStock(flavor, activeLoc);
  const total = getTotalStock(flavor);
  const portions = Number(flavor.porcjiNaKuwete) || APP_CONFIG.defaultPortionsPerTub;
  const stockBadgeClass = qty === 0 ? 'badge-empty' : qty <= 1 ? 'badge-low' : 'badge-ok';

  return `
    <article class="flavor-card" data-flavor-id="${escapeHtml(flavor.id)}">
      <div class="flavor-card-top">
        <div>
          <h4 class="flavor-name">${escapeHtml(flavor.nazwa)}</h4>
          <p class="flavor-meta">${escapeHtml(flavor.kategoria)} • ${portions} porcji/kuweta • Łącznie: <strong data-total-stock>${total}</strong> szt.</p>
        </div>
        <span class="stock-badge ${stockBadgeClass}" data-loc-badge>${qty} szt.</span>
      </div>
      <p class="flavor-allergens">Alergeny: ${escapeHtml(flavor.alergeny || 'Brak')}</p>
      <div class="flavor-actions">
        <button type="button" class="btn btn-sm btn-secondary" data-action="dec" aria-label="Zmniejsz stan">-1</button>
        <button type="button" class="btn btn-sm btn-primary" data-action="inc" aria-label="Zwiększ stan">+1</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="zero">Zeruj</button>
        <button type="button" class="btn btn-sm btn-outline" data-action="transfer">Transfer 1 szt.</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="edit">Edytuj</button>
      </div>
    </article>
  `;
}

// Przyrostowa aktualizacja pojedynczego kafelka bez przebudowy całej listy
function patchSingleFlavorCard(flavor) {
  const card = document.querySelector(`.flavor-card[data-flavor-id="${CSS.escape(flavor.id)}"]`);
  if (!card) {
    renderInventory();
    return;
  }
  const qty = getLocationStock(flavor, store.state.activeLocation);
  const total = getTotalStock(flavor);
  const badge = card.querySelector('[data-loc-badge]');
  const totalEl = card.querySelector('[data-total-stock]');

  if (badge) {
    badge.textContent = `${qty} szt.`;
    badge.className = `stock-badge ${qty === 0 ? 'badge-empty' : qty <= 1 ? 'badge-low' : 'badge-ok'}`;
  }
  if (totalEl) {
    totalEl.textContent = String(total);
  }
}

function attachCardListeners(listEl) {
  listEl.querySelectorAll('.flavor-card').forEach((card) => {
    const id = card.dataset.flavorId;
    const flavor = store.state.flavors.find((f) => f.id === id);
    if (!flavor) return;

    card.querySelector('[data-action="inc"]')?.addEventListener('click', async () => {
      const current = getLocationStock(flavor, store.state.activeLocation);
      setLocationStock(flavor, store.state.activeLocation, current + 1);
      patchSingleFlavorCard(flavor);
      await upsertFlavorCloud(flavor);
      showToast(`${flavor.nazwa}: +1 w ${store.state.activeLocation}`, 'success');
    });

    card.querySelector('[data-action="dec"]')?.addEventListener('click', async () => {
      const current = getLocationStock(flavor, store.state.activeLocation);
      setLocationStock(flavor, store.state.activeLocation, Math.max(0, current - 1));
      patchSingleFlavorCard(flavor);
      await upsertFlavorCloud(flavor);
      showToast(`${flavor.nazwa}: -1 w ${store.state.activeLocation}`, 'info');
    });

    card.querySelector('[data-action="zero"]')?.addEventListener('click', async () => {
      setLocationStock(flavor, store.state.activeLocation, 0);
      patchSingleFlavorCard(flavor);
      await upsertFlavorCloud(flavor);
      showToast(`Wyzerowano stan: ${flavor.nazwa} (${store.state.activeLocation})`, 'warning');
    });

    card.querySelector('[data-action="transfer"]')?.addEventListener('click', () => {
      const targets = store.state.org.locations.filter((l) => l !== store.state.activeLocation);
      if (!targets.length) return;
      openModal({
        title: `Transfer 1 szt. — ${flavor.nazwa}`,
        confirmText: 'Wykonaj transfer',
        bodyHtml: `
          <p class="modal-desc">Z lokalizacji: <strong>${escapeHtml(store.state.activeLocation)}</strong></p>
          <label class="field-label" for="sfTransferTarget">Docelowa lokalizacja</label>
          <select id="sfTransferTarget" class="input-control">
            ${targets.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (aktualnie: ${getLocationStock(flavor, t)} szt.)</option>`).join('')}
          </select>
        `,
        onConfirm: async () => {
          const targetLoc = document.getElementById('sfTransferTarget')?.value;
          const srcQty = getLocationStock(flavor, store.state.activeLocation);
          if (srcQty < 1) {
            showToast('Brak kuwety na stanie w lokalizacji źródłowej.', 'error');
            return false;
          }
          setLocationStock(flavor, store.state.activeLocation, srcQty - 1);
          setLocationStock(flavor, targetLoc, getLocationStock(flavor, targetLoc) + 1);
          patchSingleFlavorCard(flavor);
          await upsertFlavorCloud(flavor);
          showToast(`Przeniesiono 1 szt. ${flavor.nazwa} → ${targetLoc}`, 'success');
        }
      });
    });

    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      openModal({
        title: `Edycja smaku — ${flavor.nazwa}`,
        confirmText: 'Zapisz zmiany',
        bodyHtml: `
          <label class="field-label" for="sfEditName">Nazwa smaku</label>
          <input id="sfEditName" class="input-control" type="text" value="${escapeHtml(flavor.nazwa)}" />
          <label class="field-label" for="sfEditCat">Kategoria</label>
          <select id="sfEditCat" class="input-control">
            ${['Mleczne', 'Orzechowe', 'Sorbety', 'Czekoladowe'].map((c) => `<option value="${c}" ${flavor.kategoria === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <label class="field-label" for="sfEditPortions">Liczba porcji na kuwetę</label>
          <input id="sfEditPortions" class="input-control" type="number" min="1" max="200" value="${Number(flavor.porcjiNaKuwete) || APP_CONFIG.defaultPortionsPerTub}" />
          <label class="field-label" for="sfEditAllergens">Alergeny</label>
          <input id="sfEditAllergens" class="input-control" type="text" value="${escapeHtml(flavor.alergeny || '')}" />
        `,
        onConfirm: async () => {
          const newName = document.getElementById('sfEditName')?.value.trim();
          const newCat = document.getElementById('sfEditCat')?.value;
          const newPortions = Math.max(1, parseInt(document.getElementById('sfEditPortions')?.value, 10) || APP_CONFIG.defaultPortionsPerTub);
          const newAllergens = document.getElementById('sfEditAllergens')?.value.trim() || 'Brak';
          if (!newName) {
            showToast('Nazwa smaku nie może być pusta.', 'error');
            return false;
          }
          flavor.nazwa = newName;
          flavor.kategoria = newCat;
          flavor.porcjiNaKuwete = newPortions;
          flavor.alergeny = newAllergens;
          saveLocalFallback();
          renderInventory();
          await upsertFlavorCloud(flavor);
          showToast('Zapisano parametry smaku.', 'success');
        }
      });
    });
  });
}

export function openAddFlavorModal() {
  openModal({
    title: 'Nowy smak w asortymencie',
    confirmText: 'Dodaj smak',
    bodyHtml: `
      <label class="field-label" for="sfNewFlavorName">Nazwa smaku</label>
      <input id="sfNewFlavorName" class="input-control" type="text" placeholder="np. Czarny Sezam" />
      <label class="field-label" for="sfNewFlavorCat">Kategoria</label>
      <select id="sfNewFlavorCat" class="input-control">
        <option value="Mleczne">Mleczne</option>
        <option value="Orzechowe">Orzechowe</option>
        <option value="Sorbety">Sorbety</option>
        <option value="Czekoladowe">Czekoladowe</option>
      </select>
      <label class="field-label" for="sfNewFlavorPortions">Porcji na kuwetę</label>
      <input id="sfNewFlavorPortions" class="input-control" type="number" min="1" max="200" value="${APP_CONFIG.defaultPortionsPerTub}" />
      <label class="field-label" for="sfNewFlavorAllergens">Alergeny</label>
      <input id="sfNewFlavorAllergens" class="input-control" type="text" placeholder="np. Sezam, Mleko" />
    `,
    onConfirm: async () => {
      const nazwa = document.getElementById('sfNewFlavorName')?.value.trim();
      const kategoria = document.getElementById('sfNewFlavorCat')?.value || 'Mleczne';
      const porcjiNaKuwete = Math.max(1, parseInt(document.getElementById('sfNewFlavorPortions')?.value, 10) || APP_CONFIG.defaultPortionsPerTub);
      const alergeny = document.getElementById('sfNewFlavorAllergens')?.value.trim() || 'Brak';
      if (!nazwa) {
        showToast('Podaj nazwę smaku.', 'error');
        return false;
      }
      const stanyLokali = {};
      store.state.org.locations.forEach((loc) => {
        stanyLokali[loc] = 0;
      });
      const newFlavor = {
        id: `fl-${Date.now()}`,
        nazwa,
        kategoria,
        alergeny,
        cenaPorcji: 10,
        porcjiNaKuwete,
        stanyLokali,
        ostatniaSprzedazDni: 0,
        sprzedaz30d: 0
      };
      store.state.flavors.push(newFlavor);
      renderInventory();
      await upsertFlavorCloud(newFlavor);
      showToast(`Dodano smak: ${nazwa}`, 'success');
    }
  });
}
