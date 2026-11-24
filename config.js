export const APP_CONFIG = {
  appName: 'Smakflow',
  brandName: 'Lody u Lucjana',
  version: '2.0.0',
  defaultLocations: [
    'Naramowicka 336',
    'Karpia 11',
    'Magazyn Główny'
  ],
  defaultPortionsPerTub: 35,
  defaultHourlyRate: 28.10,
  theme: 'dark-navy'
};

// Uzupełnij swoimi danymi projektu Supabase (anon key jest publiczny, sekrety API trzymaj w Edge Functions)
export const SUPABASE_CONFIG = {
  url: window.__SMAKFLOW_SUPABASE_URL__ || 'https://bxmgiigbaxzmqcgjiulh.supabase.co',
  anonKey: window.__SMAKFLOW_SUPABASE_ANON_KEY__ || 'sb_publishable_Vu5qlLsoquae30Rw6SA4Ug_XqI7ugEU',
  functions: {
    apiProxy: 'api-proxy',
    iposSync: 'ipos-sync'
  }
};
