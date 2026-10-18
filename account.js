// Sign-in and per-idea marks (interested / not interested, been here, rating,
// review), backed by Supabase (see config.js and supabase/schema.sql). Without
// a configured project this stays inert and the site works as before.
window.baobeiAccount = (() => {
  const { supabaseUrl, supabaseAnonKey } = window.BAOBEI_CONFIG || {};
  const listeners = [];
  // idea_id -> { interest, visited, rating, review, idea_name, ... } for the signed-in user.
  const marks = new Map();
  const EMPTY = Object.freeze({ interest: null, visited: false, rating: null, review: "" });
  let user = null;

  // Listeners get an idea id when one mark changed, nothing when they all did.
  const notify = (id) => listeners.forEach((fn) => fn(id));

  const isEmpty = (m) => !m.interest && !m.visited && !m.rating && !m.review;

  const api = {
    enabled: false,
    get signedIn() { return user !== null; },
    markFor: (id) => marks.get(id) || EMPTY,
    allMarks: () => [...marks.entries()],
    onChange: (fn) => listeners.push(fn),
    update: async () => {},
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

  async function loadMarks(forUser) {
    const { data, error } = await client.from("idea_marks").select("*").eq("user_id", forUser.id);
    if (user !== forUser) return; // Signed out or switched while loading.
    if (error) {
      showMessage(`Couldn't load your list (${error.message}).`);
      return;
    }
    data.forEach((row) => marks.set(row.idea_id, { ...row, review: row.review || "" }));
    notify();
  }

  client.auth.onAuthStateChange((_event, session) => {
    const next = session ? session.user : null;
    if ((next && next.id) === (user && user.id)) return; // Token refresh, same person.
    user = next;
    marks.clear();
    showMessage("");
    renderAccount();
    notify();
    // Supabase calls inside this callback can deadlock the auth client, so defer.
    if (user) setTimeout(() => loadMarks(user), 0);
  });

  // Merge changes into the idea's mark, show it at once, then save; on failure, roll back.
  api.update = async (idea, changes) => {
    if (!user) return;
    const id = idea.id;
    const previous = marks.get(id);
    const next = { ...EMPTY, ...previous, ...changes };
    if (isEmpty(next)) marks.delete(id);
    else marks.set(id, next);
    notify(id);

    const { error } = isEmpty(next)
      ? await client.from("idea_marks").delete().eq("user_id", user.id).eq("idea_id", id)
      : await client.from("idea_marks").upsert({
          user_id: user.id,
          idea_id: id,
          interest: next.interest,
          visited: next.visited,
          rating: next.rating,
          review: next.review || null,
          idea_name: idea.name,
          idea_type: idea.type,
          idea_tags: idea.tags || [],
          idea_city: idea.city || null,
          idea_area: idea.area || null,
        });

    if (error) {
      if (previous) marks.set(id, previous);
      else marks.delete(id);
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
