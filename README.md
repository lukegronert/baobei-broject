# Baobei Broject

Date ideas for Taipei and around Taiwan: activities, restaurants, places to visit and events, with filters for type, city, area, price and status.

It's a plain static site (`index.html`, `styles.css`, `app.js`) with no build step. All ideas live in [`data/ideas.json`](data/ideas.json).

## Favorites, done and surprise me

Each card has a heart (favorite) and a check (done). These marks are saved in the browser's `localStorage`, so they stay on that device and browser only. The **Saved** filter shows favorites, ideas not done yet, or done ones. **Surprise me** highlights a random idea from whatever the current filters show, skipping ones marked done when it can.

A **New today** row above the list shows every idea whose `added_at` is today, regardless of filters, and hides itself when nothing was added.

Dates are compared against today's date in Taiwan (Asia/Taipei), so past events drop off at midnight Taipei time wherever you open the site.

## Sign-in, been here, ratings and reviews

Signing in adds a row of buttons to every card:

- **Interested** / **Not interested**, for places you haven't been yet.
- **📍 Been here**. Once marked, the card offers **👍** / **👎** and a written **review** instead. Un-marking it clears the rating and review.

Signed in, Been here replaces the browser-only ✓ done mark, and a **My places** tab lists everything you've marked, grouped into Liked, Disliked, Been there (not rated), Interested and Not interested.

Marks are saved to a free [Supabase](https://supabase.com) project, so they follow you across devices and the morning scout can read them. Until `config.js` has a project URL and key, the sign-in link stays hidden and the site works as before.

One-time setup:

1. Create a free Supabase project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
2. **Authentication → Users → Add user → Create new user** for each person who should be able to sign in: an email and a password, with **Auto Confirm User** ticked. Supabase stores the password hashed. Then let them save marks by running this in **SQL Editor** with their emails:
   ```sql
   insert into public.allowed_users (user_id)
   select id from auth.users where email in ('you@example.com', 'partner@example.com');
   ```
   Also turn off **Authentication → Sign In / Providers → Allow new users to sign up**. Even if that's missed, a stranger who signs up can't save anything, because only `allowed_users` can.
3. **Project Settings → API**: copy the Project URL and the `anon` public key into [`config.js`](config.js). The anon key is meant to be public; never put the `service_role` key in this repo.

Sign in on the site with that email and password.

### Reading marks (for the morning scout)

Anyone with the anon key can read marks, with no sign-in:

```sh
curl -s "$SUPABASE_URL/rest/v1/idea_marks?select=idea_id,interest,visited,rating,review,idea_name,idea_type,idea_tags,idea_city,idea_area,updated_at&order=updated_at.desc" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

Both values are in `config.js`. `interest` is `interested`, `not_interested` or null; `visited` is true once been there, and then `rating` (`up`, `down` or null) and `review` (up to 2,000 characters) say how it went. A visited row can still carry the `interest` set before the visit: once `visited` is true, go by `rating` and `review` and ignore `interest`. Every row belongs to someone in `allowed_users`, so the scout doesn't need to filter by user. Reviews are readable by anyone with the anon key, so don't write anything private in them. Each row carries a snapshot of the idea's name, type, tags and place, so it still makes sense after the idea leaves `ideas.json`.

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
