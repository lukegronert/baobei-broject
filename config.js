// Supabase project behind sign-in and likes. The anon key is meant to be
// public: row-level security (supabase/schema.sql) decides what it can do.
// Leave both empty and the site runs without sign-in.
window.BAOBEI_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
