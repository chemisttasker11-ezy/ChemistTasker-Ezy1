# Adding brand pack photos

This folder is where product photos live. It is intentionally kept in the project
even while empty, so photos can be added over time without touching any code.

## How to add a photo

1. **Drop the image file here.** Name it `<ingredient-slug>-<brand>.jpg`, all
   lowercase, hyphens instead of spaces. Examples:

   ```
   public/brands/cefalexin-keflex.jpg
   public/brands/amoxicillin-amoxil.jpg
   public/brands/amoxicillin-clavulanate-augmentin.jpg
   ```

   Keep it under about 200 KB and no wider than 900 px. A square-ish crop on a
   plain background looks best, because the UI renders it in a square tile with
   `object-contain`.

2. **Register it in `src/data/brands.json`.** Find the object whose
   `ingredient` matches, and add an entry to its `images` array:

   ```json
   "images": [
     {
       "brand": "Keflex 125 mg/5 mL",
       "file": "/brands/cefalexin-keflex.jpg",
       "sourceName": "Aspen Pharmacare Australia",
       "sourceUrl": "https://www.aspenpharma.com.au/...",
       "caption": "Keflex 125 mg/5 mL powder for oral liquid, 100 mL (AU pack)",
       "verified": true
     }
   ]
   ```

   | Field | Required | Notes |
   | --- | --- | --- |
   | `brand` | yes | Shown as the tile caption |
   | `file` | yes | Path from `public/`, so it starts with `/brands/` |
   | `sourceName` | recommended | Rendered under the brand name |
   | `sourceUrl` | recommended | Makes the source line a link |
   | `caption` | recommended | Becomes the image `alt` text |
   | `verified` | optional | Set `false` to hide a tile without deleting the record |

3. That is it. The panel renders the photo grid automatically for any ingredient
   with at least one image, above the register links. Ingredients with no photo
   just show the register links on their own.

## The ingredient slugs

`amoxicillin`, `amoxicillin-clavulanic-acid`, `phenoxymethylpenicillin`,
`flucloxacillin`, `cefalexin`, `cefazolin`, `cefotaxime`, `ceftriaxone`,
`azithromycin`, `clarithromycin`, `roxithromycin`, `clindamycin`, `lincomycin`,
`metronidazole`, `trimethoprim-sulfamethoxazole`, `trimethoprim`, `gentamicin`,
`vancomycin`, `benzylpenicillin`, `ciprofloxacin`, `meropenem`,
`piperacillin-tazobactam`, `rifampicin`, `nitrofurantoin`, `doxycycline`,
`aciclovir`, `dexamethasone`.

## Before you use someone else's photo

Australian pack photography for prescription medicines is generally published
under all-rights-reserved terms. Safe sources, in order of preference:

1. **Photos you take yourself** of stock on your own shelf. Cleanest option, no
   licensing question, and the pack matches what your patients actually receive.
2. **The sponsor's own media or product page**, where the terms allow
   reproduction for identification. Record the URL in `sourceUrl`.
3. **Openly licensed images** (Wikimedia Commons CC0 / CC BY / CC BY-SA). Note
   that most of these are overseas packs, so say so in the `caption` — an
   overseas Augmentin box is not the Australian presentation.

Do not use retailer product images, pill-identifier photographs, or AI-generated
mock-ups. Retailer images are licensed to the retailer, and identifier photos
frequently show a different country's product with different imprints and
strengths, which is a genuine clinical hazard in a dosing tool.
