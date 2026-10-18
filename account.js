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
    button: document.getElementById("account-button"),
    initial: document.getElementById("account-initial"),
    menu: document.getElementById("account-menu"),
    form: document.getElementById("sign-in-form"),
    // Found by type rather than id, so a page and script from different versions still match up.
    username: document.querySelector('#sign-in-form input:not([type="password"])'),
    password: document.querySelector('#sign-in-form input[type="password"]'),
    signedIn: document.getElementById("signed-in"),
    who: document.getElementById("account-email"),
    signOut: document.getElementById("sign-out"),
    message: document.getElementById("account-message"),
  };
  els.root.hidden = false;

  // The icon in the top right opens a small menu: the sign-in form, or who's signed in and Sign out.
  function setMenu(open) {
    els.menu.hidden = !open;
    els.button.setAttribute("aria-expanded", String(open));
    if (open && !user) els.username.focus();
  }

  // Messages live in the menu, so open it to show one (a failed save, say).
  function showMessage(text) {
    els.message.textContent = text || "";
    els.message.hidden = !text;
    if (text) setMenu(true);
  }

  function renderAccount() {
    const name = user ? user.email.replace(/@baobei\.local$/, "") : "";
    els.form.hidden = user !== null;
    els.signedIn.hidden = user === null;
    els.who.textContent = name;
    els.initial.textContent = name.charAt(0).toUpperCase();
    els.initial.hidden = !user;
    els.button.querySelector(".account-icon").style.display = user ? "none" : "";
    els.button.classList.toggle("signed-in", user !== null);
    const label = user ? `Signed in as ${name}` : "Sign in";
    els.button.setAttribute("aria-label", label);
    els.button.title = label;
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
    setMenu(false);
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

  els.button.addEventListener("click", () => setMenu(els.menu.hidden));
  // Close on a click elsewhere or Escape.
  document.addEventListener("click", (e) => {
    if (!els.menu.hidden && !els.root.contains(e.target)) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.menu.hidden) {
      setMenu(false);
      els.button.focus();
    }
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = els.username.value.trim().toLowerCase();
    if (!username || !els.password.value) return;
    // Supabase signs in by email, so a username stands for <username>@baobei.local.
    // Nothing is ever sent there; a full email still works as typed.
    const email = username.includes("@") ? username : `${username}@baobei.local`;
    showMessage("Signing in…");
    // Accounts are made in the Supabase dashboard, which stores the password hashed.
    const { error } = await client.auth.signInWithPassword({ email, password: els.password.value });
    els.password.value = "";
    showMessage(error ? `Couldn't sign in (${error.message}).` : "");
  });

  els.signOut.addEventListener("click", async () => {
    showMessage("");
    await client.auth.signOut();
  });

  renderAccount();
  return api;
})();
