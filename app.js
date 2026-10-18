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
    coming: document.getElementById("coming"),
    comingCards: document.getElementById("coming-cards"),
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

  // My places tabs, in order: [label, test on a mark]. The first is shown by default.
  const MINE_GROUPS = [
    ["Interested", (m) => !m.visited && m.interest === "interested"],
    ["Liked", (m) => m.visited && m.rating === "up"],
    ["Disliked", (m) => m.visited && m.rating === "down"],
    ["Been there", (m) => m.visited && !m.rating],
    ["Not interested", (m) => !m.visited && m.interest === "not_interested"],
  ];
  let mineTab = MINE_GROUPS[0][0];

  // The date a week from today in Taiwan, as YYYY-MM-DD.
  const weekAhead = new Date(Date.parse(today + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);

  // Events starting in the next 7 days, or already on and ending in the next 7 days.
  // Long-running ones that are simply open all week are left out so the row stays short.
  const isComingUp = (idea) => {
    if (idea.type !== "event" || !idea.start_date) return false;
    const start = idea.start_date, end = idea.end_date || start;
    if (end < today || start > weekAhead) return false;
    return start >= today || end <= weekAhead;
  };
  const bySoonest = (a, b) => (a.start_date || "").localeCompare(b.start_date || "") || a.name.localeCompare(b.name);

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
    const fresh = cards.filter((c) => !isDone(c.dataset.id));
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

  function renderComing() {
    const soon = ideas.filter(isComingUp).sort(bySoonest);
    els.comingCards.replaceChildren(...soon.map(renderCard));
    els.coming.hidden = soon.length === 0;
  }

  // Slowly drift the New today row to the right, then return to the start and go again.
  // Pauses while someone hovers, touches or tabs into it, and stays still for reduced motion.
  function startTodayAutoScroll() {
    const row = els.todayCards;
    const SPEED = 25; // pixels per second
    const END_PAUSE = 2000; // ms to rest at the end before going back
    const TOUCH_RESUME = 4000; // ms after a touch ends before drifting again
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hovering = false, touchedUntil = 0, restUntil = 0, returnPending = false;
    let pos = null, last = null;

    // Keyboard focus or typing in a review form holds the row still; a clicked button doesn't.
    const focusHeld = () => {
      const el = document.activeElement;
      return row.contains(el) && el.matches(":focus-visible, input, textarea, select");
    };

    // Mouse only: on phones a tap fires a hover that never ends, so touches are timed instead.
    row.addEventListener("pointerenter", (e) => (hovering = e.pointerType === "mouse"));
    row.addEventListener("pointerleave", () => (hovering = false));
    row.addEventListener("touchstart", () => (touchedUntil = Infinity), { passive: true });
    const touchDone = () => (touchedUntil = performance.now() + TOUCH_RESUME);
    row.addEventListener("touchend", touchDone, { passive: true });
    row.addEventListener("touchcancel", touchDone, { passive: true });

    function step(now) {
      const dt = last === null ? 0 : Math.min(now - last, 100);
      last = now;
      const max = row.scrollWidth - row.clientWidth;
      const paused = hovering || focusHeld() || now < touchedUntil || now < restUntil ||
        reduceMotion.matches || els.today.hidden || max <= 0;
      row.classList.toggle("drifting", !paused);
      if (paused) {
        pos = null; // pick up from wherever the person left it
      } else {
        // Follow any scroll that didn't come from the drift (scrollbar drag, Surprise me, etc.).
        if (pos === null || Math.abs(row.scrollLeft - pos) > 2) pos = row.scrollLeft;
        if (returnPending) {
          // Rested at the end; glide back and give the glide time to finish.
          returnPending = false;
          pos = null;
          restUntil = now + 1500;
          row.scrollTo({ left: 0, behavior: "smooth" });
        } else if (pos >= max - 1) {
          returnPending = true;
          restUntil = now + END_PAUSE;
        } else {
          pos = Math.min(max, pos + (SPEED * dt) / 1000);
          row.scrollLeft = pos;
        }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
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

  // My places: a row of tabs, one per group, and the chosen group's cards.
  // Ideas gone from the file use the saved snapshot.
  function renderMine() {
    const entries = account.allMarks();
    const lists = new Map(MINE_GROUPS.map(([title, test]) => [title,
      entries.filter(([, m]) => test(m)).map(([id, m]) =>
        allIdeas.get(id) || { id, name: m.idea_name || id, type: m.idea_type, tags: m.idea_tags, city: m.idea_city, area: m.idea_area }
      ).sort((a, b) => a.name.localeCompare(b.name)),
    ]));

    const tabs = document.createElement("div");
    tabs.className = "chips mine-tabs";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "My places");
    MINE_GROUPS.forEach(([title]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip mine-tab";
      b.dataset.tab = title;
      b.textContent = `${title} (${lists.get(title).length})`;
      b.classList.toggle("active", title === mineTab);
      b.setAttribute("aria-pressed", String(title === mineTab));
      tabs.append(b);
    });

    const parts = [tabs];
    const list = lists.get(mineTab);
    // Interested events happening this week get their own row at the top of Interested.
    const soon = mineTab === "Interested" ? list.filter(isComingUp).sort(bySoonest) : [];
    if (soon.length) parts.push(mineSection("Coming Up", soon, "today-cards"));
    if (list.length) parts.push(mineSection(soon.length ? `All ${mineTab.toLowerCase()}` : "", list, "cards"));
    else {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Nothing here yet.";
      parts.push(p);
    }
    els.mineGroups.replaceChildren(...parts);
    els.mineGroups.hidden = entries.length === 0;
    els.mineEmpty.hidden = entries.length > 0;
  }

  function mineSection(title, list, layout) {
    const section = document.createElement("section");
    section.className = "mine-group";
    if (title) {
      const h = document.createElement("h2");
      h.className = "section-title";
      h.textContent = title;
      section.append(h);
    }
    const cards = document.createElement("div");
    cards.className = layout;
    cards.append(...list.map(renderCard));
    section.append(cards);
    return section;
  }

  els.mineGroups.addEventListener("click", (e) => {
    const tab = e.target.closest(".mine-tab");
    if (!tab) return;
    mineTab = tab.dataset.tab;
    renderMine();
  });


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
      // While a review box is open, regrouping would throw away what's being typed,
      // so update the buttons in place and regroup once it closes.
      if (els.mine.querySelector(".review-form:not([hidden])")) {
        els.mine.querySelectorAll(".card").forEach((c) => c.dataset.id === id && setToggles(c, id));
      } else renderMine();
      return;
    }
    // The same idea can be in New today, Coming Up and the main list, so update every copy.
    [els.todayCards, els.comingCards].forEach((row) =>
      row.querySelectorAll(".card").forEach((c) => c.dataset.id === id && setToggles(c, id)));
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
      if (view === "mine") renderMine(); // Catch up on marks changed while it was open.
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
  els.comingCards.addEventListener("click", onToggle);
  els.mine.addEventListener("click", onToggle);
  [els.cards, els.todayCards, els.comingCards, els.mine].forEach((el) => el.addEventListener("submit", onReviewSubmit));

  els.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) showView(tab.dataset.view);
  });

  account.onChange((id) => {
    if (id) return refreshIdea(id);
    // Signed in or out, or the whole list loaded.
    showView(view);
    renderToday();
    renderComing();
    render();
  });

  startTodayAutoScroll();

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
      renderComing();
      render();
      if (view === "mine") renderMine();
    })
    .catch((err) => {
      els.empty.textContent = `Couldn't load ideas (${err.message}).`;
      els.empty.hidden = false;
    });
})();
