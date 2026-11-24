import { APP_CONFIG, SUPABASE_CONFIG } from './config.js';
import {
  store,
  getLocationStock,
  setLocationStock,
  upsertFlavorCloud,
  insertFinanceCloud,
  compressImageFile,
  saveLocalFallback
} from './store.js';
import { showToast, openModal, escapeHtml } from './ui.js';

// Precyzyjne przeliczanie sprzedanych porcji na zużycie kuwet na podstawie indywidualnego porcjiNaKuwete
export function calculateTubConsumptionFromPortions(portionsSold, portionsPerTub) {
  const sold = Math.max(0, Number(portionsSold) || 0);
  const perTub = Math.max(1, Number(portionsPerTub) || APP_CONFIG.defaultPortionsPerTub);
  const exactTubs = sold / perTub;
  return {
    portionsSold: sold,
    portionsPerTub: perTub,
    exactTubs: Number(exactTubs.toFixed(2)),
    recommendedFullTubsToDeduct: Math.floor(exactTubs)
  };
}

export async function recordIposSaleAndDeductStock({ flavorId, locationName, portionsSold, revenueAmount }) {
  const flavor = store.state.flavors.find((f) => f.id === flavorId);
  if (!flavor) {
    showToast('Nie znaleziono wybranego smaku.', 'error');
    return;
  }

  const calc = calculateTubConsumptionFromPortions(portionsSold, flavor.porcjiNaKuwete);
  const currentStock = getLocationStock(flavor, locationName);
  const actualDeducted = Math.min(currentStock, calc.recommendedFullTubsToDeduct);

  if (actualDeducted > 0) {
    setLocationStock(flavor, locationName, currentStock - actualDeducted);
  }
  flavor.sprzedaz30d = (Number(flavor.sprzedaz30d) || 0) + calc.portionsSold;
  flavor.ostatniaSprzedazDni = 0;

  await upsertFlavorCloud(flavor);

  const entry = {
    id: `fin-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: 'pos_revenue',
    location: locationName,
    amount: Number(revenueAmount) || calc.portionsSold * (Number(flavor.cenaPorcji) || 9),
    description: `iPOS: ${flavor.nazwa} (${calc.portionsSold} porcji / ${calc.exactTubs} kuwety; zdjęto ${actualDeducted} pełnych kuwet)`,
    meta: {
      flavorId: flavor.id,
      portionsSold: calc.portionsSold,
      portionsPerTub: calc.portionsPerTub,
      exactTubs: calc.exactTubs,
      deductedTubs: actualDeducted
    }
  };

  await insertFinanceCloud(entry);
  renderFinanceAndPayroll();
  showToast(
    `Zaksięgowano ${calc.portionsSold} porcji (${calc.exactTubs} kuwety; zdjęto ${actualDeducted} szt. w ${locationName}).`,
    'success'
  );
}

export function openManualPosModal() {
  const flavorOptions = store.state.flavors
    .map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.nazwa)} (${f.porcjiNaKuwete || APP_CONFIG.defaultPortionsPerTub} porcji/kuweta)</option>`)
    .join('');
  const locOptions = store.state.org.locations
    .map((l) => `<option value="${escapeHtml(l)}" ${l === store.state.activeLocation ? 'selected' : ''}>${escapeHtml(l)}</option>`)
    .join('');

  openModal({
    title: 'Księgowanie sprzedaży iPOS i zużycia kuwet',
    confirmText: 'Zaksięguj',
    bodyHtml: `
      <label class="field-label" for="sfPosFlavor">Smak</label>
      <select id="sfPosFlavor" class="input-control">${flavorOptions}</select>
      <label class="field-label" for="sfPosLoc">Lokalizacja</label>
      <select id="sfPosLoc" class="input-control">${locOptions}</select>
      <label class="field-label" for="sfPosPortions">Liczba sprzedanych porcji</label>
      <input id="sfPosPortions" class="input-control" type="number" min="1" value="35" />
      <label class="field-label" for="sfPosRevenue">Utarg (PLN)</label>
      <input id="sfPosRevenue" class="input-control" type="number" step="0.01" min="0" value="315.00" />
    `,
    onConfirm: async () => {
      const flavorId = document.getElementById('sfPosFlavor')?.value;
      const locationName = document.getElementById('sfPosLoc')?.value;
      const portionsSold = parseInt(document.getElementById('sfPosPortions')?.value, 10) || 0;
      const revenueAmount = parseFloat(document.getElementById('sfPosRevenue')?.value) || 0;
      if (portionsSold <= 0) {
        showToast('Podaj liczbę sprzedanych porcji większą od 0.', 'error');
        return false;
      }
      await recordIposSaleAndDeductStock({ flavorId, locationName, portionsSold, revenueAmount });
    }
  });
}

export async function triggerServerIposSync() {
  if (!store.supabase || !store.state.user) {
    showToast('Zaloguj się przez Supabase Auth, aby uruchomić synchronizację Edge Function iPOS.', 'warning');
    return;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await store.supabase.functions.invoke(SUPABASE_CONFIG.functions.iposSync, {
      body: { dateFrom: today, dateTo: today, locationName: store.state.activeLocation }
    });
    if (error) throw error;
    showToast(`Synchronizacja iPOS zakończona (${data?.items?.length || 0} pozycji).`, 'success');
  } catch (err) {
    showToast(`Błąd synchronizacji iPOS: ${err.message || err}`, 'error');
  }
}

export function renderFinanceAndPayroll() {
  const finBox = document.getElementById('financeSummaryBox');
  if (!finBox) return;

  const totalRevenue = store.state.finance
    .filter((e) => e.type === 'pos_revenue')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const payrollRows = store.state.staff
    .map((emp) => {
      const hours = Number(emp.hoursLogged) || 0;
      const rate = Number(emp.hourlyRate) || APP_CONFIG.defaultHourlyRate;
      const gross = (hours * rate).toFixed(2);
      return `
        <tr>
          <td>${escapeHtml(emp.fullName)}</td>
          <td>${hours} h</td>
          <td>${rate.toFixed(2)} zł/h</td>
          <td><strong>${gross} zł</strong></td>
        </tr>
      `;
    })
    .join('');

  const recentEntries = store.state.finance
    .slice(0, 8)
    .map((e) => `<li><strong>${escapeHtml(e.date)}</strong> [${escapeHtml(e.location)}] — ${escapeHtml(e.description)} — <strong>${Number(e.amount).toFixed(2)} zł</strong></li>`)
    .join('');

  finBox.innerHTML = `
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">Łączny zarejestrowany utarg iPOS</span>
        <span class="kpi-value">${totalRevenue.toFixed(2)} zł</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Aktywne lokalizacje</span>
        <span class="kpi-value">${store.state.org.locations.length}</span>
      </div>
    </div>
    <h4>Zestawienie godzin i wynagrodzeń</h4>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Pracownik</th><th>Godziny</th><th>Stawka</th><th>Suma</th></tr>
        </thead>
        <tbody>${payrollRows}</tbody>
      </table>
    </div>
    <h4>Ostatnie księgowania iPOS</h4>
    <ul class="entry-list">${recentEntries || '<li class="muted">Brak wpisów finansowych.</li>'}</ul>
  `;
}

export function renderSocialGenerator() {
  const container = document.getElementById('socialModuleBox');
  if (!container) return;

  const availableFlavors = store.state.flavors
    .filter((f) => getLocationStock(f, store.state.activeLocation) > 0)
    .map((f) => f.nazwa);

  const defaultText = availableFlavors.length
    ? `Dzisiaj w ${store.state.activeLocation} (${store.state.org.name}) czekają m.in.: ${availableFlavors.slice(0, 6).join(', ')}. Wpadnij na świeżą kuwetę!`
    : `Przygotowujemy świeże kuwety w ${store.state.org.name} (${store.state.activeLocation}). Do zobaczenia!`;

  container.innerHTML = `
    <label class="field-label" for="sfSocialChannel">Kanał publikacji</label>
    <select id="sfSocialChannel" class="input-control">
      <option value="instagram">Instagram</option>
      <option value="facebook">Facebook</option>
    </select>
    <label class="field-label" for="sfSocialText">Treść posta (ograniczona do dostępnych smaków w ${escapeHtml(store.state.activeLocation)})</label>
    <textarea id="sfSocialText" class="input-control" rows="4">${escapeHtml(defaultText)}</textarea>
    <label class="field-label" for="sfSocialImage">Zdjęcie (automatycznie kompresowane przez Canvas)</label>
    <input id="sfSocialImage" class="input-control" type="file" accept="image/*" />
    <div id="sfSocialPreviewWrap" class="preview-wrap"></div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary" id="sfPublishSocialBtn">Publikuj przez Edge Function</button>
      <button type="button" class="btn btn-ghost" id="sfDownloadPostTxtBtn">Pobierz .txt</button>
    </div>
  `;

  let compressedImageDataUrl = '';
  document.getElementById('sfSocialImage')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      compressedImageDataUrl = await compressImageFile(file, 1080, 1080, 0.82);
      const wrap = document.getElementById('sfSocialPreviewWrap');
      if (wrap) {
        wrap.innerHTML = `<img src="${compressedImageDataUrl}" alt="Podgląd posta" class="img-preview" />`;
      }
      showToast('Zdjęcie skompresowano w przeglądarce.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('sfDownloadPostTxtBtn')?.addEventListener('click', () => {
    const txt = document.getElementById('sfSocialText')?.value || '';
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `post-${store.state.activeLocation.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    showToast('Pobrano treść posta (.txt).', 'success');
  });

  document.getElementById('sfPublishSocialBtn')?.addEventListener('click', async () => {
    const channel = document.getElementById('sfSocialChannel')?.value || 'instagram';
    const message = document.getElementById('sfSocialText')?.value.trim() || '';
    if (!message) {
      showToast('Treść posta nie może być pusta.', 'error');
      return;
    }

    store.state.socialPosts.unshift({
      id: `post-${Date.now()}`,
      channel,
      message,
      createdAt: new Date().toISOString()
    });
    saveLocalFallback();

    if (!store.supabase || !store.state.user) {
      showToast('Zapisano szkic posta lokalnie. Zaloguj się w Supabase, aby wysłać przez Edge Function.', 'info');
      return;
    }

    try {
      const { data, error } = await store.supabase.functions.invoke(SUPABASE_CONFIG.functions.apiProxy, {
        body: {
          action: 'publish_social',
          channel,
          message,
          imageUrl: compressedImageDataUrl || undefined
        }
      });
      if (error || !data?.ok) {
        showToast(data?.error || error?.message || 'Wysyłka przez Edge Function odrzucona.', 'warning');
      } else {
        showToast(`Opublikowano na ${channel.toUpperCase()}!`, 'success');
      }
    } catch (err) {
      showToast(`Błąd komunikacji z Edge Function: ${err.message || err}`, 'error');
    }
  });
}
