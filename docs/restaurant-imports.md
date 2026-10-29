# Restaurant data & menu imports

EMS Food never depends on a single external service for restaurant data. The app uses a small provider interface (`backend/app/integrations/restaurant_providers/base.py`):

| Provider | Status | What it does |
| --- | --- | --- |
| `ManualMenuProvider` | Always on | Admin creates restaurants, categories, items, sizes and extras in the app |
| `FileImportMenuProvider` | Always on | Imports menus the restaurant sends you: PDF, photo (JPG/PNG/WEBP), CSV, Excel |
| `AuthorizedTalabatProvider` | **Disabled** | Placeholder for an officially authorized Talabat partner integration (see below) |

The admin Settings screen shows each provider's status, and the OCR status (Tesseract version and languages).

## Talabat — research findings (October 2026)

- Talabat does not publish a public API for discovering restaurants or reading their menus.
- The documented integration route is the **Talabat Restaurant Integration API** for restaurants and POS vendors (managing *their own* menus and orders). Access is requested through Talabat's partner integration site ([integration.talabat.com](https://integration.talabat.com/en/support/)) and granted case by case. No public endpoint reference was found.
- Third-party "Talabat scraper" services exist; using them would mean unauthorized scraping, so EMS Food does not use them.

Consequently `AuthorizedTalabatProvider` contains **only configuration gating and no endpoint paths**. It reports itself disabled unless `TALABAT_INTEGRATION_ENABLED=true` *and* `TALABAT_API_BASE_URL`, `TALABAT_CLIENT_ID`, `TALABAT_CLIENT_SECRET` are set — and even then it explains that the authorized endpoints must be implemented from the official documentation you receive with a partnership. Everything else in the app works without it. You can still store an *authorized* external link (e.g. the restaurant's own website or its Talabat page) in the restaurant's "external reference" field.

## Import pipeline

1. **Upload** — `POST /restaurants/{id}/menu/import`. The type is detected from file contents (magic bytes), not the extension. Limits: 20 MB, PDFs ≤ 30 pages. Re-uploading the exact same file for the same restaurant is refused (`DUPLICATE_IMPORT`) unless forced.
2. **Extract** (background task):
   - **Text PDFs** — PyMuPDF spans with font size and boldness, rebuilt into reading order (column detection by vertical gutters, row grouping by baseline).
   - **Scanned PDF pages** (little or no text) are rendered at 300 dpi and sent to OCR.
   - **Images** — OpenCV: grayscale → resize → denoise → CLAHE contrast → deskew (min-area-rectangle angle) → adaptive threshold → Tesseract (`eng+ara` when installed) with per-word confidence.
   - **CSV / Excel** — pandas; columns matched with fuzzy English/Arabic synonyms (category/القسم, name/الصنف, price/السعر, size/الحجم, extras/الإضافات, available/متاح…). Title rows above the header are skipped; multiple sheets become categories.
3. **Parse** (deterministic rules, `services/menu_import/parser.py`): Arabic-Indic digits → ASCII; prices recognized at the end of lines with optional currency (EGP, LE, ج.م, جنيه); headings by font size, boldness, capitals and category keywords; description lines attached to the previous item; size patterns (`S 80 / M 100 / L 120`, `Small Medium Large` header rows); `+ Cheese 20` lines become extras. **Prices are never guessed** — an item without a recognizable price gets `base_price = null` and `MISSING_PRICE`; lines the parser can't interpret are listed separately for the admin.
4. **Score** — each item gets a confidence (OCR confidence × rule certainty) and status `VALID` / `NEEDS_REVIEW` / `INVALID` with issues such as `MISSING_PRICE`, `UNLABELED_SIZES`, `PRICE_OUTLIER`, `LOW_OCR_CONFIDENCE`, `POSSIBLE_DUPLICATE`.
5. **Review** — the admin edits the draft (wide editable table on desktop/web, cards on phones): fix text and prices, add/delete rows, reassign categories, merge duplicates. Nothing is published yet.
6. **Approve** — explicit choice:
   - **Replace**: current items are archived (orders keep their snapshots). If a menu already exists, a second confirmation is required (`CONFIRM_REPLACE_REQUIRED`).
   - **Merge**: items matching by fuzzy name are updated (price, description, sizes/extras); new ones are added; others are untouched.
   Publishing is blocked while any item lacks a name or price (`IMPORT_HAS_ERRORS`). Every import, its draft and its outcome stay in the history.

### OCR requirements

Tesseract is installed in the Docker image with English and Arabic data (`tesseract-ocr-eng`, `tesseract-ocr-ara`). Running the API outside Docker without Tesseract still supports text PDFs, CSV and Excel; images and scanned pages then fail with a clear `OCR_UNAVAILABLE` message rather than pretending to work. If only Arabic is missing, imports show `ARABIC_OCR_UNAVAILABLE`.

macOS: `brew install tesseract tesseract-lang`. Debian/Ubuntu: `apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara`.

## File templates

- Menu: [templates/menu-template.csv](templates/menu-template.csv) (also works as an Excel sheet with the same headers)
- Employees: [templates/employees-template.csv](templates/employees-template.csv)

Menu columns: `category, name, description, price, sizes, extras, available`.

- `sizes`: `Regular:0|Large:+35` (increments) **or** `Regular:180|Large:215` (absolute prices). Alternatively use one row per size with the size in `sizes` and its full price in `price`.
- `extras`: `Cheese:20|Sauce:10`
- `available`: yes/no (also true/false, 1/0, نعم/لا)

Generate sample files (CSV, XLSX, text PDF and a PNG "photo"): `python -m app.cli generate-import-fixtures ./samples`.
