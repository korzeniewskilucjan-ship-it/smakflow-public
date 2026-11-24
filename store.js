import { APP_CONFIG, SUPABASE_CONFIG } from './config.js';

const STORAGE_KEYS = {
  session: 'sf_session_v2',
  org: 'sf_active_org_v2',
  flavors: 'sf_flavors_v2',
  schedules: 'sf_schedules_v2',
  finance: 'sf_finance_v2',
  social: 'sf_social_v2',
  staff: 'sf_staff_v2',
  pendingStaff: 'sf_pending_staff_v2'
};

export const store = {
  supabase: null,
  realtimeChannel: null,
  state: {
    user: null,
    profile: null,
    org: {
      id: 'lody-u-lucjana',
      name: APP_CONFIG.brandName,
      accessCode: 'LUCJAN2026',
      logoDataUrl: '',
      locations: [...APP_CONFIG.defaultLocations]
    },
    activeLocation: APP_CONFIG.defaultLocations[0],
    activeTab: 'stany',
    flavors: [],
    schedules: [],
    finance: [],
    socialPosts: [],
    staff: [],
    pendingStaff: []
  }
};

export function initSupabaseClient() {
  if (
    window.supabase &&
    SUPABASE_CONFIG.url &&
    !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_REF') &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE_ANON_KEY')
  ) {
    store.supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return true;
  }
  return false;
}

export function loadLocalFallback() {
  try {
    const orgRaw = localStorage.getItem(STORAGE_KEYS.org);
    if (orgRaw) {
      const parsedOrg = JSON.parse(orgRaw);
      store.state.org = {
        ...store.state.org,
        ...parsedOrg,
        locations: Array.isArray(parsedOrg.locations) && parsedOrg.locations.length
          ? parsedOrg.locations
          : [...APP_CONFIG.defaultLocations]
      };
    }
    store.state.activeLocation = store.state.org.locations[0] || APP_CONFIG.defaultLocations[0];

    const flavorsRaw = localStorage.getItem(STORAGE_KEYS.flavors);
    store.state.flavors = flavorsRaw ? JSON.parse(flavorsRaw) : getDefaultFlavors(store.state.org.locations);

    const schedRaw = localStorage.getItem(STORAGE_KEYS.schedules);
    store.state.schedules = schedRaw ? JSON.parse(schedRaw) : [];

    const finRaw = localStorage.getItem(STORAGE_KEYS.finance);
    store.state.finance = finRaw ? JSON.parse(finRaw) : [];

    const socRaw = localStorage.getItem(STORAGE_KEYS.social);
    store.state.socialPosts = socRaw ? JSON.parse(socRaw) : [];

    const staffRaw = localStorage.getItem(STORAGE_KEYS.staff);
    store.state.staff = staffRaw ? JSON.parse(staffRaw) : [
      {
        id: 'emp-1',
        fullName: 'Lucjan Admin',
        email: 'admin@lodyulucjana.pl',
        role: 'admin',
        status: 'active',
        hourlyRate: 35.0,
        assignedLocations: [...store.state.org.locations],
        hoursLogged: 148
      },
      {
        id: 'emp-2',
        fullName: 'Pracownik Karpia',
        email: 'karpia@lodyulucjana.pl',
        role: 'staff',
        status: 'active',
        hourlyRate: APP_CONFIG.defaultHourlyRate,
        assignedLocations: ['Witryna Karpia', 'Magazyn Główny'],
        hoursLogged: 96
      }
    ];

    const pendingRaw = localStorage.getItem(STORAGE_KEYS.pendingStaff);
    store.state.pendingStaff = pendingRaw ? JSON.parse(pendingRaw) : [];

    const sessRaw = localStorage.getItem(STORAGE_KEYS.session);
    if (sessRaw) {
      const sess = JSON.parse(sessRaw);
      store.state.user = sess.user || null;
      store.state.profile = sess.profile || null;
    }
  } catch (e) {
    console.warn('Błąd odczytu lokalnego stanu:', e);
  }
}

export function saveLocalFallback() {
  try {
    localStorage.setItem(STORAGE_KEYS.org, JSON.stringify(store.state.org));
    localStorage.setItem(STORAGE_KEYS.flavors, JSON.stringify(store.state.flavors));
    localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify(store.state.schedules));
    localStorage.setItem(STORAGE_KEYS.finance, JSON.stringify(store.state.finance));
    localStorage.setItem(STORAGE_KEYS.social, JSON.stringify(store.state.socialPosts));
    localStorage.setItem(STORAGE_KEYS.staff, JSON.stringify(store.state.staff));
    localStorage.setItem(STORAGE_KEYS.pendingStaff, JSON.stringify(store.state.pendingStaff));
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
      user: store.state.user,
      profile: store.state.profile
    }));
  } catch (e) {
    console.warn('Błąd zapisu stanu lokalnego:', e);
  }
}

function getDefaultFlavors(locations) {
  const base = [
    { id: 'fl-1', nazwa: 'Pistacja Bronte', kategoria: 'Orzechowe', alergeny: 'Orzechy, Mleko', cenaPorcji: 11, porcjiNaKuwete: 35, ostatniaSprzedazDni: 1, sprzedaz30d: 142 },
    { id: 'fl-2', nazwa: 'Śmietanka Wiejska', kategoria: 'Mleczne', alergeny: 'Mleko', cenaPorcji: 9, porcjiNaKuwete: 38, ostatniaSprzedazDni: 0, sprzedaz30d: 168 },
    { id: 'fl-3', nazwa: 'Sorbet Malina', kategoria: 'Sorbety', alergeny: 'Brak', cenaPorcji: 9, porcjiNaKuwete: 35, ostatniaSprzedazDni: 2, sprzedaz30d: 115 },
    { id: 'fl-4', nazwa: 'Słony Karmel', kategoria: 'Mleczne', alergeny: 'Mleko', cenaPorcji: 10, porcjiNaKuwete: 35, ostatniaSprzedazDni: 24, sprzedaz30d: 48 }
  ];
  return base.map((item, idx) => {
    const stanyLokali = {};
    locations.forEach((loc, lIdx) => {
      stanyLokali[loc] = (idx + lIdx) % 3 === 0 ? 0 : 2;
    });
    return { ...item, stanyLokali };
  });
}

export function getLocationStock(flavor, locationName) {
  if (!flavor) return 0;
  if (flavor.stanyLokali && typeof flavor.stanyLokali[locationName] === 'number') {
    return flavor.stanyLokali[locationName];
  }
  return 0;
}

export function setLocationStock(flavor, locationName, qty) {
  const safeQty = Math.max(0, Number.isFinite(Number(qty)) ? Math.floor(Number(qty)) : 0);
  if (!flavor.stanyLokali || typeof flavor.stanyLokali !== 'object') {
    flavor.stanyLokali = {};
  }
  flavor.stanyLokali[locationName] = safeQty;
  return safeQty;
}

export function getTotalStock(flavor) {
  if (!flavor || !flavor.stanyLokali) return 0;
  return Object.values(flavor.stanyLokali).reduce((acc, val) => acc + (Number(val) || 0), 0);
}

// Kompresja obrazów przez HTMLCanvasElement przed zapisem/wysyłką
export function compressImageFile(file, maxWidth = 1024, maxHeight = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Wybierz prawidłowy plik graficzny (JPG, PNG, WEBP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Nie udało się załadować obrazu.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, mimeType === 'image/png' ? undefined : quality);
        resolve(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Synchronizacja z Supabase + Realtime (WebSockets)
export async function syncWithSupabase(onRemoteChange) {
  if (!store.supabase || !store.state.user) return false;
  try {
    const { data: flavorsData, error: fErr } = await store.supabase
      .from('flavors')
      .select('*')
      .order('nazwa', { ascending: true });

    if (!fErr && Array.isArray(flavorsData)) {
      store.state.flavors = flavorsData.map((row) => ({
        id: row.id,
        nazwa: row.nazwa,
        kategoria: row.kategoria || 'Mleczne',
        alergeny: row.alergeny || 'Brak',
        cenaPorcji: Number(row.cena_porcji) || 9,
        porcjiNaKuwete: Number(row.porcji_na_kuwete) || APP_CONFIG.defaultPortionsPerTub,
        stanyLokali: row.stany_lokali || {},
        ostatniaSprzedazDni: Number(row.ostatnia_sprzedaz_dni) || 0,
        sprzedaz30d: Number(row.sprzedaz_30d) || 0
      }));
      saveLocalFallback();
    }

    const { data: finData } = await store.supabase
      .from('finance_entries')
      .select('*')
      .order('entry_date', { ascending: false });
    if (Array.isArray(finData)) {
      store.state.finance = finData.map((r) => ({
        id: r.id,
        date: r.entry_date,
        type: r.entry_type,
        location: r.location_name || store.state.activeLocation,
        amount: Number(r.amount) || 0,
        description: r.description || '',
        meta: r.raw_meta || {}
      }));
    }

    if (!store.realtimeChannel) {
      store.realtimeChannel = store.supabase
        .channel('smakflow-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'flavors' }, async () => {
          await syncWithSupabase(null);
          if (typeof onRemoteChange === 'function') onRemoteChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
          if (typeof onRemoteChange === 'function') onRemoteChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries' }, async () => {
          await syncWithSupabase(null);
          if (typeof onRemoteChange === 'function') onRemoteChange();
        })
        .subscribe();
    }
    return true;
  } catch (err) {
    console.warn('Synchronizacja Supabase nieudana, używam stanu lokalnego:', err);
    return false;
  }
}

export async function upsertFlavorCloud(flavor) {
  saveLocalFallback();
  if (!store.supabase || !store.state.user || !store.state.profile?.orgId) return;
  try {
    await store.supabase.from('flavors').upsert({
      id: flavor.id,
      org_id: store.state.profile.orgId,
      nazwa: flavor.nazwa,
      kategoria: flavor.kategoria,
      alergeny: flavor.alergeny,
      cena_porcji: flavor.cenaPorcji,
      porcji_na_kuwete: flavor.porcjiNaKuwete || APP_CONFIG.defaultPortionsPerTub,
      stany_lokali: flavor.stanyLokali || {},
      ostatnia_sprzedaz_dni: flavor.ostatniaSprzedazDni || 0,
      sprzedaz30d: flavor.sprzedaz30d || 0,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Błąd zapisu smaku w Supabase:', e);
  }
}

export async function insertFinanceCloud(entry) {
  store.state.finance.unshift(entry);
  saveLocalFallback();
  if (!store.supabase || !store.state.user || !store.state.profile?.orgId) return;
  try {
    await store.supabase.from('finance_entries').insert({
      id: entry.id,
      org_id: store.state.profile.orgId,
      entry_date: entry.date,
      entry_type: entry.type,
      location_name: entry.location,
      amount: entry.amount,
      description: entry.description,
      raw_meta: entry.meta || {}
    });
  } catch (e) {
    console.warn('Błąd zapisu wpisu finansowego w Supabase:', e);
  }
}
