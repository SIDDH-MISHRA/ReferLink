// Public settings. Both keys are safe to publish:
// - The Supabase publishable (anon) key can only call the 7 functions in supabase/schema.sql.
// - The PostHog project key can only send events.
// Never put the Supabase service_role / secret key here.
window.REFERLINK_CONFIG = {
  supabaseUrl: 'https://lgfmylwzwdqkqijtbeyv.supabase.co',
  supabaseKey: 'sb_publishable_5_bnUpGSL9YALPWSst_h_Q_2NPkjo5-',
  posthogKey: 'phc_uLBK7yZdCaYFZHP7EWA8DPfrEArtkJtLN5WqcP93i5B9', // leave empty to turn analytics off
  posthogHost: 'https://us.i.posthog.com'
};
