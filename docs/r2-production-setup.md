# Cloudflare R2 media storage — production setup

Product images and videos uploaded in the admin are stored in a Cloudflare R2
bucket. This guide sets up the bucket, its public domain, CORS, an API token,
and the environment variables, then deploys the change.

## How uploads work

1. The admin picks a file. The browser asks the API for an upload link
   (`POST /api/admin/media/sign`) with the file's type and size.
2. The API checks that the user is an admin and that the file is allowed, then
   returns a signed R2 URL that is valid for 10 minutes and only accepts that exact
   type and size.
3. The browser uploads the file **directly to R2** (`PUT`), showing progress. The
   file never passes through Vercel, so Vercel's 4.5 MB request limit doesn't apply.
4. The browser calls `POST /api/admin/media/confirm`. The API reads the first bytes
   of the stored file and deletes it if it isn't a genuine image or video.
5. The public URL is saved with the product when the admin clicks Save.

| Kind | Formats | Max size |
|---|---|---|
| Image | JPEG, PNG, WebP | 8 MB |
| Video | MP4, WebM | 50 MB |

### File names in the bucket

Every upload gets a random name that includes the ID of the record it belongs to:
`<folder>/<record id>-<uuid>.<ext>`. Original file names are not kept.

| Folder | Holds | Example |
|---|---|---|
| `products/` | Product images and videos (ID = product ID) | `products/123-cf7bca51-a813-41e6-8f5a-76ec41897be7.jpg` |
| `categories/` | Category images (ID = category ID) | `categories/7-e1776f69-2f85-4bd7-9ec3-a5148a0a25a4.jpg` |
| `contents/` | Storefront and Discover page images (ID = content block ID) | `contents/15-cdeeee03-4f52-4647-8069-27ed84d15021.jpg` |

- **Records that aren't saved yet:** files uploaded while creating a new product,
  category or content block are named `<folder>/new-<uuid>.<ext>`. When the record
  is first saved, they're copied to `<folder>/<id>-<uuid>.<ext>` and the temporary
  file is deleted.
- **Reading the ID back:** the ID is everything between the folder and the first
  hyphen (pattern `^(products|categories|contents)/(\d+)-`). To see every file
  for product 123, search the bucket for the prefix `products/123-`.
- **Older files:** files uploaded before this naming (`products/<uuid>.<ext>`)
  keep their names.
- **Unused files:** leftover `…/new-…` files from forms that were never saved are
  deleted by the lifecycle rules in [step 7](#7-automatically-delete-unsaved-uploads-lifecycle-rules).
  Files removed from a saved record (`<folder>/<id>-…`) stay in the bucket.

## 1. Create the bucket

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
2. Name: `crysmona-media` (any name works; you'll put it in `STORAGE_2_BUCKET`).
3. Location: **Automatic**, or a location hint near your customers (e.g. Asia-Pacific).
4. Default storage class: **Standard**. Create the bucket.

> Use a **separate bucket for local development** (e.g. `crysmona-media-dev`) so
> test uploads don't mix with live product media.

## 2. Make it public through your own domain

1. Open the bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Enter a subdomain of a domain that's already on Cloudflare, e.g.
   `media.crysmona.com`, and confirm. Cloudflare creates the DNS record and the
   HTTPS certificate. Wait until the status shows **Active**.
3. Under **Public Development URL** (`r2.dev`), keep it **disabled** for the
   production bucket. `r2.dev` is rate-limited and not meant for live traffic.

Files are then served at `https://media.crysmona.com/products/…`, and through
Cloudflare's cache. Saved URLs use this domain, so you can later move the files
to another bucket without changing the database.

## 3. Allow browser uploads (CORS)

Bucket → **Settings** → **CORS Policy** → **Add CORS policy** (or Edit) and paste
this, replacing the domains with your live ones:

```json
[
  {
    "AllowedOrigins": ["https://crysmona.com", "https://www.crysmona.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

- `AllowedOrigins` must match the address bar exactly: scheme, host, no trailing
  slash. List both `www` and the bare domain if both serve the site. It should
  match `WEB_ORIGIN`.
- For the **development** bucket use `["http://localhost:5173"]` instead.
- Without this rule, uploads fail with "Upload … failed. Check your connection
  and the storage CORS settings."

## 4. Create an API token

1. **R2 Object Storage** → **Manage API tokens** (Account API tokens) →
   **Create API token**.
2. Permissions: **Object Read & Write**. (Read is needed for the content check, and
   write for upload and for deleting rejected files.)
3. Specify bucket(s): **Apply to specific buckets only** → select only
   `crysmona-media`.
4. TTL: Forever (or set a reminder to rotate it). Create the token.
5. Copy the **Access Key ID** and **Secret Access Key**. The secret is shown only
   once. Don't use the "Token value" (that is for Cloudflare's own API).
6. Copy your **Account ID** from the R2 overview page (right-hand side).

## 5. Environment variables

Add these to **Vercel → Project → Settings → Environment Variables →
Production** (and to `.env` for local, with the dev bucket's values):

```env
# Which storage receives new uploads
STORAGE_ACTIVE=2

# Storage 1: Vercel Blob. Keep this block while older images still live there;
# their saved URLs load directly and keep working either way.
STORAGE_1_TYPE=vercel-blob
STORAGE_1_NAME=Vercel Blob
# On Vercel, BLOB_READ_WRITE_TOKEN is provided automatically when the Blob store
# is connected. Locally, set STORAGE_1_TOKEN or BLOB_READ_WRITE_TOKEN.

# Storage 2: Cloudflare R2
STORAGE_2_TYPE=r2
STORAGE_2_NAME=Cloudflare R2
STORAGE_2_ACCOUNT_ID=<Cloudflare account ID>
STORAGE_2_BUCKET=crysmona-media
STORAGE_2_KEY_ID=<Access Key ID>
STORAGE_2_SECRET=<Secret Access Key>
STORAGE_2_PUBLIC_URL=https://media.crysmona.com
```

Rules:
- `STORAGE_2_PUBLIC_URL` must be `https://`, with no trailing slash.
- Never renumber a storage that has been used. Add the next number instead.
- The API checks every declared storage at startup and refuses to start if a
  value is missing. If you delete the Blob store, delete its whole `STORAGE_1_*`
  block.
- These are server-only secrets. Don't prefix them with `VITE_`, and don't commit `.env`.

Changing environment variables in Vercel takes effect on the **next deployment**.
Redeploy after adding them.

## 6. Check it works

1. Live admin → open a product → upload an image and a short MP4 → watch the
   progress → **Save**.
2. Cloudflare → bucket → **Objects**: the files appear under `products/`.
3. Open the product page: every thumbnail shows. Select the video and it plays
   muted on its own.
4. Try a `.mov` file and a file over 50 MB. The admin shows a clear error.

## 7. Automatically delete unsaved uploads (lifecycle rules)

Uploading in a form for a new product, category or content block, then closing it
without saving, leaves a `<folder>/new-…` file that nothing uses. R2 can delete
these by itself. Saved records' files are renamed to `<folder>/<id>-…` straight
away, so they never match these rules.

Bucket → **Settings** → **Object lifecycle rules** → **Add rule**. Create three
rules, one per folder:

| Rule name | Prefix (exactly) | Action |
|---|---|---|
| `delete-unsaved-products` | `products/new-` | Delete objects **1 day** after upload |
| `delete-unsaved-categories` | `categories/new-` | Delete objects **1 day** after upload |
| `delete-unsaved-contents` | `contents/new-` | Delete objects **1 day** after upload |

For each rule: enter the name and prefix, enable **Expire objects** (delete
uploaded objects) after **1 day**, leave the other actions off, and save.

> **Warning: the prefix must end with `new-`.** A rule with prefix `products/`,
> `categories/` or `contents/` (or an empty prefix) deletes **every live image and
> video** in that folder after a day. Double-check each prefix before saving.

- One day leaves plenty of time for an admin who is still filling in a form. If a
  form stays open longer than that before saving, its uploads may be gone. Upload
  again in that case.
- R2 runs these rules in the background, so files can take up to a day or so
  beyond the limit to disappear.
- Files removed from a **saved** record (`<folder>/<id>-…`) aren't covered,
  because only the database knows whether they are still used. Removing those
  needs a cleanup that compares the bucket with the database (a planned admin
  feature).
- Apply the same rules to the development bucket if you want it kept tidy too.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Upload … failed. Check your connection and the storage CORS settings." | The CORS rule is missing, or `AllowedOrigins` doesn't exactly match the site's address. |
| `SignatureDoesNotMatch` (403) in the browser's network tab | Wrong `STORAGE_2_SECRET` / `KEY_ID`, or the file changed between signing and upload. Retry, then check the keys. |
| "Uploads are unavailable. Configure media storage…" | No `STORAGE_*` variables on this deployment. Add them and redeploy. |
| "Direct uploads need an R2, S3 or custom storage as STORAGE_ACTIVE." | `STORAGE_ACTIVE` points at the Vercel Blob storage. Set it to the R2 number. |
| API won't start: "Set STORAGE_2_… for media storage 2." | A variable in that block is missing or empty. |
| Uploaded file shows a broken image | `STORAGE_2_PUBLIC_URL` is wrong, or the custom domain isn't Active yet. |
| "That file isn't a valid … image/video." | The file's contents don't match an allowed format. It was deleted. Export it as JPEG/PNG/WebP or MP4. |
