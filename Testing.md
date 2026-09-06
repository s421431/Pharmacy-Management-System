# Manual Test Checklist — Purchase → Inventory Flow

## Setup
- [ ] `npm run dev` starts cleanly, `✅ MySQL connected` shown
- [ ] Logged in as admin (session cookie active)

## Purchase → Inventory happy path
- [ ] `POST /suppliers/add` creates a supplier, returns `id`
- [ ] `POST /purchase/add` with 2+ items (different medicines) returns `201` and correct `total_amount`
- [ ] `GET /inventory` shows both medicines with `total_quantity` matching the batch quantities just added
- [ ] `GET /purchase/:id` shows both items with correct `medicine_name`, `batch_number`, `expiry_date`
- [ ] `GET /inventory/low-stock` still correctly lists any medicine under 10 units (unaffected by the new purchase if quantity ≥ 10)
- [ ] `GET /inventory/near-expiry` lists only batches within 30 days — confirm the new batch does NOT appear if its expiry is far out

## Delete flow
- [ ] `POST /purchase/:id/delete` on an unsold purchase → succeeds, batches removed, `GET /inventory` total_quantity drops back down
- [ ] `POST /purchase/:id/delete` on a purchase with no items → succeeds (edge case, nothing to reverse)
- [ ] **Test after Day 8 (once Billing/Sale exists):** create a sale against one of the batches, then try deleting that purchase → must fail with `409` "Cannot delete: stock from this purchase has already been sold"

## Validation / bad input
- [ ] `POST /purchase/add` with missing `supplier_id` → `400`, no rows inserted
- [ ] `POST /purchase/add` with non-existent `supplier_id` → `400` "supplier_id does not exist"
- [ ] `POST /purchase/add` with `quantity: "abc"` → `400`, not a raw SQL error
- [ ] `POST /purchase/add` with `expiry_date: "not-a-date"` → `400`, not silently inserted
- [ ] `POST /purchase/add` with one bad item among several good ones → entire transaction rolls back, `GET /purchase` count unchanged
- [ ] `DELETE`-equivalent on a batch directly in MySQL while referenced by `PurchaseItem` → fails with FK error (sanity check on schema, not the API)

## Error handling
- [ ] Force a DB error (e.g. stop MySQL mid-request) → user sees generic error page/JSON, not raw SQL text in response
- [ ] Server console still logs the real error for debugging