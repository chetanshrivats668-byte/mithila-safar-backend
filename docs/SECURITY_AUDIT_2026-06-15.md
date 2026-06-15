# Yatri Point — Deep Security Audit

**Audit date:** 2026-06-15
**Scope:** All committed source under `C:\Users\jigar\OneDrive\Music\BookNow`, plus `.env` on disk (local-only, NOT in git).
**Repository status:** `.env` is correctly git-ignored. `.env.example` is committed and was inspected. `scratch/` directory was committed in the initial commit and contains some legacy dev scripts (see Issue 13).

## Executive summary

This is a working product (Node 18+ / Express 5 / Supabase / Razorpay / MSG91) for bus, cab, hotel and café booking. It has **3 production-blocking** issues and **~12 high-severity** issues. The single most damaging finding is the Supabase Row Level Security posture (Issue 1): every table either has RLS disabled or has a fully permissive `USING (true) WITH CHECK (true)` policy. Anyone holding the `SUPABASE_URL` and `SUPABASE_ANON_KEY` (which the app itself ships to the browser via `/api/config`-style endpoints) can read every user's PII, password hash, Aadhaar, UPI, and OTP — and can modify any row.

**Issues found:** 23 total — 4 Critical, 9 High, 7 Medium, 3 Low.

---

## Issue 1 — Critical: Supabase RLS is fully permissive on every table

**Files / lines:**
- `supabase-schema.sql` lines 34, 64, 97, 120, 139, 153, 172, 191, 202, 216, 227 — `ALTER TABLE … DISABLE ROW LEVEL SECURITY`
- `supabase-migration-0003.sql` line 22–25 — enables RLS then creates `CREATE POLICY allow_all … USING (true) WITH CHECK (true)` on `users, collaborators, orders, email_otps, collaborator_buses, collaborator_cabs, collaborator_hotels, collaborator_cafes, collaborator_seats, hotel_rooms, cafe_tables`
- `supabase-migration-0004.sql` line 38–41 — same `allow_all` policy on `collab_applications`
- `supabase-migration-0005.sql` line 17 — same `allow_all` on `sms_otps`
- `supabase-migration-0008.sql` line 47–48 — same `allow_all` on `collab_applications` (re-asserted)

**Why it is a problem:** The Supabase URL and the `sb_publishable_…` anon key are returned by `GET /api/config` to every visitor (`server.js` line 206). The published Supabase client uses PostgREST, which honors RLS — but the policies above are equivalent to "no RLS at all". An attacker who scrapes the URL + key from the site can connect directly with a Supabase client and:
- Read every user record, including bcrypt password hashes, phone numbers and email addresses.
- Read every `collaborators` row including plaintext Aadhaar ID, UPI ID, bank details JSON, and document URLs.
- Read every order and SMS/email OTP (so they can hijack any in-flight verification).
- Update or delete any row — including wiping audit logs and order history.
- Forge new orders for any user.

**Exact code fix:** Replace each `allow_all` policy with table-specific policies that require `auth.role() = 'service_role'` for server-side reads/writes, or use a Supabase Edge Function pattern. A minimal immediate fix is one of:

1. Switch the Supabase client to use the **`service_role`** key (kept only server-side, never in `/api/config`) and **drop RLS** intentionally — but never expose the anon key, which the current code does.
2. Keep the anon key but write **strict RLS policies**, e.g. for `users`:
   ```sql
   CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid()::text = "id");
   CREATE POLICY "users_modify_own" ON public.users FOR UPDATE USING (auth.uid()::text = "id");
   ```
   And have the server use a service-role key for cross-user reads (admin endpoints).
3. **Drop the anon key from `/api/config`** — it isn't actually needed for any client-side logic. The browser only needs the **Razorpay Key ID** (which is public by design) and the **Firebase web config** (which is also public).

**Production impact:** **Severe.** A single scraped URL + anon key is a complete breach of customer and partner data, including government ID numbers and live OTPs. This is the kind of thing that gets reported to CERT-In and triggers partner offboarding.

---

## Issue 2 — Critical: Payment signature verification falls back to empty key

**File / line:** `server.js` line 270.

```js
const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(razorpayOrderId + '|' + razorpayPaymentId).digest('hex');
if (expectedSignature !== razorpaySignature) { return res.status(400).json({ success: false, message: 'Payment verification failed' }); }
```

**Why it is a problem:** `process.env.RAZORPAY_KEY_SECRET || ''` silently falls back to an empty string if the env var is missing. Unlike `ADMIN_USERNAME`/`JWT_SECRET` (which the startup check at line 35 forces to be present), there is **no startup check for `RAZORPAY_KEY_SECRET`**. If you ever deploy with that env var accidentally removed, every Razorpay webhook-style payload will verify against `hmac('', orderId|paymentId)` — an HMAC an attacker can compute in their browser without knowing any secret. Anyone could then hit `/api/razorpay/verify-payment` with a valid orderId and a forged signature, and the server would mark the order as `confirmed` without any actual payment.

**Exact code fix:**
```js
// In the startup block at server.js line 35, add:
if (!process.env.RAZORPAY_KEY_SECRET) missing.push('RAZORPAY_KEY_SECRET');

// Then in the verify handler:
const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
  .update(razorpayOrderId + '|' + razorpayPaymentId)
  .digest('hex');
```

**Production impact:** **Severe** if the env var is ever missing in a deploy. Direct path to free bookings.

---

## Issue 3 — Critical: Phone verification token never validated

**File / line:** `controllers/auth/authController.js` lines 494–517 (`markPhoneVerified`).

**Why it is a problem:** The endpoint accepts `{ phone, token }` in the body. The handler immediately writes `phone: <body.phone>, phoneVerified: true` to the user's record **without ever checking the `token` against MSG91, against `otpStore`, or against any other value**. Any logged-in user can call:
```
POST /api/auth/mark-phone-verified
Authorization: Bearer <their-token>
{ "phone": "+91XXXXXXXXXX", "token": "literally-anything" }
```
…and mark an arbitrary phone number as verified on their account. Verified phone numbers are then trusted elsewhere (e.g. as a "remembered" identifier on a user profile, for partner-account linking, and potentially for password-reset flows).

**Exact code fix:**
```js
// In authController.js markPhoneVerified:
import { verifyMsg91OTP } from '../../services/msg91/msg91Service.js';

const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
const normalizedPhone = '+91' + cleanPhone;
if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
  return res.status(400).json({ success: false, message: 'Invalid phone' });
}
const result = await verifyMsg91OTP(normalizedPhone, token);
if (!result || result.status !== 'success') {
  return res.status(400).json({ success: false, message: 'Phone verification failed' });
}
// Only then update the user record:
await dbUpdate('users', req.user.userId, { phone: normalizedPhone, phoneVerified: true });
```

**Production impact:** **High.** Defeats the only signal a partner is "the real owner" of a phone number. Enables account takeover pivots where the attacker has a known email but not the phone, and trusts in MSG91 quota/identity as well.

---

## Issue 4 — Critical: `app.js` ships hardcoded Razorpay and Google OAuth keys as fallbacks

**File / line:** `app.js` lines 2745–2746.
```js
GOOGLE_CLIENT_ID = '494833578713-r3tbr8e1bquphe3r84pbdeba5no7tqmj.apps.googleusercontent.com';
RAZORPAY_KEY_ID = 'rzp_test_SrBhiCCTjRroIi';
```

**Why it is a problem:** The Google client ID is the **same real OAuth Web Client** also present in `.env.example` (line 41) — it is bound to your `yatripoint.com` domains, so it's not a credential per se, but it is shipped in the public source. Worse: the Razorpay **test key** is also shipped. Even if it's in test mode today, anyone with that key can use your Razorpay test account to generate test transactions, hit your webhook verification flow, and probe for behaviour. When you switch to a live key, the temptation to "just put it here as a fallback" becomes a real production leak.

**Exact code fix:**
```js
// app.js: delete the .catch fallback entirely, or surface a clear error.
.catch(function (err) {
  console.error('Failed to load /api/config:', err);
  notify('Unable to initialize payment. Please refresh.', 'error');
  return;
});
```

**Production impact:** **Medium-high** in test mode, but it's a footgun the moment a live key lands in that file.

---

## Issue 5 — High: MockRedis silently used in production

**File / line:** `utils/redisClient.js` lines 88–111.

**Why it is a problem:** If `REDIS_URL` is missing **or** the `ioredis` package fails to import, the code falls back to `MockRedis` — a process-local `Map`. This happens with only a `console.warn` in production. Consequences:
- All email OTPs (`otp:email:*`) live in process memory. A redeploy wipes them, breaking verification.
- All admin-login rate-limit counters (`lockout:admin:*`) live in process memory. If you have multiple instances, an attacker can rotate IPs and target whichever instance has the cleanest counter.
- Multi-instance deployments have divergent state — same user, two instances, different "have you verified your email?" answers.

**Exact code fix:**
```js
// At the top of utils/redisClient.js, after imports:
if (process.env.NODE_ENV === 'production' && (!redisUrl || !RedisClientClass)) {
  throw new Error('REDIS_URL and ioredis are required in production. Refusing to start with MockRedis.');
}
```

**Production impact:** **High.** Currently active on Render if `REDIS_URL` isn't set. The fix also makes any future missing-env misconfiguration a deploy-time failure rather than a silent security degradation.

---

## Issue 6 — High: `node-functions/[[default]].js` is an unauthenticated duplicate of the API

**File / line:** `node-functions/[[default]].js` lines 66–87 (and 90+ for admin login).

**Why it is a problem:** This is a separate Express app, presumably deployed as a Cloudflare Pages Function. It re-implements `/api/create-order` (unauthenticated, line 66) and `/api/order-status/:orderId` (unauthenticated, line 83) without any of the auth middleware that the main `server.js` has. Anyone hitting the Cloudflare Pages function URL gets:
- Free order creation in any user's name (with arbitrary `amount`, `payNow`, `seats`).
- A real Supabase lookup that returns the same fields as the main `/api/order-status` (and again with no ownership check).
- An admin login that uses **plain SHA-256** of the password (line 95) — no salt, no bcrypt — stored in `ADMIN_PASS_HASH` (line 19) in memory.

If both the main server and this Cloudflare function point at the same Supabase, this is a parallel unauthenticated entry point.

**Exact code fix:** Delete `node-functions/[[default]].js` entirely, or mirror the auth middleware from `server.js`. If it's a real Cloudflare Pages Function you need to keep, at minimum:
```js
// Top of [[default]].js:
if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !JWT_SECRET) {
  throw new Error('…');
}
// Reject /api/create-order and /api/order-status without a valid user token.
```

**Production impact:** **High.** Confirmed working duplicate of the booking API; can be hit from any origin.

---

## Issue 7 — High: `bookSeats` is not atomic; concurrent bookings can double-sell

**File / line:** `services/seatService.js` lines 191–198 (`bookSeats`), and `controllers/busController.js` lines 203–234 (`bulkUpdateSeats`).

**Why it is a problem:** `bookSeats` does:
```js
for (const seatId of seatIds) {
  const result = await updateSeatStatus(db, seatId, 'booked', bookingId);
}
```
There is **no read-then-compare-then-write check** that the seat was `'available'` before flipping it to `'booked'`. Two concurrent users who both see seat 12 as available can both end up with the seat booked under their bookingId. Worse: `updateSeatStatus` in the in-memory branch (line 122–140) **creates a new seat record with status `'available'`** if one doesn't exist, then immediately overwrites it with `'booked'` — so the check is moot.

For a paid booking product this is a revenue and customer-trust issue. There is no SELECT … FOR UPDATE or row-level lock in either Supabase or memory path.

**Exact code fix:** Add a precondition check in `bookSeats`:
```js
export async function bookSeats(db, busId, seatIds, bookingId, travelDate) {
  const results = [];
  for (const seatId of seatIds) {
    const existing = memoryDb.seats.get(seatId);
    if (existing && (existing.status === 'booked' || existing.status === 'blocked')) {
      return { success: false, conflictingSeat: seatId, message: 'Seat already taken' };
    }
    const result = await updateSeatStatus(db, seatId, 'booked', bookingId);
    results.push(result);
  }
  return { success: true, results };
}
```
For the Supabase path, use a conditional update (`.update({...}).eq('id', seatId).eq('status', 'available')`) and check `rowCount` — if 0, another booking won the race.

**Production impact:** **High.** Double-bookings → customer complaints, chargebacks, and the kind of "the seat I paid for was sold to someone else" support ticket that hurts a startup brand.

---

## Issue 8 — High: `markPhoneVerified` (Issue 3) lets any logged-in user verify any phone

*(See Issue 3 above — listed again here for visibility because it is a security control bypass, not just a data leak.)*

**Production impact:** **High.** This is the only phone-ownership proof in the system; bypassing it lets an attacker claim another user's phone on their own account, then use that to receive OTPs and to satisfy any partner-linking that keys on phone.

---

## Issue 9 — High: `/api/collab-applications/status` is unauthenticated PII enumeration

**File / line:** `controllers/applicationController.js` lines 88–120 (`checkApplicationStatus`).

**Why it is a problem:** The endpoint takes `?email=…` or `?phone=…` and returns, for any applicant:
- `name`
- `serviceCategory` (bus / cab / hotel / cafe — i.e. what business they run)
- `status` (pending / approved / rejected)
- `googleEmail`
- `createdAt`

This is enough to know which of your partners applied when, what they do, and the email they used for Google login. No auth, no rate limit. An attacker can scrape your entire partner pipeline by iterating through emails/phones (and Indian phone enumeration is feasible — there are ~10⁹ valid numbers and you only need to test the prefixes that operators use).

**Exact code fix:**
```js
// routes/collab-applications.js, add requireAuth to this route.
// Server side:
app.get('/api/collab-applications/status', requireAuth, validate(validateSchemas.checkAppStatus), applicationController.checkApplicationStatus);
```
And in the controller, restrict the lookup to `req.user.email` or `req.user.userId`:
```js
const queryVal = (req.user.email || '').toLowerCase();
```

**Production impact:** **High.** A competitor can use this to map your partner roster, figure out which categories are underserved, and time their own market entry.

---

## Issue 10 — High: `/api/buses/:busId/seats` is unauthenticated and leaks inventory

**File / line:** `server.js` line 913.

**Why it is a problem:** Anyone can hit `/api/buses/<any-bus-id>/seats?date=2026-06-20` and see exactly which seats are booked, blocked, or available on any partner's bus on any date. That's commercially sensitive — a competitor operator can see your load factor by date, a customer can see which seat a celebrity booked, and an attacker can scrape seat IDs.

**Exact code fix:** Either require auth, or return only the **layout** without status/booking:
```js
app.get('/api/buses/:busId/seats', requireAuth, async (req, res) => { … });
// Inside, drop `status` and `bookingId` from the response.
```

**Production impact:** **Medium-high.** Data-leak rather than breach, but a competitive intelligence windfall.

---

## Issue 11 — High: `loginWithOTP` reads from a Redis key that is never written

**File / line:** `controllers/collabController.js` lines 210–264.

**Why it is a problem:** The endpoint reads `login:${email}` from Redis. Grepping the entire codebase, **nothing writes that key**. So today, the endpoint always returns "OTP not found" — it is dead code. The risk: the moment someone wires it up (a partial fix, a "let me add that" commit), the `email` parameter is **not validated to be an existing partner email** before the lookup. If a future implementation writes the key on the matching "send OTP" path without checking partner existence, you get the same kind of pre-account-takeover enumeration that user-login-with-OTP has.

Also: even today, the endpoint accepts a 5-attempt brute force (line 233) and there is no rate limit on it; combined with the fact that the email is passed verbatim, an attacker can use it as an OTP-channel existence oracle.

**Exact code fix:** Either delete the endpoint, or:
```js
// After reading the OTP, look up the partner and 404 explicitly if the email
// matches no collaborator (don't leak "not found" via timing — use a constant-time path).
if (!stored) return res.status(400).json({ success: false, message: 'Invalid OTP' });
// Add a Redis-backed IP rate limit (e.g. 10 attempts / 15 min).
```

**Production impact:** **Low today, high once fixed carelessly.**

---

## Issue 12 — High: `selectCollaboratorRole` issues a partner JWT based on email or phone match

**File / line:** `controllers/collabController.js` lines 446–492.

**Why it is a problem:** A logged-in user can claim a collaborator role by passing `collaboratorId` in the body. The ownership check (line 465) is:
```js
const isOwner = collab.userId === userId
  || (userEmail && collab.email === userEmail)
  || (cleanUserPhone && cleanCollabPhone === cleanUserPhone);
```
The email and phone matches are **unverified** (the user's email was only verified at signup, but their phone is whatever they typed — and `markPhoneVerified` is broken per Issue 3). So: a user who knows a partner's email **or** knows a partner's phone (both of which are leaked via the public listings endpoint `/api/listings/:type` → `server.js` line 738) can claim that partner's dashboard and receive a fully-scoped partner JWT.

**Exact code fix:** Require a *strong* ownership check — either `collab.userId === userId` AND a recent phone-verification token, or use the `requireCollaborator` middleware with a server-side re-check of the JWT claim.

**Production impact:** **High.** Direct path to partner-account takeover without ever knowing the password.

---

## Issue 13 — Medium: `scratch/` directory is committed in git

**File / line:** `scratch/fix_server_final.py` lines 48–50.

```python
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Yatri Point';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'YatriPoint@123';
const JWT_SECRET = process.env.JWT_SECRET || 'yatripoint-fallback-secret-key-2026';
```

**Why it is a problem:** This is a Python rewrite of `server.js` that includes the actual production admin password (`YatriPoint@123`) and a fallback JWT secret as **hardcoded strings in a committed file**. It also shows that the local admin username is `"Yatri Point"` (with a space), which is unusual and should be reviewed. Even though this file is not loaded by the running app, it has been in the repo since the initial commit and the credentials it contains may match what's currently in `.env` on disk.

**Exact code fix:** Remove `scratch/` from the repo (and add the uncommitted-state override to `.gitignore` is already done, so once removed it won't come back):
```bash
git rm -r scratch/
echo "scratch/" >> .gitignore   # already present, but commit it
git commit -m "chore: remove scratch/ dev scripts that contained credential fallbacks"
```
Then **rotate `ADMIN_PASSWORD` and `JWT_SECRET` in production** — these are compromised.

**Production impact:** **Medium.** The file is historical, but the secrets it contains are the ones that may still be in use. If `JWT_SECRET` is the literal string `yatripoint-fallback-secret-key-2026` in your production env, every JWT ever issued is forgeable by anyone with read access to this repo.

---

## Issue 14 — Medium: `/api/config` exposes `msg91TokenAuth` and `googleClientId` publicly

**File / line:** `server.js` lines 206–221.

**Why it is a problem:** `MSG91_WIDGET_TOKEN_AUTH` is a client-facing token (designed to be embedded in the browser for the widget), but exposing it to anonymous callers lets anyone trigger MSG91 OTPs through your account, burning your quota and abusing your sender ID. The `googleClientId` is meant to be public for OAuth flows, but in combination with the open CORS policy and the fact that the *server* trusts the Google credential (no nonce check) it widens the OAuth surface.

**Exact code fix:** Two options:
- Drop `msg91TokenAuth` from `/api/config` and inject it as a server-side render of an inline `<script>` tag in the page that actually needs it (only the partner-dashboard HTML).
- Apply an IP-based rate limit (e.g. 60 req/min) to `/api/config` to prevent abuse.

**Production impact:** **Medium.** Quota-abuse risk and small financial cost; not a credential leak on its own.

---

## Issue 15 — Medium: No global rate limiting on auth, payments, or search

**File / line:** absent — no `express-rate-limit` installed (verified via `package.json`).

**Why it is a problem:** The only rate limits in the codebase are:
- Admin login (per-IP, via Redis)
- Email OTP request (per-email, 60 s)
- Legacy `/api/send-otp` (in-process Map, per-phone)

There is **no rate limit on user login, user registration, password reset (if any), Razorpay webhook verification, OTP verification, public search endpoints, partner listing reads, or any other authenticated endpoint**. An attacker can:
- Brute-force user passwords at full speed (bcrypt slows things down but at 10 req/s a small wordlist completes in hours).
- Hammer `/api/buses/search` to enumerate the inventory and DOS the service.
- Mass-register accounts to send verification emails via your SMTP quota.

**Exact code fix:** Install `express-rate-limit` and apply middleware:
```js
import rateLimit from 'express-rate-limit';
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));      // 30 req / 15 min
app.use('/api/razorpay', rateLimit({ windowMs: 60_000, max: 20 }));          // 20 / min
app.use('/api/admin', rateLimit({ windowMs: 60_000, max: 120 }));            // admin still aggressive
app.use('/api/buses/search', rateLimit({ windowMs: 60_000, max: 60 }));
app.use('/api/hotels/search', rateLimit({ windowMs: 60_000, max: 60 }));
app.use('/api/cafes', rateLimit({ windowMs: 60_000, max: 60 }));
app.use('/api/cabs/search', rateLimit({ windowMs: 60_000, max: 60 }));
```

**Production impact:** **Medium-high.** Currently the only thing slowing a credential-stuffing attack on `/api/auth/login` is bcrypt cost factor 12.

---

## Issue 16 — Medium: `db.update` accepts arbitrary columns — mass-assignment risk

**File / line:** `utils/db.js` lines 175–199.

**Why it is a problem:** The `update` helper writes whatever the caller passes. Each controller is responsible for stripping sensitive fields. `collabController.updateProfile` strips `password`, `email`, `status`, `verification_status` (line 547–551) but **does not strip `id` or `userId`**. With the RLS posture of Issue 1, this doesn't matter much, but the moment you tighten RLS, a partner can change their own `id` to forge a record. Similarly, `collabService.updateCollaborator` does an `Object.assign(existing, updates)` (line 224) with no allow-list before writing to memory.

**Exact code fix:** Make `db.update` enforce an allow-list per table, the way `filterSupabaseColumns` does for collaborators:
```js
const TABLE_COLUMNS = { /* … */ };
export async function update(table, id, data) {
  const allow = TABLE_COLUMNS[table];
  if (!allow) throw new Error(`Refusing to update unknown table ${table}`);
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allow.includes(k)));
  // … existing logic with `clean` …
}
```

**Production impact:** **Medium.** Mostly latent behind Issue 1, but a defensive change worth shipping.

---

## Issue 17 — Medium: `verificationController.adminVerifyCollaborator` with `action: 'reject'` permanently deletes the row

**File / line:** `controllers/verificationController.js` lines 91–94.

```js
if (action === 'reject') {
  await collabService.deleteCollaborator(req.app.locals.db, collaboratorId);
  return res.json({ success: true, message: 'Collaborator rejected and deleted.' });
}
```

**Why it is a problem:** Admin clicks "reject" on a collaborator → the entire row is **hard-deleted**, including their PII, business name, Aadhaar reference. The audit log only logs `approve_service` and `reject_service` (line 230), not `delete_collaborator`. There's no soft-delete (`status: 'rejected'` with a `deletedAt`). If the admin clicks reject by mistake, the data is gone — and for compliance purposes (you operate in India with Aadhaar collection), you'd want to keep a record of rejected applicants for a defined period.

**Exact code fix:**
```js
if (action === 'reject') {
  await collabService.updateCollaborator(req.app.locals.db, collaboratorId, {
    status: 'rejected',
    verificationStatus: 'rejected',
    rejectedAt: new Date().toISOString(),
    rejectedBy: req.admin?.username || 'admin'
  });
  // Log the rejection (audit log is only on the success path today)
  return res.json({ success: true, message: 'Collaborator rejected.' });
}
```

**Production impact:** **Medium.** Data-integrity and compliance issue.

---

## Issue 18 — Medium: `app.js` hardcoded fallback `123456` mock OTP

**File / line:** `msg91-otp.js` lines 26–27 and 58–59.

```js
var fallbackOtp = prompt('MSG91 OTP script failed to load. For local testing, enter the mock OTP code (123456):');
if (fallbackOtp === '123456') { resolve('mock-otp-token'); }
```

**Why it is a problem:** If the MSG91 widget CDN is unreachable (network blip, ad-blocker, DNS issue) the user is **prompted for `123456` and the OTP verification succeeds with a string `'mock-otp-token'`**. There is no production check that this token actually came from MSG91 — `authController.verifyMsg91Token` just checks the return shape, not the token's provenance. So in a CDN outage, an attacker can type `123456` to verify any phone number. Worse: in normal use, if the widget ever fails silently and the prompt doesn't render, the success callback may still be triggered.

**Exact code fix:** Refuse to run the fallback in production:
```js
var fallbackOtp;
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  fallbackOtp = prompt('Local mock OTP (123456):');
  if (fallbackOtp === '123456') { resolve('mock-otp-token'); return; }
}
reject('MSG91 widget failed to load. Please try again later.');
```
And on the server, `verifyMsg91Token` should validate the token via MSG91's server-side verify API, not trust the client's claim.

**Production impact:** **Medium.** Becomes a backdoor in any MSG91 outage.

---

## Issue 19 — Medium: CORS policy permits all `192.168.*` origins

**File / line:** `server.js` line 163.

**Why it is a problem:** `origin.startsWith('http://192.168.')` is meant to allow local-network testing from a phone or another device on the same WiFi. In production on Render, this is moot (no one is on your Render private network), but the rule still accepts any origin claiming to be on a 192.168/16 subnet. Combined with the open `/api/config` and the unauthenticated `/api/buses/:busId/seats` (Issue 10), a 192.168.x.x page can scrape data.

**Exact code fix:**
```js
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (isDev && origin.startsWith('http://192.168.')) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  …
}));
```

**Production impact:** **Low-medium.**

---

## Issue 20 — Medium: `cors` middleware runs before the static deny-list, but `Access-Control-Allow-Origin` is still echoed for blocked origins

**File / line:** `server.js` line 163 vs. `server.js` lines 1249–1257.

**Why it is a problem:** The `cors` package is a permissive origin filter — it doesn't gate which routes are reachable. An attacker POSTing to `/api/admin/login` from a non-allowed origin still gets the CORS preflight pass *because the `Access-Control-Allow-Origin` header is set on the response*. If the attacker's script reads the response body (which only works if the origin is allowed), the response is empty — but the side effect (Redis counter increment, login attempt) still happened. This is a CSRF-style exposure for state-changing endpoints, and the only mitigation is the auth + JWT check, which doesn't help on `/api/send-otp` (Issue 21).

**Exact code fix:** Add an explicit CSRF/origin gate on state-changing endpoints:
```js
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();                         // allow server-to-server
  if (allowedOrigins.includes(origin)) return next();
  if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://192.168.')) return next();
  return res.status(403).json({ success: false, message: 'Origin not allowed' });
});
```

**Production impact:** **Medium.** Reduces the cross-site surface, even with CORS preflights.

---

## Issue 21 — Medium: `/api/send-otp` and `/api/verify-otp` are unauthenticated SMS endpoints

**File / line:** `server.js` lines 539 and 572.

**Why it is a problem:** Both endpoints are reachable without any auth. `/api/send-otp` will fire a real SMS to any Indian phone number, charging your MSG91 account. The rate limit is 3 per phone per 5 min, but with no rate limit per source IP, an attacker with 1M Indian phone numbers can send 3M SMS in 5 minutes, costing real money and damaging your sender-ID reputation with TRAI.

**Exact code fix:** Add a per-IP rate limit and a CAPTCHA step (or require the user to have a JWT before the OTP is meaningful):
```js
import rateLimit from 'express-rate-limit';
const otpIpLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.post('/api/send-otp', otpIpLimit, validate(validateSchemas.sendOtp), async (req, res) => { … });
```

**Production impact:** **Medium.** Direct cost amplification and SMS-flooding.

---

## Issue 22 — Low: `node-functions` admin password hashed with unsalted SHA-256

**File / line:** `node-functions/[[default]].js` lines 19, 95.

**Why it is a problem:** Even if you delete this file (Issue 6), the pattern of `crypto.createHash('sha256')` for password storage is a footgun. SHA-256 without a salt is fast to brute-force — a modern GPU can do ~10 GH/s of SHA-256, so any dictionary attack succeeds in seconds.

**Exact code fix:** Use bcrypt with cost ≥ 12 (the rest of the project does):
```js
import bcrypt from 'bcryptjs';
const ADMIN_PASS_HASH = await bcrypt.hash(ADMIN_PASSWORD, 12);
// At login:
const ok = await bcrypt.compare(password, ADMIN_PASS_HASH);
```

**Production impact:** **Low** (admin only, single account), but trivially fixed.

---

## Issue 23 — Low: Server admin password stored in `.env` with weak complexity

**File / line:** `.env` line 13 (local file, not committed).

**Why it is a problem:** The current local `.env` shows `ADMIN_PASSWORD=YatriPoint@123`. This is committed only locally but the **value matches the literal default that was hardcoded in `scratch/fix_server_final.py`** (Issue 13), so it's almost certainly the same password used in production. It is a 15-character password but it's a phrase-style password that would be in every common wordlist (YatriPoint is a publicly-known brand name).

**Exact code fix:** Rotate the admin password to a 24+ character random value generated by a password manager and store it only in the Render dashboard's env-var config (not in any committed file or scratch dir).

**Production impact:** **High** if this is the same password in production.

---

## Summary table

| #  | Sev      | File / area                              | Issue                                                              |
|----|----------|------------------------------------------|--------------------------------------------------------------------|
| 1  | Critical | supabase-schema.sql, migration-0003/4/5/8 | RLS disabled or fully permissive on every table                    |
| 2  | Critical | server.js:270                            | Razorpay HMAC falls back to empty key                              |
| 3  | Critical | authController.js:494                    | markPhoneVerified never validates the token                        |
| 4  | Critical | app.js:2745                              | Hardcoded Razorpay + Google OAuth keys as `/api/config` fallback   |
| 5  | High     | utils/redisClient.js:88                  | MockRedis silently used in production                              |
| 6  | High     | node-functions/[[default]].js            | Unauthenticated duplicate of booking/admin API                     |
| 7  | High     | services/seatService.js:191              | bookSeats not atomic — concurrent double-sell                      |
| 8  | High     | authController.js:494                    | (Same as #3, listed for visibility)                                |
| 9  | High     | applicationController.js:88              | PII enumeration via checkApplicationStatus                          |
| 10 | High     | server.js:913                            | Public seat-inventory endpoint                                     |
| 11 | High     | collabController.js:210                  | Dead-code loginWithOTP, future-account-takeover risk               |
| 12 | High     | collabController.js:446                  | Partner JWT issued on email/phone match only                       |
| 13 | Medium   | scratch/fix_server_final.py              | Committed file with hardcoded admin password and JWT secret        |
| 14 | Medium   | server.js:206                            | /api/config exposes MSG91 widget token publicly                    |
| 15 | Medium   | (absent)                                 | No global rate limiting on auth/payments/search                    |
| 16 | Medium   | utils/db.js:175                          | db.update accepts arbitrary columns (mass-assignment)              |
| 17 | Medium   | verificationController.js:91             | Reject action hard-deletes collaborator with no audit              |
| 18 | Medium   | msg91-otp.js:26,58                       | `123456` mock-OTP fallback in production                           |
| 19 | Medium   | server.js:163                            | CORS allows all 192.168.* in production                            |
| 20 | Medium   | server.js:163                            | CORS doesn't gate state-changing endpoints (CSRF surface)          |
| 21 | Medium   | server.js:539                            | Unauthenticated /api/send-otp can drain MSG91 quota                |
| 22 | Low      | node-functions/[[default]].js:19         | Admin password stored as unsalted SHA-256                          |
| 23 | Low      | .env:13 (local)                          | Admin password matches a value already in a committed file         |

## Recommended immediate action (next 24 h)

1. **Rotate `JWT_SECRET`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_SECRET`, `MSG91_AUTH_KEY`** — assume they are all compromised because the admin password and JWT secret are present in `scratch/fix_server_final.py` (Issue 13) and that file is in git history since day one.
2. **Add the startup check for `RAZORPAY_KEY_SECRET`** (Issue 2).
3. **Fix `markPhoneVerified`** (Issue 3) — it's a one-file change and prevents the only path that an attacker can use to claim another phone.
4. **Drop `msg91TokenAuth` from `/api/config`** and add a per-IP rate limit on the route (Issue 14).
5. **Remove `scratch/` from the repo** (Issue 13).

## Recommended this-week action

6. **Re-design RLS** (Issue 1) — this is the largest single change but by far the most important. Hire a Supabase consultant if needed; the current posture would not pass a SOC-2 or CERT-In review.
7. **Tighten `selectCollaboratorRole`** (Issue 12) to require a server-verified `userId` match.
8. **Add global rate limiting** (Issue 15) — small change, big payoff.
9. **Delete or mirror-auth the `node-functions/[[default]].js` Cloudflare function** (Issue 6).
10. **Add atomic seat-booking** (Issue 7).
