# Shahad Al-Saleem — Security Writeups

A dark, GitBook-style Hugo site for your **CTF / HackTheBox / TryHackMe** writeups,
certifications, and blog. Custom theme baked in (no submodules), client-side search,
filterable writeups, and one-click deploy to GitHub Pages.

```
content/            ← all your pages (markdown)
  _index.md         ← home / whoami text
  writeups/
    htb/  thm/  ctf/ ← one .md per box/challenge
  achievements/     ← certs, placements, badges
  blog/             ← longer-form posts
layouts/            ← the theme (HTML templates)
assets/             ← css + js
static/img/htb/     ← box avatars go here
hugo.toml           ← site config + your profile links
.github/workflows/  ← auto-deploy to GitHub Pages
```

---

## 1. Run it locally

Install Hugo **extended** (v0.123+): https://gohugo.io/installation/

```bash
hugo server
# open http://localhost:1313
```

The server live-reloads as you edit.

## 2. Make it yours

Open **`hugo.toml`** and edit the `[params]` block — your name, tagline, and the
profile links (GitHub / HTB / THM / LinkedIn / email). Delete any links you don't use.

Edit **`content/_index.md`** for the "whoami" intro on the home page, and
**`content/achievements/_index.md`** for your certs and placements.

## 3. Add a writeup

Create a markdown file under the right platform folder, e.g.
`content/writeups/htb/devel.md`:

```markdown
---
title: "Devel — Writeup"
linkTitle: "Devel"
weight: 3                 # controls order in the sidebar
featured: true            # show on the home page (optional)
platform: "HTB"           # HTB | THM | CTF  → drives the filter + badge
name: "Devel"             # presence of `name` renders the box CARD
os: "Windows"
difficulty: "Easy"        # Easy | Medium | Hard | Insane → ring color
points: 20
release: "15 Mar 2017"
ip: "10.10.10.5"
avatar: "/img/htb/devel.png"   # optional; drop the image in static/img/htb/
tags: ["windows", "iis", "ftp"]
---

{{< htb name="Devel" os="Windows" difficulty="Easy" points="20" release="15 Mar 2017" ip="10.10.10.5" >}}

## Reconnaissance
... your content ...
```

Notes:
- The **box card** (avatar + OS/Difficulty/Points/Release/IP panel) comes from the
  `{{< htb ... >}}` shortcode. Use it at the top of the writeup body.
- For **CTF challenges** that aren't a "box", just omit the `name`, `os`, `ip`…
  fields — the page renders as a normal card and links straight to the writeup.
- The **right-hand "On this page"** menu is generated automatically from your
  `##` / `###` headings.
- Drop box avatars in `static/img/htb/` and reference them as `/img/htb/<file>.png`.

### Callouts

```markdown
{{< note tip >}}Run `whoami /priv` first on Windows.{{< /note >}}
{{< note warning >}}This will lock the account after 3 tries.{{< /note >}}
```

## 4. Deploy to GitHub Pages (free)

1. Create a repo on GitHub and push this folder:
   ```bash
   git init && git add . && git commit -m "init writeups site"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. That's it. Every push to `main` rebuilds and deploys automatically via
   `.github/workflows/deploy.yml`. The workflow sets the correct `baseURL` for you,
   so you don't need to hard-code your username/repo.

Your site will be at `https://<you>.github.io/<repo>/`
(or `https://<you>.github.io/` if you name the repo `<you>.github.io`).

> Local dev uses `baseURL = "/"` from `hugo.toml`; the deploy workflow overrides it.

## Customizing the look

- **Colors / fonts:** all design tokens are at the top of `assets/css/main.css`
  (`--bg`, `--accent`, difficulty colors, etc.).
- **Accent color:** change `--accent` (default matrix green `#4ade80`).
- **Nav order:** set `weight:` in each page's front matter.
