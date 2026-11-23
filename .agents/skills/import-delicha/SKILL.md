---
name: import-delicha
description: "Import a recipe from delicha.fr into this site from its URL (https://www.delicha.fr/<slug>.html). Creates recipes/<slug>/recipe.md, a WebP photo cropped so the dish is centered on the home page, and the recipes.json entry. The skill improves itself with what each import teaches. WHEN: import delicha, import-delicha, delicha recipe, delicha.fr URL, *.delicha.fr/*.html."
---

# Import a Delicha recipe

Delicha is a WordPress site (Astra child theme `dlch`). The page carries a
schema.org `Recipe` as JSON-LD, but its `recipeIngredient` and
`recipeInstructions` are one prose blob. The readable data lives in the article
HTML instead:

- **Ingrédients**: a `<ul>` right after the `Ingrédients` H2, one `<li>` per
  ingredient, with an editorial parenthesis.
- **Préparation**: a bold `Étape N : Titre` paragraph followed by its prose.
- **Astuces**: `Conseil qualité` (ingredients), `Conservation` (preparation)
  and the `Astuces d'utilisation` list.
- **Photo**: `og:image` points to the original upload (Delicha also serves
  smaller `-1024x683` crops).

The script reads the article for the recipe and the JSON-LD for the name,
times, servings and photo, then writes them in the same shape as the Foodbag
and CuisineAZ imports.

Read **Findings** below before importing: it is what earlier imports learned.

## Steps

1. Dependencies must be installed (`pnpm install`): the script uses `sharp` and
   `prettier` from the repository.
2. Preview without writing anything (quote the URL when it contains `&`):

   ```powershell
   node .agents/skills/import-delicha/import-delicha.js "<url>" --dry-run
   ```

   Read the title, ingredients and steps. Then choose:
   - **tags** from those already used in `recipes.json` (`Viande`, `Poisson`,
     `Pates`, `Asiatique`, `Accompagnement`, `Entrée`, `Apéro`, `Salade`,
     `Dessert`, `Pizza`, `Sauce`, ...). The guess covers Viande, Poisson,
     Pates, Asiatique, Pizza and the Delicha categories (Dessert, Entrée,
     Apéro, Salade, Sauce, Accompagnement).
   - a short **slug**: the main words without filler, e.g.
     `huile-piquante-pizza`.
   - a **title** without the page's article suffix (`: la bonne recette`).
   - a **description** for `recipes.json` when the default
     `<name> (Delicha)` is too dry.
   - a **rest** time (`--rest "48 h d'infusion"`) when the steps need a long
     rest that `totalTime` ignores. Without it, the script flags the long rest.
3. Import:

   ```powershell
   node .agents/skills/import-delicha/import-delicha.js "<url>" --slug <slug> --title "<title>" --tags Sauce --rest "48 h d'infusion"
   ```

   Note every line under `À vérifier`: data the script was not written for.
4. **Check the photo.** The home page shows each photo as a centered square.
   Open the square preview whose path the script prints (`carré : ...png`). The
   dish must be centered, with even margins on both sides.
   - The script crops a square of the shorter side, centered on the largest
     connected area of saturated, bright pixels (the food), not on the image.
   - Delicha photos are landscape shots with props all around: a prop can pull
     the crop. Pass `--crop-left <px>` to move the left edge of the square, or
     `--no-crop` to keep the whole photo.
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
- an error, or a Delicha change (theme, article structure, JSON-LD fields);
- a manual fix to `recipe.md`, the photo or the `recipes.json` entry;
- a step of this file that was wrong, missing or unclear.

For each finding, before finishing the task:

1. **Fix the cause** in `import-delicha.js` when it can apply to future
   recipes (a new unit, a field that moved, a better crop rule...). Fix the
   pattern, never one dish: no dish ids, names or recipe-specific text in the
   script. If it cannot be automated, write the manual workaround in
   **Findings**.
2. **Add a reference** in `references.json` (or extend one): the Delicha URL,
   `why` it matters, the exact Markdown lines (`expect`) that prove the fix, the
   text that must not appear (`absent`), the guessed `tags`, the generated
   `slug`, the `title` used, the number of tips (`tips`), the `rest` text, and
   whether the photo is `square` and the crop is `cropShifted`. Use the recipe
   just imported.
3. **Check for regressions**: `node .agents/skills/import-delicha/import-delicha.js --check`
   must end with all references `OK`. It reads every reference again and writes
   nothing. If an old reference fails because Delicha changed its data (not
   because of your change), update that reference and say so.
4. **Update this file**: add one dated line to **Findings**; update Steps,
   Options or "What the script writes" if the behavior changed; delete
   workarounds the script now handles. Keep it short.
5. Format: `pnpm exec prettier --write .agents/skills/import-delicha`.
   Prettier skips Markdown, so make sure `SKILL.md` keeps LF line endings (the
   repository uses `eol=lf`).
6. Repeat the import with `--force` if the fix changes its result.

Never store API keys, tokens or other secrets in the skill.

## Findings

- 2026-11-22: The JSON-LD `Recipe` is nested in two `@graph` levels and packs
  all ingredients in `recipeIngredient[0]` and all steps in
  `recipeInstructions[0]`, as one prose blob. The script flattens every
  `@graph`, then reads the ingredients from the `<ul>` after the `Ingrédients`
  H2 and the steps from the bold `Étape N :` paragraphs. The JSON-LD is only
  used for name, times, servings and photo; a list read from its blob is a
  fallback.
- 2026-11-22: Ingredient parentheses are editorial comments
  (`(la base de votre préparation)`, `(ajustez selon votre tolérance au
  piquant)`). The script drops them and keeps only a real qualifier:
  `(facultatif)`, `(optionnel)` or `(au goût)`. Free-text lines are lower-cased
  (`Quelques grains de poivre noir` → `quelques grains de poivre noir`).
- 2026-11-22: Tips are not a FAQ: they are the `Conseil qualité` paragraph
  before the steps, the `Conservation` paragraph after them, and the
  `Astuces d'utilisation` list. The script writes them as `## Astuce` bullets
  and labels the first two (`**Conservation :** ...`).
- 2026-11-22: `totalTime` (`PT20M`) is the active time only: the steps require
  1 to 2 h of cooling and 48 h to 2 weeks of infusion. `--rest` adds the real
  rest to the intro (`Prêt en 20 minutes, puis 48 h d'infusion.`); without it
  the script flags any step that mentions days or weeks.
- 2026-11-22: `og:image` is the original 2496x1664 upload; the `-1024x683`
  copies are crops. The food-centre square (1664x1664) moved 78 px right of the
  image centre (left 494 instead of 416) and keeps the bowl centred. Delicha
  props (herbs, chillies) can be large: check the preview.
- 2026-11-22: Typography is mostly clean but writes `60-70°C`; `tidyStep` adds
  the missing space (`60-70 °C`). It only tightens `,` and `.`: the French
  space before `:` must stay (`conditions : récipient`).
- 2026-11-22: Files created on Windows can get CRLF line endings; `.md` files
  are not fixed by Prettier, so convert them to LF.

## Options

| Option | Default |
| --- | --- |
| `--slug <slug>` | built from the title |
| `--title <text>` | Delicha name in title case |
| `--description <text>` | `<name> (Delicha)` |
| `--tags <a,b>` | guessed |
| `--date <YYYY/MM/DD>` | today |
| `--rest <text>` | none |
| `--no-crop` | crop around the dish |
| `--crop-left <px>` | automatic (food centre) |
| `--no-tips` | write the tips as `## Astuce` |
| `--force` | refuse to overwrite an existing recipe or import a dish twice |
| `--dry-run` | write the files |
| `--check` | re-test `references.json` instead of importing |

## What the script writes

- `recipes/<slug>/recipe.md`: front matter (title, authors, keywords), the
  photo, a one-line intro with the active time and the rest time, a
  `## Ingrédients (N personnes)` list (this heading turns the list into a
  checklist on the site), `## Préparation` (numbered steps), `## Astuce` (the
  quality, conservation and usage tips) and `## Lien` (the Delicha URL).
- `recipes/<slug>/<slug>.webp`: the original Delicha photo, cropped squarely
  around the dish, at most 1920 px, WebP quality 82.
- `recipes.json`: the entry, inserted by date (newest first) and formatted with
  Prettier.
- In the console: a summary, the path of the square preview, and `À vérifier`
  when the data looks unusual.

Base directory for this skill: C:\Storage\Git\Cooking\.agents\skills\import-delicha
Relative paths in this skill (e.g. scripts/, reference/) are relative to this base directory.
