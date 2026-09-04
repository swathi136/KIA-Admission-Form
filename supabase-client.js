const SUPABASE_URL = "https://hetmfcoxuqpevlvjarhr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JGgwFLAQCWAe3cg7JyQa6A_aci-3nhf";

// The CDN library already exposes `window.supabase`. Use a different name
// for this application's client instance to avoid redeclaring that identifier.
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);







