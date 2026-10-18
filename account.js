// Sign-in and like/dislike storage, backed by Supabase (see config.js and
// supabase/schema.sql). Without a configured project this stays inert and the
// site works as before.
window.baobeiAccount = (() => {
  const { supabaseUrl, supabaseAnonKey } = window.BAOBEI_CONFIG || {};
  const listeners = [];
  const reactions = new Map();
  let user = null;

  // Listeners get an idea id when one reaction changed, nothing when they all did.
  const notify = (id) => listeners.forEach((fn) => fn(id));

  const api = {
    enabled: false,
    get signedIn() { return user !== null; },
    reactionFor: (id) => reactions.get(id) || null,
    onChange: (fn) => listeners.push(fn),
    setReaction: async () => {},
  };

  if (!supabaseUrl || !supabaseAnonKey || !window.supabase) return api;
  api.enabled = true;

  const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  const els = {
    root: document.getElementById("account"),
    signIn: document.getElementById("sign-in"),
    form: document.getElementById("sign-in-form"),
    email: document.getElementById("sign-in-email"),
    signedIn: document.getElementById("signed-in"),
    who: document.getElementById("account-email"),
    signOut: document.getElementById("sign-out"),
    message: document.getElementById("account-message"),
  };
  els.root.hidden = false;

  function showMessage(text) {
    els.message.textContent = text || "";
    els.message.hidden = !text;
  }

  function renderAccount() {
    els.signIn.hidden = user !== null;
    els.signedIn.hidden = user === null;
    if (user) els.form.hidden = true;
    els.who.textContent = user ? user.email : "";
  }

  async function loadReactions(forUser) {
    const { data, error } = await client
      .from("reactions")
      .select("idea_id, reaction")
      .eq("user_id", forUser.id);
    if (user !== forUser) return; // Signed out or switched while loading.
    if (error) {
      showMessage(`Couldn't load your likes (${error.message}).`);
      return;
    }
    data.forEach((r) => reactions.set(r.idea_id, r.reaction));
    notify();
  }

  client.auth.onAuthStateChange((_event, session) => {
    const next = session ? session.user : null;
    if ((next && next.id) === (user && user.id)) return; // Token refresh, same person.
    user = next;
    reactions.clear();
    renderAccount();
    notify();
    // Supabase calls inside this callback can deadlock the auth client, so defer.
    if (user) setTimeout(() => loadReactions(user), 0);
  });

  api.setReaction = async (idea, value) => {
    if (!user) return;
    const id = idea.id;
    const previous = reactions.get(id) || null;
    if (value) reactions.set(id, value);
    else reactions.delete(id);
    notify(id);

    const { error } = value
      ? await client.from("reactions").upsert({
          user_id: user.id,
          idea_id: id,
          reaction: value,
          idea_name: idea.name,
          idea_type: idea.type,
          idea_tags: idea.tags || [],
          idea_city: idea.city || null,
          idea_area: idea.area || null,
          updated_at: new Date().toISOString(),
        })
      : await client.from("reactions").delete().eq("user_id", user.id).eq("idea_id", id);

    if (error) {
      if (previous) reactions.set(id, previous);
      else reactions.delete(id);
      notify(id);
      showMessage(`Couldn't save that (${error.message}).`);
    }
  };

  els.signIn.addEventListener("click", () => {
    els.form.hidden = !els.form.hidden;
    if (!els.form.hidden) els.email.focus();
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = els.email.value.trim();
    if (!email) return;
    showMessage("Sending…");
    const { error } = await client.auth.signInWithOtp({
      email,
      // Accounts are added in the Supabase dashboard; the sign-in form never creates one.
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    showMessage(error ? `Couldn't send the link (${error.message}).` : `Check ${email} for a sign-in link.`);
    if (!error) els.form.hidden = true;
  });

  els.signOut.addEventListener("click", async () => {
    showMessage("");
    await client.auth.signOut();
  });

  renderAccount();
  return api;
})();
