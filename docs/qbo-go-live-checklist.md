# QuickBooks Online — Go-Live Checklist

Operational guide for cutting over from the QBO **sandbox** to the live
**production** company. Work through this in order; every step is a
gate.

> **Stop.** You MUST be comfortable that all QBO S1–S11 functionality has
> been exercised in the sandbox before doing this cutover. The connection
> + links tables are bidirectional-ready; payment-status pull is backlog.

---

## 1. Create the production QBO OAuth app

1. Sign in at [Intuit Developer](https://developer.intuit.com) as the
   Spacecraft Joinery account.
2. Create a new **Production** app (or promote the existing sandbox app
   to production — Intuit's dashboard has this option).
3. Under the app's **Keys & credentials** tab, copy:
   - **Client ID** (production)
   - **Client Secret** (production)
4. Add the production redirect URI:
   `https://app.goodwoods.app/api/invoices/qbo/callback`
   (also add the Vercel preview domain if you want to test there first).

---

## 2. Generate a fresh encryption key for production

The sandbox and production tokens must be encrypted with **separate
keys** so a sandbox key can never decrypt a production token.

```bash
openssl rand -hex 32
# → e.g. a3f8...0d91  (64-char hex string)
```

Copy this value — you will not see it again after saving to Vercel.

---

## 3. Update Vercel environment variables (Production scope only)

In the Vercel dashboard → Good Woods project → **Settings** → **Environment Variables**:

| Variable | Value | Scope |
|---|---|---|
| `QBO_OAUTH_CLIENT_ID` | (production client id from step 1) | Production |
| `QBO_OAUTH_CLIENT_SECRET` | (production client secret from step 1) | Production |
| `QBO_TOKEN_ENC_KEY` | (key from step 2) | Production |
| `QBO_ENVIRONMENT` | `production` | Production |
| `NEXT_PUBLIC_INVOICES_QBO_ENABLED` | `true` | Production |

Leave **Preview** and **Development** scopes pointing at the sandbox
credentials so the sandbox connection stays intact for future testing.

---

## 4. Redeploy production

Trigger a new deployment (push to `main` or use **Redeploy** in Vercel).
The new env vars take effect after the deployment completes.

---

## 5. Verify the go-live checklist in the Settings panel

1. Open the dashboard at `https://app.goodwoods.app/settings`.
2. Scroll to the **QuickBooks** section.
3. The panel description should say **"Targeting the production
   environment"**.
4. The **production warning badge** (`qbo-prod-warning`) should be
   visible — this confirms `QBO_ENVIRONMENT=production` is live.

---

## 6. Complete the OAuth consent flow for the production company

1. Click **Connect QuickBooks** in the Settings panel.
2. Intuit redirects to the production consent page — sign in with the
   QuickBooks company owner account for Spacecraft Joinery.
3. Grant access to the single scope (`com.intuit.quickbooks.accounting`).
4. You are redirected back to `/settings?qbo=connected`.
5. The panel shows **Connected · [Company Name] · production**.

---

## 7. First-real-bill smoke

Post one real supplier invoice end-to-end:

1. Go to `/invoices`, upload a real supplier PDF.
2. Let the home-machine extractor process it (or click "Process now").
3. Review and correct the extracted fields.
4. On the match screen, assign lines to the correct job(s).
5. Click **Post to actuals** — verify the actual appears in
   estimated-vs-actual for the job.
6. On the posted-invoice screen, click the **QuickBooks push panel**.
7. Review the Bill preview (vendor, lines, GST/PST split).
8. Confirm the push — the Bill is created in QuickBooks.
9. Open QuickBooks and verify the Bill exists, vendor resolves, and
   taxes are correctly split (GST + PST as two separate tax lines).

---

## 8. Final go-live gates

- [ ] Vercel prod shows `configuredEnvironment: "production"` in
      `/api/invoices/qbo/status`
- [ ] `ConnectQuickBooksPanel` shows the production environment badge
      and production warning
- [ ] OAuth consent succeeded with the live company
- [ ] At least one real bill verified in production QuickBooks
- [ ] Token rotation verified: after 25 h, refresh a token manually
      (`getFreshAccessToken()` in a local script) and confirm the
      rotated refresh token is persisted (connection survives)
- [ ] `NEXT_PUBLIC_INVOICES_QBO_ENABLED=true` flipped in Vercel prod

---

## Rollback

If anything goes wrong:

1. Set `QBO_ENVIRONMENT` back to `sandbox` in Vercel and redeploy.
2. In the Settings panel, click **Disconnect** (clears the prod
   connection row from the DB).
3. Reconnect to the sandbox company to restore the pre-cutover state.

The `quickbooks_connection` table is single-row; disconnecting and
reconnecting is safe and idempotent.

---

## Payment-status PULL (backlog)

Pulling payment status back from QB (to mark invoices paid when QB
records the payment) is **backlog**. The `quickbooks_links` and
`quickbooks_connection` tables are already bidirectional-ready for it —
no schema migration required when that slice ships.
