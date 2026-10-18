(() => {
  const TYPE_LABELS = { activity: "Activity", restaurant: "Restaurant", place: "Place", event: "Event" };
  const STATUS_RANK = { new: 0, trending: 1, classic: 2 };
  // Cities listed first in the City filter; anything else follows alphabetically.
  const CITY_ORDER = ["Taipei", "New Taipei"];

  const els = {
    search: document.getElementById("search"),
    typeChips: document.getElementById("type-chips"),
    city: document.getElementById("city"),
    area: document.getElementById("area"),
    price: document.getElementById("price"),
    status: document.getElementById("status"),
    saved: document.getElementById("saved"),
    sort: document.getElementById("sort"),
    count: document.getElementById("count"),
    reset: document.getElementById("reset"),
    surprise: document.getElementById("surprise"),
    cards: document.getElementById("cards"),
    today: document.getElementById("today"),
    todayCards: document.getElementById("today-cards"),
    empty: document.getElementById("empty"),
    template: document.getElementById("card-template"),
    tabs: document.getElementById("tabs"),
    browse: document.getElementById("browse"),
    mine: document.getElementById("mine"),
    mineGroups: document.getElementById("mine-groups"),
    mineEmpty: document.getElementById("mine-empty"),
  };

  let ideas = [];
  // Every idea in the file, including past ones, so My places can still show them.
  let allIdeas = new Map();
  let view = "browse";
  let type = "all";

  // Today's date in Taiwan as YYYY-MM-DD, whatever the viewer's own time zone.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  // Favorites and done marks live in this browser only.
  const STORAGE_KEYS = { favorites: "baobei.favorites", done: "baobei.done" };

  function loadSet(key) {
    try {
      const ids = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  }

  function saveSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      // Storage blocked (private mode etc.): marks still work until the page reloads.
    }
  }

  const favorites = loadSet(STORAGE_KEYS.favorites);
  const done = loadSet(STORAGE_KEYS.done);

  // Interest, been here, ratings and reviews are saved to the signed-in account (account.js).
  // Signed in, "done" means been here; signed out it's the browser-only mark.
  const account = window.baobeiAccount;
  const isDone = (id) => (account.signedIn ? account.markFor(id).visited : done.has(id));

  // My places, in order: [heading, test on a mark].
  const MINE_GROUPS = [
    ["Liked", (m) => m.visited && m.rating === "up"],
    ["Disliked", (m) => m.visited && m.rating === "down"],
    ["Been there, not rated yet", (m) => m.visited && !m.rating],
    ["Interested", (m) => !m.visited && m.interest === "interested"],
    ["Not interested", (m) => !m.visited && m.interest === "not_interested"],
  ];

  // Drop events and openings whose end date has already passed.
  const isCurrent = (idea) => !idea.end_date || idea.end_date >= today;

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function dateText(idea) {
    const { start_date: start, end_date: end } = idea;
    if (!start && !end) return "";
    if (start && end && start !== end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (start && start > today) return `${idea.type === "event" ? "Starts" : "Opens"} ${formatDate(start)}`;
    if (start) return formatDate(start);
    return `Until ${formatDate(end)}`;
  }

  function sortedCities() {
    const cities = [...new Set(ideas.map((i) => i.city).filter(Boolean))];
    return cities.sort((a, b) => {
      const ia = CITY_ORDER.indexOf(a), ib = CITY_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = "";
    select.append(new Option(allLabel, "all"));
    values.forEach((v) => select.append(new Option(v, v)));
    select.value = values.includes(current) ? current : "all";
  }

  function refreshAreas() {
    const city = els.city.value;
    const areas = [...new Set(
      ideas.filter((i) => city === "all" || i.city === city).map((i) => i.area).filter(Boolean)
    )].sort();
    fillSelect(els.area, areas, "All areas");
  }

  function matches(idea) {
    if (type !== "all" && idea.type !== type) return false;
    if (els.city.value !== "all" && idea.city !== els.city.value) return false;
    if (els.area.value !== "all" && idea.area !== els.area.value) return false;
    if (els.price.value !== "all" && (idea.price || 0) > Number(els.price.value)) return false;
    if (els.status.value !== "all" && idea.status !== els.status.value) return false;
    if (els.saved.value === "favorites" && !favorites.has(idea.id)) return false;
    if (els.saved.value === "todo" && isDone(idea.id)) return false;
    if (els.saved.value === "done" && !isDone(idea.id)) return false;
    const q = els.search.value.trim().toLowerCase();
    if (q) {
      const hay = [idea.name, idea.description, idea.city, idea.area, ...(idea.tags || [])]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  const comparators = {
    featured: (a, b) =>
      (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
      (b.added_at || "").localeCompare(a.added_at || ""),
    recent: (a, b) => (b.added_at || "").localeCompare(a.added_at || ""),
    soonest: (a, b) => (a.start_date || "9999").localeCompare(b.start_date || "9999"),
    price: (a, b) => (a.price || 0) - (b.price || 0),
    name: (a, b) => a.name.localeCompare(b.name),
  };

  function link(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function renderCard(idea) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".type").textContent = TYPE_LABELS[idea.type] || idea.type;

    const badges = node.querySelector(".badges");
    if (idea.status === "new" || idea.status === "trending") {
      const b = document.createElement("span");
      b.className = `badge ${idea.status}`;
      b.textContent = idea.status === "new" ? "New" : "Trending";
      badges.append(b);
    }

    node.querySelector(".name").textContent = idea.name;
    const where = [idea.area, idea.city].filter(Boolean).join(", ");
    const price = idea.price ? "$".repeat(idea.price) : "";
    node.querySelector(".meta").textContent = [where, price].filter(Boolean).join(" · ");

    const dates = dateText(idea);
    if (dates) {
      const el = node.querySelector(".dates");
      el.textContent = dates;
      el.hidden = false;
    }

    node.querySelector(".description").textContent = idea.description || "";

    const tags = node.querySelector(".tags");
    (idea.tags || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      tags.append(li);
    });

    const links = node.querySelector(".links");
    if (idea.url) links.append(link(idea.url, "Website"));
    if (idea.maps_url) links.append(link(idea.maps_url, "Map"));

    node.dataset.id = idea.id;
    setToggles(node, idea.id);
    return node;
  }

  function setToggles(node, id) {
    const isFav = favorites.has(id), wasDone = isDone(id);
    const fav = node.querySelector(".toggle.fav");
    fav.textContent = isFav ? "♥" : "♡";
    fav.setAttribute("aria-pressed", String(isFav));
    fav.title = isFav ? "Remove from favorites" : "Add to favorites";
    fav.setAttribute("aria-label", fav.title);
    const doneBtn = node.querySelector(".toggle.done");
    // Signed in, the Been here button below takes over from this one.
    doneBtn.hidden = account.signedIn;
    doneBtn.setAttribute("aria-pressed", String(wasDone));
    doneBtn.title = wasDone ? "Mark as not done" : "Mark as done";
    doneBtn.setAttribute("aria-label", doneBtn.title);
    node.classList.toggle("is-done", wasDone && !account.signedIn);
    setMarks(node, id);
  }

  function setMarks(node, id) {
    const m = account.markFor(id);
    node.querySelector(".marks").hidden = !account.signedIn;
    node.querySelectorAll(".mark").forEach((btn) => {
      const kind = btn.dataset.mark;
      // Interest is for places not visited yet; rating and review only once visited.
      btn.hidden = (kind === "interested" || kind === "not_interested") ? m.visited
        : (kind === "up" || kind === "down" || kind === "review") ? !m.visited
        : false;
      const pressed = kind === "visited" ? m.visited
        : kind === "up" || kind === "down" ? m.rating === kind
        : kind === "review" ? false
        : m.interest === kind;
      btn.setAttribute("aria-pressed", String(pressed));
    });
    node.querySelector(".mark.review").textContent = m.review ? "✎ Edit review" : "✎ Review";
    const review = node.querySelector(".my-review");
    review.textContent = m.review ? `“${m.review}”` : "";
    review.hidden = !account.signedIn || !m.review;
    node.classList.toggle("is-visited", account.signedIn && m.visited);
  }

  function toggleMark(set, key, id) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
    saveSet(key, set);
  }

  function surprise() {
    const cards = [...els.cards.querySelectorAll(".card")];
    // Prefer ideas not done yet, unless the Done filter is what's showing.
    const fresh = cards.filter((c) => !c.classList.contains("is-done"));
    const pool = fresh.length ? fresh : cards;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    cards.forEach((c) => c.classList.remove("picked"));
    pick.classList.add("picked");
    pick.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Ideas the scout added today, shown above the filters' results whatever they are.
  function renderToday() {
    const fresh = ideas.filter((i) => i.added_at === today).sort(comparators.featured);
    els.todayCards.replaceChildren(...fresh.map(renderCard));
    els.today.hidden = fresh.length === 0;
  }

  function render() {
    const list = ideas.filter(matches).sort(comparators[els.sort.value] || comparators.featured);
    els.cards.replaceChildren(...list.map(renderCard));
    els.empty.hidden = list.length > 0;
    els.count.textContent = `${list.length} idea${list.length === 1 ? "" : "s"}`;
    els.surprise.disabled = list.length === 0;
  }

  function reset() {
    type = "all";
    els.typeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.value === "all"));
    els.search.value = "";
    [els.city, els.price, els.status, els.saved].forEach((s) => (s.value = "all"));
    els.sort.value = "featured";
    refreshAreas();
    render();
  }

  els.typeChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    type = chip.dataset.value;
    els.typeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    render();
  });
  els.city.addEventListener("change", () => { refreshAreas(); render(); });
  [els.area, els.price, els.status, els.saved, els.sort].forEach((s) => s.addEventListener("change", render));
  els.search.addEventListener("input", render);
  els.reset.addEventListener("click", reset);
  els.surprise.addEventListener("click", surprise);

  // A card for each idea in My places, grouped. Ideas gone from the file use the saved snapshot.
  function renderMine() {
    const entries = account.allMarks();
    const groups = MINE_GROUPS.map(([title, test]) => {
      const list = entries.filter(([, m]) => test(m)).map(([id, m]) =>
        allIdeas.get(id) || { id, name: m.idea_name || id, type: m.idea_type, tags: m.idea_tags, city: m.idea_city, area: m.idea_area }
      ).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) return null;
      const section = document.createElement("section");
      section.className = "mine-group";
      const h = document.createElement("h2");
      h.className = "section-title";
      h.textContent = `${title} (${list.length})`;
      const cards = document.createElement("div");
      cards.className = "cards";
      cards.append(...list.map(renderCard));
      section.append(h, cards);
      return section;
    }).filter(Boolean);
    els.mineGroups.replaceChildren(...groups);
    els.mineEmpty.hidden = groups.length > 0;
  }

  function showView(next) {
    view = account.signedIn ? next : "browse";
    els.tabs.hidden = !account.signedIn;
    els.tabs.querySelectorAll(".tab").forEach((t) => {
      const active = t.dataset.view === view;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    els.browse.hidden = view !== "browse";
    els.mine.hidden = view !== "mine";
    if (view === "mine") renderMine();
  }

  function refreshIdea(id) {
    if (view === "mine") {
      // Keep an open review box: re-rendering would throw away what's being typed.
      if (!els.mine.querySelector(".review-form:not([hidden])")) renderMine();
      return;
    }
    // The same idea can be in both New today and the main list, so update every copy.
    els.todayCards.querySelectorAll(".card").forEach((c) => c.dataset.id === id && setToggles(c, id));
    // Re-render only when the Saved filter could hide this card; otherwise update in place.
    if (els.saved.value === "all") els.cards.querySelectorAll(".card").forEach((c) => c.dataset.id === id && setToggles(c, id));
    else render();
  }

  const findIdea = (id) => {
    const m = account.markFor(id);
    return allIdeas.get(id) || { id, name: m.idea_name || id, type: m.idea_type, tags: m.idea_tags, city: m.idea_city, area: m.idea_area };
  };

  // Clicking a pressed mark clears it. account.js calls refreshIdea via onChange.
  function onMark(card, btn) {
    const id = card.dataset.id, kind = btn.dataset.mark, m = account.markFor(id), idea = findIdea(id);
    if (kind === "review") {
      const form = card.querySelector(".review-form");
      form.querySelector("textarea").value = m.review;
      form.hidden = false;
      form.querySelector("textarea").focus();
      return;
    }
    if (kind === "visited") {
      if (!m.visited) return account.update(idea, { visited: true });
      if ((m.rating || m.review) && !confirm("Remove your rating and review for this place too?")) return;
      return account.update(idea, { visited: false, rating: null, review: "" });
    }
    if (kind === "up" || kind === "down") return account.update(idea, { rating: m.rating === kind ? null : kind });
    account.update(idea, { interest: m.interest === kind ? null : kind });
  }

  function onReviewSubmit(e) {
    const form = e.target.closest(".review-form");
    if (!form) return;
    e.preventDefault();
    const card = form.closest(".card");
    form.hidden = true;
    account.update(findIdea(card.dataset.id), { review: form.querySelector("textarea").value.trim() });
  }

  function onToggle(e) {
    const card = e.target.closest(".card");
    if (!card) return;
    if (e.target.closest(".review-cancel")) {
      card.querySelector(".review-form").hidden = true;
      return;
    }
    const mark = e.target.closest(".mark");
    if (mark) return onMark(card, mark);
    const btn = e.target.closest(".toggle");
    if (!btn) return;
    const id = card.dataset.id;
    if (btn.classList.contains("fav")) toggleMark(favorites, STORAGE_KEYS.favorites, id);
    else toggleMark(done, STORAGE_KEYS.done, id);
    refreshIdea(id);
  }
  els.cards.addEventListener("click", onToggle);
  els.todayCards.addEventListener("click", onToggle);
  els.mine.addEventListener("click", onToggle);
  [els.cards, els.todayCards, els.mine].forEach((el) => el.addEventListener("submit", onReviewSubmit));

  els.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) showView(tab.dataset.view);
  });

  account.onChange((id) => {
    if (id) return refreshIdea(id);
    // Signed in or out, or the whole list loaded.
    showView(view);
    renderToday();
    render();
  });

  fetch("data/ideas.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      allIdeas = new Map(data.map((i) => [i.id, i]));
      ideas = data.filter(isCurrent);
      fillSelect(els.city, sortedCities(), "Everywhere");
      refreshAreas();
      renderToday();
      render();
      if (view === "mine") renderMine();
    })
    .catch((err) => {
      els.empty.textContent = `Couldn't load ideas (${err.message}).`;
      els.empty.hidden = false;
    });
})();
