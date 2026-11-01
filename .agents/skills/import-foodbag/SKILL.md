---
name: import-foodbag
description: "Import a recipe from foodbag.be into this site from its URL (https://www.foodbag.be/fr/recept?dishId=...&weekDocId=...). Creates recipes/<slug>/recipe.md, a WebP photo cropped so the plate is centered on the home page, and the recipes.json entry. The skill improves itself with what each import teaches. WHEN: import foodbag, import-foodbag, foodbag recipe, foodbag.be URL, recept?dishId=."
---

# Import a Foodbag recipe

Foodbag recipe pages are built in the browser, so `web_fetch` only sees "En cours de chargement...". The script in this folder reads what the page reads:

- **Dish** (name, subtitle, tip, photo): embedded in the page for current weeks, otherwise the Firestore `dish` collection.
- **Ingredients and steps** for each number of servings: the Firestore `dish_variants_v4` collection.
- The public Firebase web config is read from Foodbag's own scripts at run time; never copy it into the repository.

Read **Findings** below before importing: it is what earlier imports learned.

## Steps

1. Dependencies must be installed (`pnpm install`): the script uses `sharp` and `prettier` from the repository.
2. Preview without writing anything (quote the URL: it contains `&`):

   ```powershell
   node .agents/skills/import-foodbag/import-foodbag.js "<url>" --dry-run
   ```

   Read the title, ingredients and steps. Then choose:
   - **tags** from those already used in `recipes.json` (`Viande`, `Poisson`, `Pates`, `Asiatique`, `Accompagnement`, `Entrée`, `Apéro`, `Salade`, `Dessert`, ...). The guess only covers Viande, Poisson, Pates (from the name and the delivered ingredients) and Asiatique (from the name).
   - a short **slug**: the main words without filler, e.g. `escalope-porc-puree-epinards`.

3. Import:

   ```powershell
   node .agents/skills/import-foodbag/import-foodbag.js "<url>" --slug <slug> --tags Viande
   ```

   Note every line under `À vérifier`: data the script was not written for.

4. **Check the photo.** The home page shows each photo as a centered square. Open the square preview whose path the script prints (`carré : ...png`) with the `view` tool. The whole plate must be visible and centered.
   - The script looks for the largest round outline (plate or bowl of any color, side bowls are smaller) and crops a square around it, with a 6% margin, so the thumbnail is a deliberate crop instead of the middle of a portrait photo.
   - When no plate is found, the photo is kept whole: check that the square still looks centered. If not, crop the source photo by hand with `sharp` around the food, then save it again as `recipes/<slug>/<slug>.webp` (max 1920 px, WebP quality 82).
   - `--force --no-crop` re-imports with the photo kept whole.

5. Read `recipes/<slug>/recipe.md` once and fix anything odd (wording, units, order).
6. Validate: `pnpm run build`. It must succeed and print the new page in `dist/recipes/<slug>/`. It also refreshes `public/recipes.json`, which is tracked: keep that change. If `pnpm dev` is already running, also run `pnpm run build:recipes:dev`: the dev server only generates recipe pages when it starts, so the new page would show the home page instead.
7. **Update this skill** with what this import taught (next section). Required whenever there was a finding.
8. Summarize what was imported, and what changed in the skill if anything. Do not commit or push unless the user asks.

## Keep this skill up to date

A **finding** is anything this skill did not handle on its own:

- a line under `À vérifier` that is not already explained in **Findings**;
- an error, or a Foodbag change (page, scripts, Firestore fields or collections);
- a manual fix to `recipe.md`, the photo or the `recipes.json` entry;
- a step of this file that was wrong, missing or unclear.

For each finding, before finishing the task:

1. **Fix the cause** in `import-foodbag.js` when it can apply to future recipes (a new unit, a field that moved, a better crop rule...). Fix the pattern, never one dish: no dish ids, names or recipe-specific text in the script. If it cannot be automated, write the manual workaround in **Findings**.
2. **Add a reference** in `references.json` (or extend one): the Foodbag URL, `why` it matters, the exact Markdown lines (`expect`) that prove the fix, and whether the plate is detected (`plate`). Use the recipe just imported.
3. **Check for regressions**: `node .agents/skills/import-foodbag/import-foodbag.js --check` must end with all references `OK`. It reads every reference again and writes nothing. If an old reference fails because Foodbag changed its data (not because of your change), update that reference and say so.
4. **Update this file**: add one dated line to **Findings**; update Steps, Options or "What the script writes" if the behavior changed; delete workarounds the script now handles. Keep it short.
5. Format: `pnpm exec prettier --write .agents/skills/import-foodbag`. Prettier skips Markdown, so make sure `SKILL.md` keeps LF line endings (the repository uses `eol=lf`).
6. Repeat the import with `--force` if the fix changes its result.

Never store API keys, tokens or other secrets in the skill.

## Findings

- 2026-10-31: Only current-week pages embed the dish. Older weeks (e.g. `W5Y2026`) are read from the Firestore `dish` collection, which holds one document per week the dish was offered. `WeekNumber` values there are messy (`"49$"`, `"02"`, numbers): the script prefers the week of the link, then clean values, then the latest week.
- 2026-10-31: Firestore collection names come from an enum in Foodbag's scripts (`DishVariantsV4="dish_variants_v4"`, `Dish="dish"`). Another enum also has a `.Dish=` member, so only the block containing `DishVariantsV4` is read. Defaults are used, with a warning, when the enum is not found.
- 2026-10-31: Week and year are stored either as numbers or as strings: queries match both.
- 2026-10-31: Detecting light pixels missed every non-white plate (blue, black, dark grey), caught only part of a rim (bad zoom), took a small side bowl for the plate, and once a light stone background (bowl cropped off). The script now finds the plate rim with a circle (Hough) search on edges: it found the right plate on 20 photos.
- 2026-10-31: Foodbag names are plural even for one piece (`1 pièce carottes`). Below 2, the words before the first preposition are made singular (`1 carotte`, `1/2 oignon rouge`); words ending in as/is/os/us stay (`radis`, `frais`). Quantities can be strings like `"1/2"`.
- 2026-10-31: Steps can say `(voir photo)` or `(voir astuce et photo)` about Foodbag step photos the site does not show: the photo part is removed, and any other mention of a photo is listed under `À vérifier`.
- 2026-10-31: Names can also be singular from 2 (`2 filet de poulet`, `4 pain panini`): the words before the first preposition are made plural (`chou` → `choux`, `-eau` → `-eaux`). Brands and words in parentheses are kept.
- 2026-10-31: The unit can be repeated in the name (`tranches` + `tranches de lard`, `botte` + `botte de carottes`): it is written once. The unit `facultatif` gives `miel/sirop végétal (facultatif)`.
- 2026-10-31: Meat can appear only in the ingredients (`lard`, `pancetta`, `jambon`), so meat, fish and pasta tags are also guessed from the delivered ingredients, ignoring stock cubes and sauces. A subtitle starting with `et` is joined without a comma (`gratiné et cresson de jardin`).
- 2026-10-31: A link was queued again after its import: the script now refuses a dish id already present in `recipes/*/recipe.md` under another slug (`--force` imports it anyway).
- 2026-10-31: Foodbag can put the size after the name (`brocoli grand`): the script writes `1 grand brocoli`.
- 2026-10-31: `pnpm run build` rewrites the tracked `public/recipes.json`; keep the change.
- 2026-10-31: A running `pnpm dev` served the home page at `/recipes/<slug>/`: it writes `public/recipes/<slug>/index.html` (ignored by git) only at start. `pnpm run build:recipes:dev` adds the new page without a restart.
- 2026-10-31: Files created on Windows can get CRLF line endings; `.md` files are not fixed by Prettier, so convert them to LF.
- 2026-10-31: Keep the front matter `description` in double quotes: it contains `: `, which is invalid in plain YAML and hides the skill from agents.
- 2026-11-01: A name that joins words with `&`, `et` or the Italian `e` (`cacio e pepe`, `estragon & cerfeuil`) is a fixed name: making it plural added an s to every word (`cacios es pepes`). Those names are now left untouched when made plural. `tortelloni`/`tortellonis` count as pasta, like `tortellini`.
- 2026-11-01: Fish names were matched inside other words: `broccolinis` contains `colin`, so the dish got the Poisson tag. Short fish names now need word boundaries (`\bcolin\b`).
- 2026-11-01: The unit `au goût` is not a measure: `1 au goût de flocons de chili` now reads `flocons de chili (au goût)`, like `facultatif`.
- 2026-11-01: Foodbag names some products after inventing them in the dish story, in quotes (`le nom mystérieux d'« enigma »`): the ingredient was written `16 raviolis frais enigmas`. Words quoted in `NameFR`, `SubtitleFR`, `TipFR`, `TableStoryFR` or `IngredientsInfoFR` are now left untouched by `singular()`/`plural()`.
- 2026-11-01: Centring the plate on a portrait photo kept most of the background: the thumbnail (a centred square) showed the dish small, with empty marble around it. The script now crops a square around the plate with a 6% margin (`carré 1799x1799` on a 2480x3508 photo), so the dish fills the thumbnail. The crop stays inside the frame and keeps the plate whole.

## Options

| Option | Default |
| --- | --- |
| `--persons <n>` | `2`, like the other Foodbag recipes (closest available otherwise) |
| `--slug <slug>` | built from the Foodbag name |
| `--title <text>` | Foodbag name in title case |
| `--description <text>` | `<name>, <subtitle> (Foodbag)` |
| `--tags <a,b>` | guessed |
| `--date <YYYY/MM/DD>` | today |
| `--no-crop` | crop around the plate |
| `--force` | refuse to overwrite an existing recipe or import a dish twice |
| `--dry-run` | write the files |
| `--check` | re-test `references.json` instead of importing |

## What the script writes

- `recipes/<slug>/recipe.md`: front matter (title, authors, keywords), the photo, a one-line intro with the total time, `## Ingrédients (2 personnes)` (this heading turns the list into a checklist on the site), `## Préparation` (numbered steps), `## Astuce` (Foodbag tip), `## Lien` (the Foodbag URL).
- `recipes/<slug>/<slug>.webp`: the original Foodbag photo, cropped, at most 1920 px.
- `recipes.json`: the entry, inserted by date (newest first) and formatted with Prettier.
- In the console: a summary (`source` is `page Foodbag` or `Firestore`), the path of the square preview, and `À vérifier` when the data looks unusual.
