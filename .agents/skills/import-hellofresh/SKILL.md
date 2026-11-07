# Skill: import-hellofresh

# Import a HelloFresh recipe

HelloFresh recipe pages embed a schema.org `Recipe` object as JSON-LD, so no
browser is needed. The script reads the name, headline, photo, description,
total time, servings, ingredients and steps from that object, and the step
photos from the HTML instruction blocks, then writes them in the same shape as
the Foodbag imports.

Read **Findings** below before importing: it is what earlier imports learned.

## Steps

1. Dependencies must be installed (`pnpm install`): the script uses `sharp` and
   `prettier` from the repository.
2. Preview without writing anything (quote the URL: it contains `&`):

   ```powershell
   node .agents/skills/import-hellofresh/import-hellofresh.js "<url>" --dry-run
   ```

   Read the title, ingredients and steps. Then choose:
   - **tags** from those already used in `recipes.json` (`Viande`, `Poisson`,
     `Pates`, `Asiatique`, `Accompagnement`, `Entrée`, `Apéro`, `Salade`,
     `Dessert`, `Pizza`, ...). The guess covers Viande, Poisson, Pates and
     Asiatique only.
   - a short **slug**: the main words without filler, e.g.
     `tagliatelle-ragu-canard-confit`.

3. Import:

   ```powershell
   node .agents/skills/import-hellofresh/import-hellofresh.js "<url>" --slug <slug> --tags Viande,Pates
   ```

   Note every line under `À vérifier`: data the script was not written for.

4. **Check the photo.** The home page shows each photo as a centered square.
   Open the square preview whose path the script prints (`carré : ...png`). The
   meal must be centered, with even margins on both sides.
   - The script crops a square of the shorter side, centered on the dish (the
     largest saturated or dark area), not on the image.
   - A plate can be wider than that square in a 3:2 photo: both rims are then
     clipped. Check that the clipping is even and the meal centered; if not,
     crop the source photo by hand with `sharp`, then save it again as
     `recipes/<slug>/<slug>.webp` (max 1920 px, WebP quality 82).
   - `--force --no-crop` re-imports with the photo kept whole.

5. Read `recipes/<slug>/recipe.md` once and fix anything odd (wording, units,
   order). HelloFresh mixes singular/plural and sometimes contradicts itself:
   check that the ingredient names match the title and the steps, and that each
   step shows the photo of that step (open the `-etape-N.webp` files).
6. Validate: `pnpm run build`. It must succeed and print the new page in
   `dist/recipes/<slug>/`. It also refreshes `public/recipes.json`, which is
   tracked: keep that change. If `pnpm dev` is already running, also run
   `pnpm run build:recipes:dev`.
7. **Update this skill** with what this import taught (next section). Required
   whenever there was a finding.
8. Summarize what was imported, and what changed in the skill if anything. Do
   not commit or push unless the user asks.

## Keep this skill up to date

A **finding** is anything this skill did not handle on its own:

- a line under `À vérifier` that is not already explained in **Findings**;
- an error, or a HelloFresh change (JSON-LD fields, page structure, units);
- a manual fix to `recipe.md`, the photo or the `recipes.json` entry;
- a step of this file that was wrong, missing or unclear.

For each finding, before finishing the task:

1. **Fix the cause** in `import-hellofresh.js` when it can apply to future
   recipes (a new unit, a field that moved, a better crop rule...). Fix the
   pattern, never one dish: no dish ids, names or recipe-specific text in the
   script. If it cannot be automated, write the manual workaround in
   **Findings**.
2. **Add a reference** in `references.json` (or extend one): the HelloFresh URL,
   `why` it matters, the exact Markdown lines (`expect`) that prove the fix, the
   text that must not appear (`absent`, e.g. `<ul>` or `&#39;`), the number of
   step photos (`stepImages`), and whether the photo is square (`square`). Use
   the recipe just imported.
3. **Check for regressions**: `node .agents/skills/import-hellofresh/import-hellofresh.js --check`
   must end with all references `OK`. It reads every reference again and writes
   nothing. If an old reference fails because HelloFresh changed its data (not
   because of your change), update that reference and say so.
4. **Update this file**: add one dated line to **Findings**; update Steps,
   Options or "What the script writes" if the behavior changed; delete
   workarounds the script now handles. Keep it short.
5. Format: `pnpm exec prettier --write .agents/skills/import-hellofresh`.
   Prettier skips Markdown, so make sure `SKILL.md` keeps LF line endings (the
   repository uses `eol=lf`).
6. Repeat the import with `--force` if the fix changes its result.

Never store API keys, tokens or other secrets in the skill.

## Findings

- 2026-11-07: The JSON-LD `name` concatenates the title and the subtitle
  without a separator (`Tagliatelle au ragù de canard confit Accompagnées de
  roquette`). The page's `<h1 data-test-id="recipe-name">` and `<span
  data-test-id="recipe-headline">` give them separately; the script uses those,
  with the JSON name as fallback.
- 2026-11-07: Ingredients are `quantity unit Name` strings. Count units are
  written `pièce(s)`, containers `boîte(s)`/`bouquet(s)`, spoons `cs`/`cc` and
  fractions can be Unicode (`½`, `⅔`). The script drops count units, expands
  spoons to `cuillère à soupe`/`cuillère à café`, singularizes/pluralizes the
  counted name, and writes `2/3 boîte de ...`, `8 bouquets de ...`.
- 2026-11-07: `à votre convenance Poivre et sel` is not a measure: the script
  drops the phrase and keeps `poivre et sel`, sorted last with the other
  seasonings.
- 2026-11-07: The JSON-LD image is 1200 px wide, but the page also has a
  3840 px `media.hellofresh.com` version of the same file. The script keeps the
  widest URL found in the page.
- 2026-11-07: The Foodbag circle detector cropped this angled bowl too tightly:
  it found an off-centre inner circle and cut the right rim. HelloFresh hero
  photos are 3:2 landscape, so this script crops a square of the shorter side
  instead (3180x2120 → 2120x2120).
- 2026-11-07: Some steps are HTML lists and paragraphs (`<ul><li>`, `<p>`,
  `<strong>`, `<em>`, `&#39;`). `cleanText` flattens block tags to spaces, keeps
  bold/italic as Markdown and decodes numeric and French named entities, so a
  step reads as one prose paragraph. The farfalle reference checks that no
  `<ul>`, `<p>`, `<strong>` or `&#39;` remains.
- 2026-11-07: HelloFresh steps can point to step photos (`(voir photo)`) that
  this site does not show: they are removed, while `(voir conseil)` stays
  because the tip is in the same step. The mousse reference checks it.
- 2026-11-07: The unit `brin` was missing (`1 brin de romarin frais`); it is now
  in the container units, so two become `2 brins`.
- 2026-11-07: Vegetarian and dessert recipes often get no guessed tag: pass
  `--tags` (`Accompagnement`, `Dessert`, ...). The mousse reference expects an
  empty guess.
- 2026-11-07: HelloFresh also shows one photo per instruction step, but the
  JSON-LD does not contain them: they sit in the HTML
  `data-test-id="instruction-step"` blocks (a 384 px `src` with a 750 px
  `srcset` copy). The script reads the widest URL of the first image of each
  step and writes `recipes/<slug>/<slug>-etape-N.webp` (at most 1200 px, WebP,
  full frame), shown under the step. A failed download drops only that photo;
  `--no-step-images` skips them all. The tagliatelle reference checks
  `stepImages: 6`.
- 2026-11-07: HelloFresh can contradict itself: the title and steps say
  `tagliatelle` while the ingredient list says `Linguine`, and a step contains
  the typo `Arossez`. The script now flags a different pasta in the title and
  the ingredients under `À vérifier`; both the pasta name and the typo were
  fixed by hand in `recipe.md`.
- 2026-11-07: `?servings=4` does not change the page: the JSON-LD keeps
  `recipeYield: 2` and the 2-person quantities. The script therefore imports
  the servings HelloFresh gives, and has no `--persons` option.
- 2026-11-07: A first import failed with `fetch failed` while the same URLs
  loaded on retry. The script now retries a network failure twice (short
  backoff), and the error names the URL that could not be read.
- 2026-11-07: A step can glue a bold and an italic (`</strong><em>`) and put a
  space inside each marker (`... ? </strong>`, `... C.&nbsp;</em>`): the output
  used to read `?** ** *` and end with `C. *`. `cleanText` now trims the inside
  of bold/italic pairs, separates a bold close from an italic open, and keeps
  the spaces outside the markers. The lentil-salad reference checks the fixed
  step.
- 2026-11-07: The plate is centred but the meal is not: on the tagliatelle
  photo the food sits right of the plate centre, so the image-centred crop left
  an empty rim on the left and pushed the food to the right edge. The script now
  centres the square on the dish, i.e. the largest connected area of saturated
  or dark pixels (the food), and falls back to the image centre when no dish
  stands out. The plate can still be wider than a square of the shorter side,
  so both rims may be clipped; they are now clipped evenly. The tagliatelle
  reference checks `cropShifted`.
- 2026-11-07: `slugify` dropped the `œ` ligature (`Penne au bœuf` became
  `penne-b-uf-...`) because NFD does not decompose it. It now transliterates
  `œ`→`oe`, `æ`→`ae` and `ß`→`ss`. The penne reference checks the generated
  slug.

## Options

| Option | Default |
| --- | --- |
| `--slug <slug>` | built from the HelloFresh name |
| `--title <text>` | HelloFresh name in title case |
| `--description <text>` | `<name>, <headline> (HelloFresh)` |
| `--tags <a,b>` | guessed |
| `--date <YYYY/MM/DD>` | today |
| `--no-crop` | crop around the dish |
| `--no-step-images` | download the instruction step photos |
| `--force` | refuse to overwrite an existing recipe or import a dish twice |
| `--dry-run` | write the files |
| `--check` | re-test `references.json` instead of importing |

## What the script writes

- `recipes/<slug>/recipe.md`: front matter (title, authors, keywords), the
  photo, a one-line intro with the total time, the HelloFresh description, a
  `## Ingrédients (2 personnes)` list (this heading turns the list into a
  checklist on the site), `## Préparation` (numbered steps, each followed by its
  step photo when available) and `## Lien` (the HelloFresh URL).
- `recipes/<slug>/<slug>.webp`: the largest HelloFresh photo, cropped squarely
  around the dish, at most 1920 px.
- `recipes/<slug>/<slug>-etape-N.webp`: one WebP per instruction step photo
  (at most 1200 px, uncropped). Stale ones are removed on `--force`.
- `recipes.json`: the entry, inserted by date (newest first) and formatted with
  Prettier.
- In the console: a summary, the path of the square preview, and `À vérifier`
  when the data looks unusual.

Base directory for this skill: C:\Storage\Git\Cooking\.agents\skills\import-hellofresh
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
