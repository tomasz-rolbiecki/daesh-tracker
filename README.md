# Daesh Claims Tracker

A manually curated tracker of Daesh / Islamic State attack claims, served as a static dashboard on GitHub Pages. The Excel file is the source of truth; a GitHub Action converts it to JSON and redeploys the site on every push.

## Live site

After deploying (see below), your site will be at:
`https://<your-github-username>.github.io/<repo-name>/`

## Repo layout

```
.
├── index.html              Dashboard
├── add.html                Add-claim form (generates pastable row)
├── assets/
│   ├── style.css
│   ├── app.js              Dashboard logic, charts, filters, table
│   └── add.js              Form logic
├── data/
│   ├── Daesh_Claims_Tracker.xlsx   ← Source of truth. Edit this.
│   ├── claims.json                 ← Auto-generated. Don't edit by hand.
│   └── reference.json              ← Auto-generated (dropdown lists).
├── scripts/
│   └── xlsx_to_json.py     Converter, run by the Action (or manually)
├── .github/workflows/
│   └── deploy.yml          Build + deploy on every push to main
└── README.md
```

## First-time deployment

1. **Create a public GitHub repo** and push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Initial tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Repo → Settings → Pages
   - Under "Build and deployment", set **Source** to **GitHub Actions**

3. The Action runs automatically. First build takes ~1 minute. Watch progress under the **Actions** tab.

4. Your site will be at `https://<you>.github.io/<repo>/`.

## Day-to-day workflow

**To add a claim (two options):**

**Option A — Excel directly.** Open `data/Daesh_Claims_Tracker.xlsx`, go to the first empty row of the **Claims Log** sheet, fill in the columns starting at column B (column A and D auto-fill). Save.

**Option B — Use the form.**
- Go to your live site, click "+ Add claim"
- Fill the fields, click "Generate row"
- Copy the row (tab-separated text)
- Open `data/Daesh_Claims_Tracker.xlsx`, click cell B in the first empty row of **Claims Log**, paste
- Save

**Then push:**
```bash
git add data/Daesh_Claims_Tracker.xlsx
git commit -m "Add claim: <brief description>"
git push
```

The Action runs, regenerates `claims.json`, and redeploys the site. About 1 minute end to end.

## Editing the dropdowns

Open `data/Daesh_Claims_Tracker.xlsx` → **Reference** sheet. Add or remove entries in any of the five columns (Actors, Event Types, Target Types, Weapon Types, Countries). Both the Excel data-validation dropdowns and the web form's dropdowns will pick up the changes on the next push.

## Local preview

To preview before pushing:

```bash
# Regenerate JSON locally (optional — the Action also does this)
pip install openpyxl
python scripts/xlsx_to_json.py

# Serve over HTTP (fetch() doesn't work from file://)
python3 -m http.server 8000
# Then visit http://localhost:8000
```

## Data conventions

- **Retroactive flag** is automatic: any row where the Event Date's month differs from the Claim Date's month is tagged `Y`. Highlighted in yellow with red text in Excel; tagged `RETRO` in the dashboard table.
- **Actor naming** follows the convention: province-branded actors use their abbreviation (`ISWAP`, `ISCAP`, `ISGS`, `ISKP`, `ISPP`, `IS-Moz`); generic Daesh claims are tagged with country suffix (`Daesh-Syria`, `Daesh-Iraq`, etc.).
- **Multi-value attributes** (event types, target types, weapon types) have multiple slots per row (5 / 3 / 5). Order doesn't matter; the summary counts use every slot.

## Data privacy

This is a public repository. Everything in it, including the Excel file and the data, is world-readable and indexed by search engines. Don't put anything in here that isn't OK to be public.

## Known source-data issues

The migration found 3 entries in your historical data with likely date typos. Open the Excel, sort by Claim Date, and check the rows at the top (Jan/Feb 2025) — if they should actually be 2026, fix and push.
