# CONTEXT_INCOME_NZ.md
## Last updated: 2026-07-20 (Session 4)

---

## Infrastructure

| Item | Value |
|------|-------|
| Frontend | https://samuelmckay20-svg.github.io/income-nz/ |
| Backend | https://samuelreceipts.synology.me:3458/api |
| Server file | `/volume1/SERVER/income-backend/app/server.js` |
| Database | `/volume1/SERVER/income-backend/data/income.db` |
| Restart | `pkill -f "income-backend/app/server.js"; sleep 2; bash /volume1/SERVER/income-backend/start.sh` |
| SSH | `ssh -o PreferredAuthentications=password Sam@samuelreceipts.synology.me -p 22` |
| Receipts NZ frontend | https://samuelmckay20-svg.github.io/receipts-nz/ |
| Receipts NZ API | https://samuelreceipts.synology.me/api |
| Receipts NZ secret | 6QwWzWg72ICMnQDiVsWj9mEW4Jv9i6UAbvFsjcBF |

---

## Sam's Details

- **GST number:** 074-620-000-GST006
- **Filing:** 2-monthly, payments basis
- **Periods end:** Jan, Mar, May, Jul, Sep, Nov
- **Due:** 28th of month after period end
- **Current period:** 1 Jun to 31 Jul 2026, due 28 Aug 2026
- **Location:** Auckland/Manukau, New Zealand
- **Trading name:** Shrimpy Camera Dept
- **Brand colour:** PINK #F0167C (used as the header fill in both PDF exports)
  - A second colour "BROWN #4A2211" appeared in earlier notes but is not used
    anywhere in the app and was never confirmed. Do not treat it as brand.
- **App icon:** deep green #0F3A2A ground, cream #EEE9E1 serif dollar
- **Role:** Freelance filmmaker / DIT / Video Assist

---

## App Architecture

Single-file PWA deployed to GitHub Pages. Node.js/SQLite backend on Synology NAS.

### Key constants
```js
var API_BASE    = 'https://samuelreceipts.synology.me:3458/api';
var CLAUDE_MODEL = 'claude-sonnet-4-6'; // auto-updated on boot
var RECEIPTS_API = 'https://samuelreceipts.synology.me/api';
var LS_TOKEN    = 'nzin_token';
var LS_USER     = 'nzin_username';
```

### Tabs
1. Income — hero with gross/received/outstanding, FY/month/quarter filters
2. Invoices — full list, search, add invoice, add remittance
3. Bank — CSV import (ANZ/Kiwibank/BNZ), manual match, exclude from income
4. Tax — income tax brackets, GST return (IRD boxes 5/7/11/13/15), ACC, student loan
5. Clients — client profiles with W/H rates, GST numbers, payment terms

---

## Sync Architecture

- Local-first, server is source of truth
- `_localOnly: true` on unsynced items
- `local_TIMESTAMP` ID prefix until server assigns real integer ID
- Server returns `idMap` to promote local IDs

### Critical rules
- Empty stubs filtered from sync: `inv.client && inv.amount > 0`
- All `local_` items kept on load regardless of `_localOnly`
- Empty stubs filtered from server response too
- Bank `excluded` and `matched_invoice_id` flags preserved through server load

### Server endpoints
- `POST /api/sync` — push data
- `GET /api/data` — pull data
- `POST /api/claude` — Claude AI proxy
- `GET /api/models` — auto-detect Claude model
- `GET /api/receipts-gst` — proxy to Receipts NZ for GST input tax

---

## Remittance Flow

```
Add (+) -> Remittance -> openNewRemittance()
  stub added to invoices[] immediately
  _paidInvId = stub.id
  opens modal-paid

Scan PDF -> scanRemittance()
  sends as document type to Claude
  CLAUDE_MODEL, max_tokens:1024
  parses JSON, fills form fields
  multi-invoice: createMultiRemittance()

Save -> confirmMarkPaid()
  finds inv by _paidInvId
  isNew = extraFields visible AND inv.amount === 0
  fills client/amount/date/invoice_number/gst/wht_rate
  sets status=paid, paid_date, paid_amount=net, wht_amount, remittance_image

Cancel -> onClosePaidModal()
  removes empty stub if client='' and amount=0
```

---

## NZ Payment Patterns

### Night Zone / NEP (payslip)
- amount stored = gross inc GST (e.g. $1,384.60)
- W/H = 20% of ex-GST base only (e.g. $1,204 base x 20% = $240.80)
- net = gross_inc_gst - W/H = $1,143.80
- paid_amount stores the net

### Sky (remittance advice)
- Single or multi-invoice per remittance
- W/H = 20% of ex-GST base
- Multi-invoice: each line has invoice_number, amount, W/H

---

## GST Return

Payments basis — filter by paid_date not invoice date.

- Box 5: sum of inv.amount (gross inc GST) for paid invoices in period
- Box 7: Box 5 x 3/23
- Box 11: total expenses from Receipts NZ
- Box 13: input tax from Receipts NZ (claimPct + 50% entertainment rule)
- Box 15: Box 7 - Box 13

Period selector: chevron navigator, _gstPeriodOffset global, gstPeriodReset() on chip tap.

Receipts NZ fetched via /api/receipts-gst proxy. Cached 5 minutes.

---

## Bank Tab

### CSV formats
- ANZ: credit/debit columns, DD/MM/YYYY dates
- Kiwibank: same pattern
- BNZ: other party name + effective date, YYYY-MM-DD dates

### Rules
- No auto-match on import — purely additive
- Duplicate check: date + amount + (reference OR description)
- Manual match shows top 6 by score: amtDiff*2 + daysDiff*0.1
- Match list shows NET not gross
- Tolerance: $1.00 unpaid, $0.10 paid, 60 day window
- Excluded transactions move to "Excluded from income" section

---

## Invoice Display

Amount priority (paid invoices):
1. paid_amount if set
2. amount - wht_amount if wht_amount stored
3. amount (gross) as fallback

Badges: Paid/Unpaid/Overdue + W/H% (purple) + Verified (green when bank matched)

Edit: remittance_image present -> opens modal-paid; else -> opens modal-invoice

---

## Known Gotchas

1. Check `grep -c "function confirmMarkPaid" index.html` = 1 always
2. Never use string-match to remove modals — once deleted modal-paid by accident
3. Use CLAUDE_MODEL constant, never hardcode model strings
4. Filter empty stubs (client && amount > 0) in both frontend payload AND server
5. Bump sw.js VERSION on every deploy to force PWA cache refresh
6. bank_transactions.matched_invoice_id has NO foreign key (removed after FK errors)

---

## DB Schema (key columns)

```
invoices: id, user_id, client, amount, date, paid_date, paid_amount,
          gst, wht_rate, wht_amount, invoice_number, status, source,
          image, remittance_image, created_at, updated_at

bank_transactions: id TEXT, user_id, date, amount, description,
                   reference, matched_invoice_id TEXT (no FK),
                   source, excluded INTEGER DEFAULT 0, imported_at
```

---

## Starting Next Session

Upload:
1. This file (CONTEXT_INCOME_NZ.md)
2. Current index.html from GitHub

Say: "Continue Income NZ development. Context file attached."
