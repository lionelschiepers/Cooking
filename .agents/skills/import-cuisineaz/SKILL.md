---
name: import-cuisineaz
description: "Import a recipe from cuisineaz.com into this site from its URL (https://www.cuisineaz.com/recettes/...-<id>.aspx). Creates recipes/<slug>/recipe.md, a WebP photo cropped so the dish is centered on the home page, and the recipes.json entry. The skill improves itself with what each import teaches. WHEN: import cuisineaz, import-cuisineaz, cuisineaz recipe, cuisineaz.com URL, recettes/*.aspx."
---

# Import a CuisineAZ recipe

CuisineAZ recipe pages embed a schema.org `Recipe` object as JSON-LD, so no
browser is needed. The script reads the name, photo, total time, servings,
ingredients, steps and FAQ from that object, then writes them in the same shape
as the Foodbag and HelloFresh imports.

Read **Findings** below before importing: it is what earlier imports learned.

## Steps

1. Dependencies must be installed (`pnpm install`): the script uses `sharp` and
   `prettier` from the repository.
2. Preview without writing anything (quote the URL: it contains `&` when it has
   query parameters):

   ```powershell
   node .agents/skills/import-cuisineaz/import-cuisineaz.js "<url>" --dry-run
   ```

   Read the title, ingredients and steps. Then choose:
   - **tags** from those already used in `recipes.json` (`Viande`, `Poisson`,
     `Pates`, `Asiatique`, `Accompagnement`, `Entrée`, `Apéro`, `Salade`,
     `Dessert`, `Pizza`, ...). The guess covers Viande, Poisson, Pates,
     Asiatique and the CuisineAZ categories (Dessert, Entrée, Apéro, Salade,
     Accompagnement).
   - a short **slug**: the main words without filler, e.g.
     `flan-caramel-maison`.
   - a **description** when the default `<name> (CuisineAZ)` is too dry.
3. Import:

   ```powershell
   node .agents/skills/import-cuisineaz/import-cuisineaz.js "<url>" --slug <slug> --tags Dessert
   ```

   Note every line under `À vérifier`: data the script was not written for.
4. **Check the photo.** The home page shows each photo as a centered square.
   Open the square preview whose path the script prints (`carré : ...png`). The
   dish must be centered, with even margins on both sides.
   - The script crops a square of the shorter side, centered on the largest
     connected area of saturated, bright pixels (the food), not on the image.
   - A close-up can put the food off-centre: pass `--crop-left <px>` to move
     the left edge of the square, or `--no-crop` to keep the whole photo.
   - The source is downloaded at its original size by asking the CDN for a
     `4000x4000` box; the fixed `1200x...` sizes are crops.
5. Read `recipes/<slug>/recipe.md` once and fix anything odd (wording, units,
   order, a missing quantity).
6. Validate: `pnpm run build`. It must succeed and print the new page in
   `dist/recipes/<slug>/`. It also refreshes `public/recipes.json`, which is
   tracked: keep that change. If `pnpm dev` is already running, also run
   `pnpm run build:recipes:dev`: the dev server only generates recipe pages when
   it starts, so the new page would show the home page instead.
7. **Update this skill** with what this import taught (next section). Required
   whenever there was a finding.
8. Summarize what was imported, and what changed in the skill if anything. Do
   not commit or push unless the user asks.

## Keep this skill up to date

A **finding** is anything this skill did not handle on its own:

- a line under `À vérifier` that is not already explained in **Findings**;
- an error, or a CuisineAZ change (JSON-LD fields, page structure, units);
- a manual fix to `recipe.md`, the photo or the `recipes.json` entry;
- a step of this file that was wrong, missing or unclear.

For each finding, before finishing the task:

1. **Fix the cause** in `import-cuisineaz.js` when it can apply to future
   recipes (a new unit, a field that moved, a better crop rule...). Fix the
   pattern, never one dish: no dish ids, names or recipe-specific text in the
   script. If it cannot be automated, write the manual workaround in
   **Findings**.
2. **Add a reference** in `references.json` (or extend one): the CuisineAZ URL,
   `why` it matters, the exact Markdown lines (`expect`) that prove the fix, the
   text that must not appear (`absent`), the guessed `tags`, the generated
   `slug`, the number of FAQ tips (`tips`), and whether the photo is `square`
   and the crop is `cropShifted`. Use the recipe just imported.
3. **Check for regressions**: `node .agents/skills/import-cuisineaz/import-cuisineaz.js --check`
   must end with all references `OK`. It reads every reference again and writes
   nothing. If an old reference fails because CuisineAZ changed its data (not
   because of your change), update that reference and say so.
4. **Update this file**: add one dated line to **Findings**; update Steps,
   Options or "What the script writes" if the behavior changed; delete
   workarounds the script now handles. Keep it short.
5. Format: `pnpm exec prettier --write .agents/skills/import-cuisineaz`.
   Prettier skips Markdown, so make sure `SKILL.md` keeps LF line endings (the
   repository uses `eol=lf`).
6. Repeat the import with `--force` if the fix changes its result.

Never store API keys, tokens or other secrets in the skill.

## Findings

- 2026-11-08: CuisineAZ exposes the recipe as a schema.org `Recipe` inside a
  JSON-LD `@graph`, next to an `ItemList` and a `FAQPage`. The script reads the
  `Recipe` and uses the `FAQPage` for the `## Astuce` section.
- 2026-11-08: Ingredients are `<quantity> <unit> <Name>` with the name
  capitalised and counted names suffixed `(s)` (`6 Œuf(s)`, `250 g Sucre`,
  `1 Gousse Vanille`). The script strips `(s)`, lowercases the name,
  singularises/pluralises counted names and adds `de`/`d'` (`6 œufs`,
  `250 g de sucre`, `1 gousse de vanille`, `5 cl d'eau`).
- 2026-11-08: An ingredient can have no quantity (`Rhum`) while a step gives one
  (`1 c. à soupe de rhum`). The script reuses the step's measure and flags the
  ingredient under `À vérifier` when no measure is found.
- 2026-11-08: Photo URLs carry a `WxH` crop. Asking for a box larger than the
  source (`4000x4000`) returns the original full frame (the flan: 2000x1329);
  the fixed `1200x1200`, `1200x900` and `1200x675` sizes are crops. The script
  asks for `4000x4000` and falls back to the JSON-LD URL.
- 2026-11-08: The Foodbag Hough plate detector found no plate on the flan
  close-up (score < 0.25), so this skill centres on the largest connected area
  of saturated, bright pixels (the food), ignoring a 5% side band. The first
  image-centred crop (`left 335`) cut the right of the dish; the food centre
  gives `left 496`.
- 2026-11-08: Steps have typography issues (`180°C(th.6)`, `puis, posez-y`,
  `A la fin`, `1 c. à soupe`); `tidyStep` fixes the spacing, expands spoons and
  the `A`/`À` typo.
- 2026-11-08: The default description is `<name> (CuisineAZ)`; pass
  `--description` for a richer one. The flan import uses one.
- 2026-11-08: `pnpm run build` rewrites the tracked `public/recipes.json`; keep
  the change.
- 2026-11-08: Files created on Windows can get CRLF line endings; `.md` files
  are not fixed by Prettier, so convert them to LF.
- 2026-11-08: Keep the front matter `description` in double quotes: it contains
  `: `, which is invalid in plain YAML and hides the skill from agents.
- 2026-11-08: Some ingredients repeat their unit in the name
  (`1 gousse(s) Gousse(s) de vanille`), which produced `1 gousse de gousse de
  vanille`. `stripRepeatedUnit` removes the leading unit (with `de`/`d'`) when it
  matches the parsed unit. `tranche` moved from counted to container units, so
  `2 tranches de lard` keeps its `de` instead of becoming `2 lards`.

## Options

| Option | Default |
| --- | --- |
| `--slug <slug>` | built from the CuisineAZ name |
| `--title <text>` | CuisineAZ name in title case |
| `--description <text>` | `<name> (CuisineAZ)` |
| `--tags <a,b>` | guessed |
| `--date <YYYY/MM/DD>` | today |
| `--no-crop` | crop around the dish |
| `--crop-left <px>` | automatic (food centre) |
| `--no-tips` | write the FAQ as `## Astuce` |
| `--force` | refuse to overwrite an existing recipe or import a dish twice |
| `--dry-run` | write the files |
| `--check` | re-test `references.json` instead of importing |

## What the script writes

- `recipes/<slug>/recipe.md`: front matter (title, authors, keywords), the
  photo, a one-line intro with the total time, `## Ingrédients (N personnes)`
  (this heading turns the list into a checklist on the site), `## Préparation`
  (numbered steps), `## Astuce` (one bullet per FAQ question) and `## Lien` (the
  CuisineAZ URL).
- `recipes/<slug>/<slug>.webp`: the original CuisineAZ photo, cropped squarely
  around the dish, at most 1920 px, WebP quality 82.
- `recipes.json`: the entry, inserted by date (newest first) and formatted with
  Prettier.
- In the console: a summary, the path of the square preview, and `À vérifier`
  when the data looks unusual.

Base directory for this skill: C:\Storage\Git\Cooking\.agents\skills\import-cuisineaz
Relative paths in this skill (e.g. scripts/, reference/) are relative to this base directory.
