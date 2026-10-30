# Dashboard Phase 3: Etsy catalog and sales

## Catalog correction

The former sync in `lib/dashboard/etsy-catalog.ts` requested only `active`, `draft`, and `inactive`. Etsy's `getListingsByShop` also accepts `expired` and `sold_out`; these are distinct states. The sync now requests all five through `GET /v3/application/shops/{shop_id}/listings?state=...`. **Pendientes de renovación** is the API's `expired` count only. `sold_out` is shown separately and is not added to the renewal number. Until the first sync after deployment, the new counts are unknown (`--`), not zero. The period selector affects only creation-date counts, never current state totals. No renewal or listing mutation is performed.

## OAuth and order source

The existing OAuth request adds `transactions_r` to `shops_r listings_r listings_w`. Etsy's authorization-code flow requires the owner to explicitly reauthorize through **Reautorizar Etsy** in Dashboard. A refresh token cannot gain a new scope. The callback refuses to replace the existing cookie if Etsy grants only a subset, preserving Listing and Scale. Tokens remain in the existing server-side httpOnly secure cookie; no second Etsy authentication is introduced.

The owner-only manual sales sync uses the existing shop lookup and `GET /v3/application/shops/{shop_id}/receipts`, once for `was_canceled=false` and once for `was_canceled=true`. It requests up to ten 100-item pages per category, sequentially. The first sync fetches at least the current and preceding 90-day windows with `min_created`. Later syncs request `min_last_modified` from the last successful sync minus one day, upserting by `(shop_id,receipt_id)` and replacing embedded transaction details by transaction ID. A 15-minute cooldown and running lock avoid duplicate requests. A page-limit result is marked partial and does not replace the previous completed snapshot; provider failures also retain the prior snapshot. Dashboard GET reads SQLite only. If Etsy omits embedded transactions for any paid receipt, product rankings remain unavailable rather than inferred.

Migration v12 adds `expired_count` and `sold_out_count` to the catalog cache, plus sales sync, receipt and transaction tables to the existing Automation SQLite database. It runs on normal startup. Only receipt IDs, timestamps, status, monetary fields, and transaction/listing IDs, quantities and prices are stored. No buyer name, email, address, note, or payment credential is persisted or logged. No new environment variable is required.

## Metric definitions and limits

- **Pedidos:** number of receipts created in the selected UTC calendar-day window, including unpaid and canceled. **Pagados:** status `paid` or `completed`. **Cancelados:** status `canceled`. A `completed` receipt is counted within paid, not as an additional order.
- **Importe de pedidos:** sum of receipt `grandtotal` for paid/completed receipts, grouped by currency. This is the order total, **not money received, net revenue, or profit**. The primary tile is suppressed when multiple currencies or any paid receipt lacks a valid total.
- **Artículos, envíos, impuestos, descuentos:** sums of the corresponding receipt fields `subtotal`, `total_shipping_cost`, `total_tax_cost`, `discount_amt` for paid/completed receipts. Each component is `--` if any contributing receipt lacks the field. VAT may be reported separately by Etsy and is not included in the current tax field. These components are not asserted to reconcile arithmetically with `grandtotal`.
- **Ticket medio:** sum of valid `grandtotal` divided by paid/completed receipts with that currency. The comparison uses the immediately preceding period of equal calendar-day length; a zero prior value yields no percentage.
- **Evolución diaria:** receipts grouped by UTC creation date. The chart shows counts, not revenue. **Top products:** quantity from embedded transactions of paid/completed receipts; the line amount is `transaction.price * quantity` before order-level discounts, grouped by listing ID and currency. It is not seller proceeds. If transaction coverage is incomplete, the ranking is hidden.
- Partial refunds, full refunds, fees, seller payouts, VAT reconciliation, net profit, digital-vs-physical split, and financial account balances remain pending. The [Etsy payments guide](https://developers.etsy.com/documentation/tutorials/payments/) distinguishes receipts from post-fulfillment payments and ledger entries; `transactions_r` alone does not make receipt totals equivalent to cash received. CSV/ledger reconciliation belongs to a later phase.

## Deployment and verification

1. Before `./deploy.sh`, back up the existing production Automation SQLite database using the established backup procedure. Do not use `company.sqlite` or overwrite the database.
2. Deploy GitHub `main` with the usual procedure. The first database open applies v12. Confirm the application and old Listing/Scale flows still load.
3. As the owner, open Dashboard. Existing catalog counts should remain; new states initially show `--`. Click **Sincronizar Etsy** and verify `expired` and `sold_out` against Etsy Shop Manager. The reported count is read from Etsy, never hard-coded.
4. Click **Reautorizar Etsy** and explicitly approve the expanded permissions. Check that Listing and Scale remain connected. Then click **Sincronizar ventas**. Verify 7/30/90-day counts, currencies, status and timestamps. If scope is denied, the old connection remains and sales stay pending.
5. An Etsy error or rate limit should leave the last valid snapshot visible. Repeated sync clicks inside 15 minutes are blocked. Merely opening Dashboard must not call the receipts endpoint.

Rollback: revert the application code to the preceding commit. Leave v12 tables/columns in place; the older code can ignore them. Do not drop tables or restore an older database over newer production data without a deliberate recovery decision.
