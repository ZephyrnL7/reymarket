# RikiMarket

Express and Supabase backend for the Malaysia digital-products storefront. The legacy files under `rikimarket_clean_source/` are presentation references only; their scripts are not loaded by the rebuilt app.

## Local setup

1. Use Node.js 20 or newer and create a Supabase project.
2. Run `supabase/migrations/202611090001_initial_schema.sql` in the Supabase SQL Editor.
3. Copy `.env.example` to `.env`, then set the Supabase project URL, **server-only** service-role key, and a random `JWT_ACCESS_SECRET` of at least 32 characters.
4. Install and start:

   ```sh
   npm install
   npm run dev
   ```

5. Open `http://localhost:3000`. To provision the first administrator, register your account, then run this once in the SQL Editor with your email:

   ```sql
   update public.users set role = 'admin' where email = lower('you@example.com');
   ```

   Verify exactly one row was updated. Never allow registration input to set a role.

The migration creates a private `receipts-private` Storage bucket and a public-read `product-images` bucket. Receipt objects are uploaded only by the backend and are exposed to administrators through short-lived signed URLs; product image writes also require the admin API. The service-role key must never be placed in frontend code. If you override either bucket name in `.env`, create the matching bucket in Supabase with the same privacy and file restrictions.

## Payment configuration

Set `TNG_QR_IMAGE_URL`, `MAYBANK_ACCOUNT_NAME`, and `MAYBANK_ACCOUNT_NUMBER` in the environment. The QR image URL should be a public HTTPS image URL; these are payment instructions, not receipt storage. Leave them empty until ready. The deposit workflow creates a reference before transfer, then accepts a receipt image for manual review.

All amounts crossing the API are integer sen (`*_cents`). The UI's single `formatMYR` utility renders them as `RM0.00`.

## Deploying to Render

- Build command: `npm install`
- Start command: `npm start`
- Set `NODE_ENV=production`, `APP_ORIGIN` to the exact HTTPS Render URL, and all required secrets/environment values.
- A free instance may sleep. A monitor such as cron-job.org can request `/healthz` periodically. The backend also expires pending deposits on startup and every 15 minutes while running; a sleeping free instance will process expiry when it wakes.

## Security and operations

- Access JWTs are short-lived and both tokens use `httpOnly`, `SameSite=Strict` cookies; refresh tokens are opaque, stored hashed, and rotated atomically. Mutating browser requests must have the configured same-origin `Origin`.
- Passwords use bcrypt with 12 rounds. Auth and deposit endpoints are rate limited, request bodies are Zod-validated, and receipt content is checked by magic bytes before private upload.
- Deposit approval/rejection and product changes use database functions that check authorization and write their audit records atomically. Balance credits and purchases are also atomic; approval requires the manually verified bank reference and only accepts a `pending` request.
- `notifyAdmin(message)` currently logs a placeholder notification on the server. Connect a private Telegram/WhatsApp integration there without returning credentials to clients.
- Product delivery is represented by the purchase transaction and inventory count. External Indonesia-specific provider flows from the legacy app are intentionally not carried over without Malaysia provider specifications.

## API outline

- Auth: `/api/auth/register`, `/login`, `/logout`, `/refresh-token`
- User: `/api/user/profile`, `/transactions`, `/deposit-requests`, `/notifications`
- Products: `/api/products`, `/api/products/:id`
- Deposit: `/api/deposit-request/intent` creates a reference before transfer; `/api/deposit-request` accepts the receipt.
- Purchases: `/api/purchase/:productId`
- Admin (central `requireAuth` + `requireAdmin`): `/api/admin/deposit-requests`, deposit approve/reject, stats, product CRUD, and users.
