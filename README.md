# Baobei Broject

Date ideas for Taipei and around Taiwan: activities, restaurants, places to visit and events, with filters for type, city, area, price and status.

It's a plain static site (`index.html`, `styles.css`, `app.js`) with no build step. All ideas live in [`data/ideas.json`](data/ideas.json).

## Favorites, done and surprise me

Each card has a heart (favorite) and a check (done). These marks are saved in the browser's `localStorage`, so they stay on that device and browser only. The **Saved** filter shows favorites, ideas not done yet, or done ones. **Surprise me** highlights a random idea from whatever the current filters show, skipping ones marked done when it can.

Dates are compared against today's date in Taiwan (Asia/Taipei), so past events drop off at midnight Taipei time wherever you open the site.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly from disk won't load the data, because browsers block `fetch` on `file://`.)

## Hosting on GitHub Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**. The site appears at `https://lukegronert.github.io/baobei-broject/`.

## Data format

`data/ideas.json` is an array of objects:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, kebab-case |
| `name` | string | |
| `type` | `activity` \| `restaurant` \| `place` \| `event` | |
| `city` | string | e.g. `Taipei`, `New Taipei`, `Tainan` |
| `area` | string | District or neighborhood |
| `price` | 1–4 | `$` to `$$$$` |
| `tags` | string[] | Free-form, searchable |
| `description` | string | One or two sentences |
| `url` | string | Official site, may be empty |
| `maps_url` | string | Google Maps link, may be empty |
| `status` | `classic` \| `new` \| `trending` | Drives the New / Trending badges |
| `start_date` | ISO date, optional | For events and upcoming openings |
| `end_date` | ISO date, optional | Ideas past their end date are hidden automatically |
| `added_at` | ISO date | When it was added |
| `source` | string | Where the info came from |
