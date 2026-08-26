// FlechaCard — backend configuration.
// Fill in your Supabase project's URL and anon (public) key to switch the
// site to short permanent links. Leave both empty and the site keeps
// working in link-only mode (profile data carried inside the link).
window.FLECHA_CONFIG = window.FLECHA_CONFIG || {
  supabaseUrl: "https://cjkigvdsxonvmefqfadq.supabase.co",
  supabaseAnonKey: "sb_publishable_aJMnMRLVL1PDNA0iLcHf_g_coe7UNF1",

  // Base address used in the links shown to people. Leave empty to use
  // whatever address the site is being served from. Set this to a custom
  // domain (e.g. "https://flechacard.co.mz/") once one is pointed here.
  siteBase: ""
};
