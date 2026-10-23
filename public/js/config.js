// Public settings. Both keys are safe to publish:
// - The Supabase publishable (anon) key can only call the 7 functions in supabase/schema.sql.
// - The PostHog project key can only send events.
// Never put the Supabase service_role / secret key here.
window.REFERLINK_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseKey: 'YOUR-SUPABASE-PUBLISHABLE-KEY',
  posthogKey: '', // e.g. 'phc_...'; leave empty to turn analytics off
  posthogHost: 'https://us.i.posthog.com'
};
