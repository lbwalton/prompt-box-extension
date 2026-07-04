// Public, non-secret config for Prompt Box Pro. Safe to ship: the anon key is
// protected by Row-Level Security. No secret keys ever live here.
const PB_SYNC_CONFIG = {
  supabaseUrl: 'https://jmxmtiqkpegqywderwkt.supabase.co',
  supabaseAnonKey: 'sb_publishable_vX5mvAVPmCnoebqDyPBRcw_vYS9JLMh',
  // chrome.identity redirect for this extension instance.
  get authRedirect() {
    return chrome.identity.getRedirectURL();
  },
  stripePrices: {
    monthly: 'price_1TpZLQGuSTSqtrBZDOq0hOBv',
    annual: 'price_1TpZNQGuSTSqtrBZ94zcxFxR',
    lifetime: 'price_1TpZQGGuSTSqtrBZ79zdYXR4',
  },
};
