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
    sort: document.getElementById("sort"),
    count: document.getElementById("count"),
    reset: document.getElementById("reset"),
    cards: document.getElementById("cards"),
    empty: document.getElementById("empty"),
    template: document.getElementById("card-template"),
  };

  let ideas = [];
  let type = "all";

  const today = new Date().toISOString().slice(0, 10);

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
    return node;
  }

  function render() {
    const list = ideas.filter(matches).sort(comparators[els.sort.value] || comparators.featured);
    els.cards.replaceChildren(...list.map(renderCard));
    els.empty.hidden = list.length > 0;
    els.count.textContent = `${list.length} idea${list.length === 1 ? "" : "s"}`;
  }

  function reset() {
    type = "all";
    els.typeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.value === "all"));
    els.search.value = "";
    [els.city, els.price, els.status].forEach((s) => (s.value = "all"));
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
  [els.area, els.price, els.status, els.sort].forEach((s) => s.addEventListener("change", render));
  els.search.addEventListener("input", render);
  els.reset.addEventListener("click", reset);

  fetch("data/ideas.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      ideas = data.filter(isCurrent);
      fillSelect(els.city, sortedCities(), "Everywhere");
      refreshAreas();
      render();
    })
    .catch((err) => {
      els.empty.textContent = `Couldn't load ideas (${err.message}).`;
      els.empty.hidden = false;
    });
})();
