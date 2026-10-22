# Use cases

How the admin system behaves in specific situations. Each use case describes what
the admin does, what the system does at each step, and the reasons behind that
behaviour.

## Contents

1. [Remove an image or video from a product gallery](#1-remove-an-image-or-video-from-a-product-gallery)

---

## 1. Remove an image or video from a product gallery

**Who:** an admin editing a product.
**Where:** Admin → Products → open a product → gallery under "Main Image".

### Steps

1. The admin clicks **Remove image** (or **Remove video**) on a gallery tile.
2. The admin clicks **Save**.

### What happens when Remove is clicked

Only the form changes. Nothing is written to the database or to storage yet.

- The tile disappears from the gallery list in the form.
- If the removed item was the **default image**, the next *image* in the list
  becomes the default. A video is never chosen as the default.
- If the admin closes the form without saving, nothing changes.

### What happens when Save is clicked

| Where | Result |
|---|---|
| Database (`product_images`) | All gallery rows for the product are deleted and the remaining list is saved again, in its current order. This runs in one transaction, so if anything fails the previous gallery is kept. |
| Database (`products.image_url`) | Updated if the default image changed. |
| Product page | The removed image or video no longer appears in the gallery or thumbnails. |
| R2 storage | **The file is not deleted.** It stays in the bucket and its URL keeps working. |

Code: `saveProduct` in `server/routes/admin.ts`. The editor is `ProductImages` in
`src/pages/Admin.tsx`.

### Rules

- A product cannot be saved without an image, because **Main Image** is required.
  If every image is removed and only videos remain, Save is refused until an
  image is added.
- A video can never be the default (listing) image.

### Why the file is kept in storage

- **Past orders refer to it.** When an order is placed, the product's image URL
  is copied into the order line (`order_items.image_url`, written in
  `server/services/orders.ts`). Order history in the admin and the customer's
  account keeps showing that image after the product's photos change. Deleting
  the file would break those images.
- **Mistakes can be undone.** The file still exists after removal, so it can be
  added back with **Add image URL** if the URL is known.

### Side effects and limits

- Unused files build up in the bucket over time: removed gallery items, and
  uploads made in a form that was closed without saving (including leftover
  `…/new-…` files). Storage is cheap, so this is not urgent.
- A removed file stays publicly reachable by anyone who already has its URL.

### Possible future enhancement

A cleanup script that deletes files no longer used by any product, category,
content block **or order**. File names include the record ID
(`products/<id>-<uuid>.<ext>`, see `docs/r2-production-setup.md`), which makes
this easier. Orders must be checked too, for the reason above.
