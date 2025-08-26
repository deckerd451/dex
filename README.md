# Dex – Building the Brain of Global Innovation

This repository contains a completely self‑contained web application that
implements the core features of **Dex**, a tool for exploring and
understanding innovation ecosystems.  It combines the data and
functionality from the original `dex_site_final.zip` with a refreshed
user interface inspired by CharlestonHacks.  The site can be served
directly from GitHub Pages or any static web host and requires no
build step.

## Features

* **Persona‑driven experience** – choose from Founder, Investor,
  University Tech Transfer, or Service Provider personas.  Dex
  personalises alerts, dashboards and suggestions based on your role.
* **Interactive force‑directed graph** – visualises organisations and
  people along with their relationships.  Nodes are glowing dots
  whose colours correspond to their role (startups, investors,
  universities, incubators, service providers or individuals).  Their
  size scales modestly with importance, and you can drag any node to
  reposition it if you wish to rearrange the layout.  Connections
  between nodes are coloured according to the relationship (investment,
  spin‑out, support, service, consulting or shared interest) and
  pulsate softly.  A clustering algorithm organises nodes into
  logical groups so that the layout remains legible even with
  cross‑links between categories.  The graph supports pan/zoom.
  Clicking on a node opens a detailed panel with description,
  external links, photo and note taking.  Clicking on a connection
  reveals how the entities are related and provides shortcuts to
  explore each one.
* **Clickable synapses** – the connections between nodes (links) are
  interactive.  Selecting a link (either by clicking directly on the
  glowing line or by clicking near it) reveals contextual
  information about how two entities are related and provides quick
  navigation to either endpoint.
* **Watchlist and notes persistence** – add organisations to your
  personal watchlist and record notes.  Data is persisted locally
  using `localStorage` by default.  Optionally, you can configure
  [Supabase](https://supabase.com/) to sync watchlists and notes in
  the cloud and support user registration via magic‑link
  authentication.  See the **Supabase configuration** section below.
* **Alerts and ordered suggestions** – persona‑specific alerts highlight
  recent news and events in the ecosystem.  A recommendation engine
  ranks other entities to explore based on graph connectivity,
  shared interests, popularity and your current watchlist.  The
  suggestions panel explains why each entity is recommended and
  orders them so you know who to contact first.
* **Starry backdrop and modern UI** – the design takes visual cues
  from CharlestonHacks, with a dark, starry background and clean
  panels.  A theme toggle lets you switch between light and dark
  modes.  Glowing, pulsing nodes and lines echo the feel of a neural
  network or galaxy cluster, making the experience both informative
  and visually engaging.

* **Community member photos** – each organisation or community member
  can include an `image_url` in `data.js` or your CSV export.  When
  available, Dex displays this photo in the details panel alongside
  the description.  The images inherit the glow colour of their node
  for consistency.

## Running the application

No build step is required.  To run the app locally, simply open
`index.html` in a modern browser:

```sh
firefox index.html
# or
chromium index.html
```

To deploy to GitHub Pages, place the contents of the `dex_site_updated`
directory at the root of your `gh-pages` branch.  Ensure that the
repository settings point to the correct branch and folder.  Since
all dependencies are bundled and loaded from CDNs, the site will work
without any server‑side code.

### Loading your community CSV

To include additional people in the graph and suggestion engine,
place your community export CSV in the project root.  Dex will
attempt to load `Community.csv` first and will fall back to the
legacy filename `Supabase Snippet Community Data Retrieval.csv` if
present.  Each row should contain at least:

* `Name` – the person’s name (required).
* `Role` or `Company` – used to infer the type (startup, investor,
  university, incubator or service provider).
* `Description` – a short bio or summary.
* `Interests` – a semicolon, comma or pipe‑separated list of topics.
* `Image` or `Photo` – URL to a profile picture (optional).

When the CSV is present, Dex parses it on startup and adds a new
node for every person.  Shared interests between people and
organisations create new “interest” connections in the graph.  Photos
appear in the details panel if an image URL is provided.  If the
CSV is missing or cannot be parsed, Dex silently falls back to the
built‑in sample data.

### Pulling community data from Supabase

If you have configured Supabase (see below) and your database includes a
table named `community`, Dex will fetch rows from that table in
addition to or instead of the CSV.  Each row should contain at
minimum:

* `id` (UUID) – unique identifier used as the node ID.
* `name` (text) – the person’s full name.
* `bio` (text) – a short biography used as the node description.
* `interests` (array of text) – topics to match against existing
  organisations; shared interests create `interest` links.
* `image_url` (text) – URL to a profile picture (optional).

Additional columns such as `endorsements` (integer) are used to
scale the node size; columns `x` and `y` are ignored.  Any other
fields remain unused but can be incorporated by modifying
`loadCommunityData()` in `app.js`.

If both a CSV and a Supabase table are present, Dex merges their
results and deduplicates nodes where possible.

## Supabase configuration

Dex supports optional cloud persistence via Supabase.  To enable it:

1. Create a Supabase project and note the **Project URL** and
   **Anon Public Key** from the project settings.
2. Define two tables in your Supabase database:
   * `watchlists` with columns `user_id` (UUID), `node_id` (text),
     `name` (text) and `type` (text).  Create a composite
     unique constraint on `(user_id, node_id)`.
   * `notes` with columns `user_id` (UUID), `node_id` (text) and
     `note` (text).  Create a composite unique constraint on
     `(user_id, node_id)`.
3. Edit `index.html` and set `window.SUPABASE_URL` and
   `window.SUPABASE_ANON_KEY` to your project URL and anon key.
4. When you load the site, you will be prompted for your email
   address.  Supabase will send a magic link for passwordless login.

If the Supabase variables are left empty, Dex falls back to using
`localStorage` and will not prompt for authentication.

## To‑do and future improvements

This version of Dex implements the core concepts outlined in the
presentation, but there is plenty of room to expand.  Future
enhancements might include:

* **Realtime data ingestion** – integrate with public and private data
  sources to ingest new organisations, funding rounds and news in
  realtime.
* **Advanced analytics and machine learning** – replace the simple
  suggestion scoring function with predictive models that recommend
  connections, opportunities or risks based on user behaviour and
  graph structure.
* **User profiles and sharing** – allow users to curate custom
  dashboards, share watchlists and collaborate with team members.
* **Rich link metadata** – expand the link objects to include
  relationship types (e.g. “funded”, “mentored”, “collaborated”) and
  surface this context in the connection panel.
* **Accessibility improvements** – audit the site for WCAG
  compliance, add keyboard navigation and ARIA attributes.

We welcome contributions and ideas!  Please open issues or pull
requests with suggestions for improvements.