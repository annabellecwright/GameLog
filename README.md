# GameLog

A pretty, static site for showing off a video game collection. Search it, filter
it by console, sort it, click any cover for the details. Host it free on GitHub
Pages.

The page opens with **you**: photo, name, a few words, your links. Your
collection begins right underneath, so someone following a shared link learns
whose shelf this is and what's on it without clicking anything.

No framework, no build step, no dependencies. The repo *is* the site: a page, a
stylesheet, a script, and one JSON file holding your collection. Edit it through
a local UI (`npm run manage`), a CLI, or a text editor, whichever you prefer.

**Views:**

- **Shelf**: the cover grid, with search, platform filters and sorting.
- **Timeline**: your collection by release year, gaps and all.
- **Lists**: backlogs, wishlists, favourites; owned games and hunted ones.
- **Stats**: decades, platforms, genres, scores and condition at a glance.
- **Compare**: point it at *somebody else's* GameLog and see what you share.

**Compare** is the reason this is a static site rather than an app. Every
GameLog publishes its `collection.json` openly, and GitHub Pages serves it with
`access-control-allow-origin: *`, so any GameLog can read any other one straight
from the browser. No server, no accounts, no API in between. Paste a friend's
address and you get three lists: what they have that you don't, what you both
have, and what's yours alone.

Add the ones you follow to `data/config.json` and they become one-click buttons:

```json
"friends": [
  { "name": "Sam", "url": "https://sam.github.io/GameLog/" }
]
```

---

## Make it yours

There are two ways to set up your own GameLog. The numbered steps further down
are the quick path if you use git and a terminal. If you would rather not, the
click-only walkthrough here does the whole thing with buttons.

### Not a coder? Start here

You can run your own GameLog without typing a single command. You need three
free things: a GitHub account, GitHub Desktop, and Node.js. Setup takes about ten
minutes and you only do it once. After that, editing is a double-click.

**1. Make your own copy.** Sign in at github.com and open this project's page.
Near the top right, click **Fork**, then **Create fork**. That makes a copy under
your own account, which is what you edit and publish from. (Some copies of this
project also show a green **Use this template** button near the top, which does
the same thing without carrying the original's history. Either one is fine; Fork
is always there.)

**2. Turn on hosting.** In your copy, open **Settings**, then **Pages** in the
left sidebar. Under **Source**, choose **Deploy from a branch**, select the
`main` branch and the `/ (root)` folder, and save. Your site goes live at
`https://YOUR-USERNAME.github.io/GameLog/` in a minute or two. This is the only
setting you touch here.

**3. Copy it to your computer.** Install **GitHub Desktop** from
desktop.github.com and sign in. Choose **File**, then **Clone repository**, pick
your GameLog, and clone it. GitHub Desktop is also how you publish later, with a
button instead of commands.

**4. Install Node.js.** The editor runs on your own machine and needs this, once.
Get it from nodejs.org and choose the version labelled LTS. There is nothing to
configure.

**5. Edit.** Open your GameLog folder (in GitHub Desktop, use **Repository**,
then **Show in Finder** or **Show in Explorer**). Double-click **Open GameLog
Manager.command** on a Mac, or **Open GameLog Manager.bat** on Windows. The
editor opens in your browser. Search for games to add them, set your name and
photo on the **Profile** tab, and your title and colour on the **Site** tab.
Your copy starts with example games so the page is not empty while you find your
way around; delete the ones you do not want with the **Delete** button on each,
and add your own. (If you would rather clear them all in one go, double-click
**Start Fresh.command** or **Start Fresh.bat** first. It shows what it will
erase and asks you to confirm by typing a word, so nothing is wiped by accident.)

**6. Publish.** When it looks right, open GitHub Desktop. It lists what you
changed. Write a short note in the **Summary** box, click **Commit to main**,
then **Push origin**. Your live site updates within a minute. The manager's own
**Publish** button does the same thing once GitHub Desktop has signed you in.

After setup, the whole routine is: double-click the launcher, make your changes,
and push in GitHub Desktop.

### 1. Fork it

Click **Fork** at the top of this repo (or, if the repo offers a green **Use
this template** button, that too, which skips the commit history), then clone
your copy:

```bash
git clone https://github.com/YOUR-USERNAME/GameLog.git && cd GameLog
```

### 2. Turn on GitHub Pages

In your fork: **Settings → Pages → Build and deployment → Source: Deploy from a
branch**, branch `main`, folder `/ (root)`.

That's the only setting to change. There's no build step and no workflow. The
repo *is* the site, so GitHub just serves it. Every push publishes to
`https://YOUR-USERNAME.github.io/GameLog/`, usually within a minute.

### 3. Clear out the previous collection

A fork arrives with whoever's games you forked from. One command empties them,
along with their name, bio and footer:

```bash
npm run start-fresh
```

It asks you to confirm, and leaves `.env` and your git history alone.

### 4. Put your own games in

Four ways, all writing to the same file: mix and match freely.

**Use the manager.** `npm run manage` opens an editor in your browser, which is
the easiest way in. The rest of these work just as well.

Not comfortable in a terminal? **Double-click `Open GameLog Manager.command`**
(Mac) or **`Open GameLog Manager.bat`** (Windows) in this folder. It starts the
same editor and opens it in your browser — no commands to type. Keep the little
window that appears open while you edit, and close it when you're done. (You
still need [Node.js](https://nodejs.org) installed once; the launcher says so if
it's missing. On a Mac, the first time, right-click the file and choose **Open**
so it's allowed to run.)

**Type them in by hand.** Every field except `title` and `platform` is optional:

```json
{
  "games": [
    {
      "id": "nintendo-switch-hades",
      "title": "Hades",
      "platform": "Nintendo Switch",
      "year": 2020,
      "cover": "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co39vc.jpg",
      "description": "A rogue-like dungeon crawler in which you defy the god of the dead.",
      "genres": ["Action", "Roguelike"],
      "developer": "Supergiant Games",
      "condition": "CIB",
      "notes": "Signed by the composer."
    }
  ],
  "hardware": []
}
```

**Let a script look it up.** It finds the cover art, description and year for
you, with no signup required:

```bash
npm run add "Hades"
```

**Import an existing export.** If you already track your collection in
[Gameye](https://www.gameye.app), export to CSV and seed the whole thing at once:

```bash
npm run import:gameye -- ~/Downloads/your-export.csv
```

### 5. Consoles and peripherals

`hardware` is a second list alongside `games`, for the things you play on rather
than play:

```json
"hardware": [
  { "id": "n64", "name": "Nintendo 64 System", "platform": "Nintendo 64" },
  { "id": "n64-pad", "name": "Controller [Grey]", "kind": "controller",
    "platform": "Nintendo 64", "quantity": 4, "condition": "Loose" }
]
```

`kind` is `console`, `controller`, `memory` or `accessory`, and defaults to
`console` when left out. `quantity` defaults to 1, so four identical controllers
are one row with `"quantity": 4` rather than four rows, and show as ×4.

The shelf groups them under headings, and the counts on your page follow the
kind, so peripherals never get counted as consoles.

No database covers peripherals, so photos are yours to add. The manager's
hardware tab has the same drop-or-paste picker the games use.

### 6. Change the name and colour

`data/config.json` holds everything about the site's identity:

```json
{
  "title": "GameLog",
  "tagline": "A shelf of everything I've collected.",
  "accent": "#f0a04b",
  "defaultSort": "title",
  "showHardware": true,
  "footer": "Built with [GameLog](https://github.com/AnnabelleChimpton/GameLog)."
}
```

`accent` is any CSS colour and drives the highlights throughout. `footer`
accepts links and `**bold**`. The manager's **Site** and **Profile** tabs edit
all of this without touching the file.

### 7. Publish

Press **Publish…** in the manager. It shows exactly which files are about to go
out, lets you describe the change, then commits and pushes.

Or do it yourself, if you'd rather:

```bash
git add -A && git commit -m "Start my collection" && git push
```

---

## Day-to-day: you bought a game

```bash
npm run add "Chrono Trigger"
```

It searches, shows you the matches, asks which platform and what condition, and
writes the entry: cover art, description and year included. No signup needed;
it uses IGDB if you have it configured and the keyless sources otherwise.

Then push, either with **Publish…** in the manager or:

```bash
git add data/collection.json && git commit -m "Add Chrono Trigger" && git push
```

The site updates itself. That's the whole loop.

If you'd rather skip the questions:

```bash
npm run add "Chrono Trigger" -- --platform "SNES/Super Famicom" --condition CIB
```

---

## The manager

Editing JSON by hand is fine until it isn't. There's a UI:

```bash
npm run manage
```

Open the address it prints and you get a proper editor:

- **Lists**: make them, rename them, mark one as your wishlist, drag entries up
  and down. A wanted entry's title and platform are editable in place; an owned
  one is edited on the Games tab, so here you just add a note.
- **Games**: edit any field on any game, or add one by searching IGDB.
- **Hardware**: consoles, controllers, memory cards and accessories.
- **Updates**: write log posts, attach a game to one, delete them.
- **Profile**: your photo, bio and links.
- **Site**: title, tagline, accent colour (with a colour picker), and the
  shelves you follow.

Adding a game searches your own collection *and* a game database at once: IGDB
if you've set it up, Wikipedia and libretro if you haven't. Pick something you
own and it links to it; pick something you don't and it's saved as a wanted
entry, after asking which platform you want — and it pulls that platform's cover
art. On a list you can leave the platform as "any"; a catalogue entry needs one.
IGDB results that are ROM hacks or ports are labelled, so you don't accidentally
add *Chrono Trigger+* instead of *Chrono Trigger*.

Box art from the keyless source is chosen per platform, so a game added before
you picked one gets its cover the moment you choose the platform.

Changes are held in memory until you press **Save** (or ⌘/Ctrl+S), so a mis-click
is undone by reloading the page. Saving writes `data/*.json` and nothing else,
which keeps diffs small and readable.

**Publish…** then commits and pushes. It lists what's going out first, and only
ever stages the files the manager itself edits. Anything else you've changed is
shown as "left alone" for you to handle in git. If there's no `origin` remote
yet, or your credentials aren't set up, it says so rather than half-succeeding.

### It's local-only, on purpose

The manager needs a server that can write files, and that server only exists
while `npm run manage` is running on your machine. Your published site is static
files on someone else's host. There's nothing there to save to, which is
precisely why nobody visiting your site can edit it. Open `manage.html` on the
published copy and it just tells you to run it locally.

The write endpoints are deliberately hard to reach from anywhere but the manager
page itself: the server binds to `127.0.0.1` only, writes require a custom
header that a foreign page can't send without a CORS preflight the server
refuses, a mismatched `Origin` is rejected, the only writable paths are the
three `data/*.json` files and a profile photo under `assets/profile/` (never a
path taken from the request), every payload is shape-checked before it replaces
a real file, uploads must be a real image type and are size-capped, and writes
go via a temp file and a rename so an interrupted save can't leave a
half-written collection behind.

## About you

A collection is more interesting when you know whose it is. Add a photo, a few
paragraphs and some links, and they become the top of your page: your name as
the heading, the collection's own title and tagline beneath it, a line of facts
worked out from the data, your bio, and your links.

The bio is clipped to three lines with a **Read more** toggle, so the covers
still clear the fold. The header scrolls away as you browse; the search box and
filters are what stay pinned.

The manager's **Profile** tab is the easy way: "Choose a photo…" resizes the
image to 512px in your browser before saving it, so a 4 MB phone photo lands in
your repo as about 30 KB instead of sitting in git history forever at full size.

By hand, it's a `profile` block in `data/config.json`:

```json
"profile": {
  "name": "Annabelle",
  "photo": "assets/profile/avatar.jpg",
  "about": "I collect mostly fifth and sixth generation consoles.\n\nBlank lines make paragraphs. [Links](https://example.com) and **bold** work.",
  "links": [
    { "label": "GitHub", "url": "https://github.com/you" },
    { "url": "https://twitch.tv/you" }
  ]
}
```

`photo` takes a local path or any image url. Links to GitHub, Twitch, Bluesky,
Mastodon, YouTube and `mailto:` addresses get their own icon; everything else
gets a globe. Leave `label` out and the address is used instead.

The About page also works out a few things on its own: how many games across
how many platforms, the years they span, and which console you're deepest on -
so it stays accurate as the collection grows.

Setup instructions inside the site (the `npm run` hints on an empty shelf or an
empty Lists tab) only appear when you are viewing it from localhost. A visitor
to the published site has no terminal and no clone, so they see a plain message
instead, and an empty Lists tab is hidden from them altogether.

**Every part is optional.** Leave `profile` empty and the header falls back to
just your site title, tagline and collection facts. Which is the default for a
fresh fork.

### Sharing the link

Link previews are built by crawlers that don't run JavaScript, so those tags
can't be assembled at runtime like the rest of the page. They live in
`index.html`, between two `gamelog:meta` markers. Saving in the manager rewrites
that block from your config: the title becomes "Your Name. Your Title", the
description comes from your bio, and your photo becomes the card image.

For the image to work, set **Published address** on the manager's Site tab (or
`siteUrl` in the config) to your site's address. A crawler can't resolve a
relative path. Edit `config.json` rather than those meta lines; anything you
type between the markers is overwritten on the next save.

## Playing through it

If you're working through the collection, on stream or otherwise, four optional
fields turn the site into a progress tracker:

```json
"status": "beaten",
"beatenOn": "2026-08-20",
"video": "https://youtube.com/watch?v=...",
"verdict": "Ends on a boss you can walk past. 3/10."
```

`status` is `playing`, `beaten` or `dropped`, and leaving it out means not
started. Set it from the manager's Games tab, where the play-through fields sit
above the catalogue ones and the date fills itself in when you mark something
beaten.

Everything else follows from it:

- **A progress bar** appears above the shelf, counting whatever is currently
  filtered. Select a platform and it becomes that project's tracker: "2 of 31
  beaten" for a one-console run, or the whole collection with no filter.
- **Episode numbers** are worked out from the order things were finished, so a
  video titled `Some Game (12/185)` gets its number from the site rather than
  from you counting. The number shows on the tile and in the detail view.
- **The detail view** leads with the episode number, your verdict, and a link
  to the video, which is what someone arriving from a description wants.
- **Filter by status** to see only what's left, then press **Surprise me** to
  roll the next one at random.

`dropped` exists on purpose. Some games have no ending to reach, and recording
that with a reason is more honest than inventing a finish line.

## Lists

A list is any named set of games. A backlog, a wishlist, the ones you'd save
from a fire. Entries can be games you own *or* games you're still hunting.

```bash
npm run list
```

That walks you through it. The direct forms:

```bash
npm run list -- new "The hunt"
npm run list -- add the-hunt "Chrono Trigger" --platform "SNES/Super Famicom"
npm run list -- rm the-hunt "Chrono Trigger"
npm run list -- wants the-hunt
npm run list -- show
```

Add a game you already own and it stores a `ref` to your collection entry. Add
one you don't and it stores the title, looking up cover art so the tile still
looks like something.

**The part worth knowing:** entries are resolved against your collection on
every page load, not frozen when you add them. Put *Chrono Trigger* on your
hunting list, buy it a year later, run `npm run add "Chrono Trigger"`, and the
list entry turns from wanted into owned by itself. Nothing to edit, and the
"3 of 7 owned" meter moves on its own.

Wanted games render dimmed with a **want** badge; owned ones are full colour and
open their details on click.

### Your wishlist

One list can be marked as your **wishlist** — the games you're actively hunting.
It's just a flag (`"wants": true` on the list, or the star toggle on the
manager's Lists tab, or `npm run list -- wants <id>`), and only one list can
hold it. The wishlist leads the Lists tab, carries a **Wishlist** tag, and
counts by what's left — "*2 games still to find*" — rather than by what you own.
Everything else about it is an ordinary list, so a game flips from wanted to
owned the moment it lands in your collection.

### The file

`data/lists.json`, and it's plain enough to write by hand:

```json
{
  "lists": [
    {
      "id": "the-hunt",
      "name": "The hunt",
      "wants": true,
      "description": "Actively looking for these.",
      "items": [
        { "title": "Panzer Dragoon Saga", "platform": "Sega Saturn", "note": "disc only is fine" },
        { "ref": "nintendo-64-banjo-kazooie", "note": "want a boxed copy" }
      ]
    }
  ]
}
```

`wants` is optional and marks this as your one wishlist. Each entry is either a
`ref` (a game `id` from your collection) or a `title`
(plus an optional `platform` to pin which version you want). `note` is yours to
use however. Order is preserved, so a "play next" list stays in the order you
put it in. `npm run check` warns about a `ref` that doesn't match anything.

One caveat on the scripted form: `npm run list -- add …` run without a terminal
takes the first search result sight unseen. Run it interactively when the title
is ambiguous. There are a lot of *Chrono Trigger* ROM hacks.

## The log

A running feed of your collection, on its own **Log** tab: short notes you write
("finally found a boxed copy"), woven together with a milestone for every game
you mark beaten or dropped, newest first.

```bash
npm run post "Finally landed a boxed Halo 2"
```

That's the whole thing. Add `--ref <game-id>` to hang the post off a game you
own, and it borrows that game's cover as a thumbnail that opens the detail on
click:

```bash
npm run post -- "Beat it at last" --ref microsoft-xbox-halo-2
npm run post -- "Shelf reorg" --body "Everything back in generation order." --date 2026-08-19
npm run post -- show          # print the log
npm run post -- rm <id>       # remove a post
```

**The part worth knowing:** you rarely need to write a post at all. Every game
you mark beaten or dropped (on the manager's Games tab, or by hand) already
becomes a dated entry, with its verdict as the text and its episode number
attached. So the log fills itself in from the play-through fields you were
setting anyway; written posts are for the things the collection can't know.

The manager's **Updates** tab is the point-and-click way: write a post, attach a
game, delete one. Like everything else it saves to a `data/*.json` file —
`data/feed.json` — and nothing else.

### The file

`data/feed.json`, plain enough to write by hand:

```json
{
  "gamelog": 1,
  "posts": [
    { "id": "2026-08-19-boxed-halo", "date": "2026-08-19",
      "title": "Finally landed a boxed Halo 2",
      "body": "Flea-market find, **complete** with the manual.",
      "ref": "microsoft-xbox-halo-2" }
  ]
}
```

`title` and `date` (`YYYY-MM-DD`) are required; `body` and `ref` are optional.
`body` takes the same restrained markdown as your bio — blank lines make
paragraphs, `**bold**` and `[links](https://…)` work, and nothing else is
interpreted, so a log read from another shelf later is as safe as a collection
is. `id` doubles as a deep-link anchor and is filled in for you. `npm run check`
warns about a `ref` that matches no game.

The feed is optional: with no `data/feed.json` at all, the milestones still fill
the log, and a visitor sees the Log tab only once there's something in it.

### It's a real RSS feed

The log is also published as `feed.xml`, so anyone can follow your shelf in a
normal feed reader — paste `https://you.github.io/GameLog/feed.xml` (or just the
site address; the page advertises the feed) into whatever they use.

Readers don't run JavaScript, so `feed.xml` can't be built in the browser the
way the rest of the page is — it's a static file, generated the same way and for
the same reason as the link-preview tags. It's rewritten from `data/feed.json`
and your collection whenever you save in the manager, when you run
`npm run post`, and again at publish, so it never drifts. The milestones ride
along in it, so a subscriber sees "Beaten: *Halo 2*" without you writing a post.

For the item links to work, set **Published address** on the manager's Site tab
(or `siteUrl` in the config) — a reader can't resolve a relative link, the same
requirement the preview-card image has. Without it, no `feed.xml` is written.

### Following other shelves

The **Following** tab is the other side of the log: the latest from the GameLogs
*you* follow, all in one newest-first river — games they've beaten, notes
they've written — each labelled with whose shelf it's from and linking back to
it.

It's the same trick as Compare. The shelves you follow are the `friends` in
`data/config.json` (set on the manager's Site tab), and the river reads each
one's collection and log **straight from their site in your browser** — no
server, no account, nothing in between. Their milestones come through too, so
following someone shows "Sam beat *Halo 2*" without Sam writing a word.

Each shelf is someone else's site, so one being down or slow just drops that
shelf from the river and the rest still show. A visitor to your published site
sees the tab only once you follow at least one shelf.

**Finding more people.** Above the river, a **Shelves to explore** strip suggests
GameLogs you don't follow yet, from two sources: the shelves *your* follows
follow (read from their public `friends` lists, ranked by how many of your
follows point at each), and the shelves listed in any **directory** you
subscribe to. Each links straight out, and its tooltip says where the
suggestion came from. So the follow graph is walkable a step at a time — land on
a shelf, see who it follows, and who *its* circle follows.

### Directories

A directory is the on-ramp for someone who doesn't know anyone yet. It's a
**shared, published list of shelves** — a webring's member list — and, like
everything else here, it's just a static file anyone can host. Subscribe to one
(the manager's Site tab, or `directories` in `data/config.json`) and its shelves
show up in **Shelves to explore**, so you can find people without knowing a
single address first.

```json
"directories": [
  "https://someone.github.io/gamelog-ring/directory.json"
]
```

**Hosting your own** is nothing more than publishing this file somewhere with
open CORS (GitHub Pages does):

```json
{
  "gamelog_directory": 1,
  "name": "The GameLog Ring",
  "description": "Physical game collectors.",
  "shelves": [
    { "name": "Annabelle", "url": "https://annabellechimpton.github.io/GameLog/" },
    { "name": "Sam", "url": "https://sam.github.io/GameLog/" }
  ]
}
```

`gamelog_directory` is a schema version, `shelves` is a list of `{ name, url }`.
There's no central directory and no registration — anyone can start one, fork
one, or run several, and shelves can be listed in as many as they like. A shelf
you already follow is never suggested back to you, and any address that isn't a
plain `http(s)` one is dropped, because a directory is somebody else's file too.

## Cover art and descriptions

```bash
npm run enrich
```

No signup. It fills in what's missing, never overwrites your own edits, and is
safe to re-run. Box art comes from [libretro](https://thumbnails.libretro.com),
descriptions and years from [Wikipedia](https://en.wikipedia.org).

It's very good on anything emulated: 95% of games on the platforms it covers -
and **has nothing for current-gen**, because nobody scans PlayStation 5 or
Switch boxes for an emulation project.

For those, open `npm run manage`, find the game, and use the cover box:

- **drop** an image file onto it, or **click** it and pick one
- **paste a link** into the field underneath and press **Download**

(Copying an image to the clipboard and pressing ctrl-V also works once the drop
zone has focus, but it is a shortcut rather than the way in.)

Whatever you give it is resized to 600px, written to `assets/covers/<game-id>`,
and the path is filled in for you.

The **Cover image path or url** field underneath is the raw value, and it does
something different on purpose: whatever you type there is stored as-is, so a
url stays a link rather than being downloaded. That is the one way to keep a
hotlink on purpose. A line under the box always says which you have, with a
**Save a local copy** button when it is a link. No API, no account, and you get
the exact cover you want. Because the file is downloaded rather than linked, it
also cannot vanish later when somebody else tidies up their server.

<details>
<summary>Using IGDB instead, if you want current-gen filled in automatically</summary>

One database for everything, plus genres and companies. The catch is the
sign-up: IGDB is owned by Twitch, so it needs a Twitch account **with a phone
number for 2FA**, and there's no email-only path.

1. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register
   Your Application**. OAuth Redirect URL `http://localhost`, category
   Application Integration, client type Confidential.
2. Copy the Client ID, click **New Secret**, copy that.
3. `cp .env.example .env` and paste both in.

`.env` is gitignored and the published site never needs it: image urls are
baked into `collection.json`. With keys present, `enrich` and `add` use IGDB
automatically; `--source free` forces the keyless path either way.

</details>

A game with no art keeps a generated placeholder in its platform's colour, and
those tiles show their title permanently, so the shelf still reads properly.

### Keeping the art

```bash
npm run vendor
```

Art is found by handing you a link to somebody else's server, and a link works
right up until the day that server reorganises a directory. So every route that
finds art also stores it: `npm run add`, `npm run enrich`, `npm run boxart`, and
adding a game in the manager all download the picture into `assets/covers` or
`assets/boxart` and point `collection.json` at the copy. You do not have to do
anything for this, and it is why a published GameLog owns its own pictures.

`npm run vendor` is the catch-up pass for a collection that predates that, or
for anything a run could not fetch at the time. It is safe to re-run, and it is
not destructive: anything it cannot download keeps the link it had, so the worst
case is a game that stays linked rather than one that loses its art. `--dry-run`
shows what it would fetch.

The manager has the same as a button under **Site → Artwork backup**, the
publish dialog warns when anything is still hotlinked, and `npm run check`
reports the count. Expect roughly 300 KB per game with a cover and a box scan.

### True box shapes

Filter the shelf to a single console and the tiles stop being uniform
rectangles: each one takes the proportions of the real box. A Nintendo 64
cartridge box is wider than it is tall, a 3DO longbox is narrow and
tall, and lined up along one shelf they look like the shelf they came from.

This needs a second picture, because the covers most databases serve are
normalised to one size. `npm run add` and the manager fetch it while you add a
game, so there is usually nothing to do. To backfill games added before this
existed:

```bash
npm run boxart
```

It reads a few bytes of each scan to learn its proportions rather than
downloading the image, and takes `--platform "Nintendo 64"` to do one console
at a time, or `--force` to redo ones already filled in. Anything it can't find
falls back to the console's usual shape, so a shelf never ends up ragged.

Current-gen consoles have no scan source at all — libretro doesn't scan
PlayStation 5 or Switch boxes — but their cases are all one standard size, so
each platform in `assets/js/platforms.mjs` carries a `box` proportion (a Switch
cartridge case is narrower than a PlayStation Blu-ray case, which is a touch
wider than a GameCube DVD case). A single-platform shelf uses that known shape
when there's nothing to measure, so a Switch shelf stands like a shelf of Switch
cases rather than dropping to a plain grid. A real scan, when there is one,
always wins over the known value.

## Preview before you push

```bash
npm run serve
```

Then open <http://localhost:4321>. You need this rather than double-clicking
`index.html`, because browsers block the page's JSON fetch on `file://` urls.

`npm run serve` is read-only. Use `npm run manage` when you want to edit.

To catch mistakes before they go live:

```bash
npm run check
```

It flags invalid JSON, duplicate ids, missing platforms and unknown consoles,
and tells you how much is still waiting on `npm run enrich`. The manager runs
the same shape checks before it writes anything, so data saved through the UI is
already valid. This is for catching hand-edits.

---

## Adding a console the registry doesn't know

The registry in `assets/js/platforms.mjs` ships comprehensive — every mainstream
home console and handheld from the Atari 2600 through the Switch, plus the
Sega/NEC/SNK/Bandai lines — so most shelves need nothing here. An unrecognised
platform still works too; it just gets an auto-generated abbreviation and
colour.

To add a console the registry doesn't know, or amend one, **you don't touch
code** — put it in `data/platforms.json`, which is merged over the built-ins by
`key` at load:

```json
{
  "platforms": [
    { "key": "Bandai WonderSwan", "short": "WS", "color": "#3a5a7a",
      "igdb": 57, "box": 0.90, "libretro": "Bandai - WonderSwan" }
  ]
}
```

- `key`: exactly as you spell it in `collection.json`
- `short`: the badge label; keep it to about four characters
- `color`: the chip dot, badge, and placeholder-cover colour
- `igdb`: IGDB's platform id, which narrows cover-art searches. Look it up in
  the [IGDB platform list](https://api-docs.igdb.com/#platform), or omit it.
- `box`: the case proportion (width ÷ height), for drawing a single-platform
  shelf at true shape when there's no scan to measure. A disc case is about
  `0.71`, an N64 cartridge box `1.37`, a 3DO longbox `0.52`.
- `libretro`: the system directory in libretro's thumbnail repo (No-Intro
  naming), which is the keyless box-art source. Omit it for anything libretro
  doesn't scan.

Only `key` is required; anything you leave out keeps the built-in value (when
you're amending an existing console) or a sensible default (when adding a new
one). The file is optional — no `data/platforms.json` just means the built-ins,
untouched.

---

## What's in here

```
index.html               the page
Open GameLog Manager.*    double-click to open the editor (Mac / Windows)
Start Fresh.*             double-click to empty a fresh copy (Mac / Windows)
assets/css/styles.css    all the styling; colours are CSS variables at the top
assets/js/app.js         state, routing, the shelf, the detail dialog
assets/js/lib.js         helpers shared by every view
assets/js/stats.js       the stats view and its charts
assets/js/timeline.js    the by-year view
assets/js/lists.js       lists, and resolving entries against the collection
assets/js/feed.js        the log: posts woven with play-through milestones
scripts/lib/rss.mjs      generates feed.xml from the log
assets/js/profile.js     the About view
assets/js/manage.js      the local manager UI
manage.html              the manager page (local use only)
assets/js/compare.js     fetching another collection: Compare, and the Following river
assets/js/platforms.mjs  the built-in platform registry: names, colours, shapes, art sources
scripts/lib/libretro.mjs keyless box art
scripts/lib/wikipedia.mjs keyless descriptions and years
data/collection.json     your games and hardware
data/lists.json          your lists (optional)
data/feed.json           your log posts (optional)
data/config.json         site title, tagline, accent colour, friends
data/platforms.json      your console overrides/additions (optional)
scripts/                 the optional Node helpers (start-fresh, add, enrich, …)
tests/                   `npm test`, no dependencies
```

`data/collection.json` is the only file you need to touch day to day.

### Fields

Only `title` and `platform` are required; anything you leave out is simply not
shown.

| Field | Notes |
| --- | --- |
| `id` | Unique, url-safe. Doubles as a deep link: `…/#nintendo-64-goldeneye-007` |
| `title`, `platform` | Required |
| `year` | Release year |
| `cover` | Any image url, or a path like `assets/covers/foo.jpg` |
| `description` | A short blurb |
| `genres` | A list: `["Action", "RPG"]` |
| `developer`, `publisher` | Free text |
| `region` | e.g. `USA`, `JP`, `PAL` |
| `release` | Non-standard editions: `Demo`, `Not For Resale` |
| `condition` | Free text: `CIB`, `Loose`, `Boxed`, `New`, whatever you use |
| `copies` | Shows an `×2` badge when above 1 |
| `metacritic` | 0-100 |
| `notes` | Anything personal; shown in the detail view |
| `added` | `YYYY-MM-DD`, used by the "Recently added" sort |
| `igdbId` / `wikidataId` | Set by `enrich`. Stable ids that let one collection be matched against another exactly, rather than by title |

`hardware` entries use `name` instead of `title` and `image` instead of `cover`,
and appear in their own section at the bottom of the page.

The file also carries `"gamelog": 1`. A schema version, so that anything
reading a collection over the network (the Compare view, or an index across many
sites later) can tell which format it's looking at rather than guessing.

---

## Notes

Everything in `collection.json` is public once you push it. It's a static site,
so anyone can read the raw file. Don't put anything in `notes` you wouldn't want
seen. There are no price or valuation fields for the same reason.

Cover images are hotlinked to IGDB's CDN rather than committed, which keeps the
repo small. If you'd rather host them yourself, download them into
`assets/covers/` and point the `cover` fields at the local paths. The site
treats any url the same way.

Keyboard: `/` focuses search, `r` picks a game at random from whatever is
showing, `Esc` clears the search or closes the dialog, and `←` / `→` step
through games while a detail view is open.

Controls hide themselves when they'd be lying. "Recently added" only appears if
your `added` dates actually differ. A bulk import stamps every row with the
same day, and sorting by it would just reproduce the alphabetical order. Same
for "Highest rated" without scores, and the condition filter with only one
condition in use.

Condition is grouped for filtering (New / CIB / Boxed / Loose / Other) but
displayed exactly as you wrote it, so `CIB+` and `B+` still say `CIB+` and `B+`
on the game itself.

---

## Licence

MIT, for the code.

Cover art and descriptions come from [IGDB](https://www.igdb.com),
[libretro](https://thumbnails.libretro.com) and [Wikipedia](https://en.wikipedia.org)
depending on which source you use. The artwork itself belongs to its respective
publishers: none of it is mine to license.
