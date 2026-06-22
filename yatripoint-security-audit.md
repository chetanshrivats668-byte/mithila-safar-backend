# YatriPoint Website Security & Functionality Audit Report

**Website:** https://yatripoint.onrender.com  
**Audit Date:** 22 June 2026  
**Auditor:** Automated Security Scan

---

## 1. Executive Summary

| Category | Status | Issues |
|----------|--------|--------|
| **Data Exposure** | CRITICAL | 1 critical issue - API keys exposed |
| **Security Headers** | MODERATE | 4 important headers missing |
| **Authentication** | GOOD | Proper JWT token protection |
| **HTTPS / SSL** | GOOD | Valid SSL certificate |
| **Functionality** | NEEDS ATTENTION | No data in search results |
| **XSS Protection** | MODERATE | Multiple innerHTML usages |

**Overall Verdict:** The website has a **critical security vulnerability** that must be fixed immediately. Additionally, several moderate issues and missing functionality should be addressed before going live with real users and payments.

---

## 2. Critical Issues (Fix Immediately)

### 2.1 EXPOSED API KEYS & SECRETS [CRITICAL]

**Endpoint:** `GET https://yatripoint.onrender.com/api/config`  
**Severity:** CRITICAL

The `/api/config` endpoint returns all third-party API keys and credentials in plain JSON. Anyone on the internet can access this endpoint and extract your secrets.

**Exposed Data Found:**
```json
{
  "firebaseApiKey": "AIzaSyCaoWw48ujQVw5Fv2-Y_BLeT-5glR9xFoc",
  "authDomain": "bookn-488115.firebaseapp.com",
  "projectId": "bookn-488115",
  "storageBucket": "bookn-488115.firebasestorage.app",
  "messagingSenderId": "494833578713",
  "appId": "1:494833578713:web:c499d65fa36ce85e0b44c8",
  "razorpayKeyId": "rzp_live_T1o1ij8PUD5fcF",
  "googleClientId": "494833578713-r3tbr8e1bquphe3r84pbdeba5no7tqmj.apps.googleusercontent.com",
  "msg91WidgetId": "366668686d37313131303336",
  "msg91TokenAuth": "504876TuixWdLhznmm6a26849cP1"
}
```

**Impact:**
- **Razorpay LIVE Key** (`rzp_live_T1o1ij8PUD5fcF`) - Attackers can create fake payment orders, flood your dashboard, or potentially abuse your payment account. This is a LIVE production key, meaning real money could be at risk.
- **Firebase API Key** - Attackers can read/write to your Firebase database if rules are misconfigured, send push notifications, or exhaust your Firebase quota leading to unexpected bills.
- **Google Client ID** - Can be used for unauthorized OAuth flows, though less directly harmful.
- **MSG91 Credentials** - Attackers can send SMS using your account, depleting credits and potentially sending spam/phishing messages from your identity.

**Remediation:**
1. **NEVER expose API keys in a public endpoint.** Remove `/api/config` entirely.
2. For Razorpay: The `key_id` should only be used client-side for the Razorpay checkout widget. The `key_secret` must NEVER leave the server. But even the `key_id` should not be exposed unnecessarily.
3. For Firebase: Use Firebase Auth rules to restrict access, but the API key itself should ideally be restricted by domain/referrer in the Firebase Console.
4. For Google Sign-In: The `client_id` is safe to expose (it's required client-side), but restrict it to your domain in Google Cloud Console.
5. For MSG91: The `widgetId` and `tokenAuth` should NEVER be exposed publicly. These must remain server-side only.
6. **Immediate action:** Rotate ALL these credentials immediately after fixing the endpoint, as they may have already been scraped by bots.

---

## 3. Moderate Issues (Fix Soon)

### 3.1 Missing Security Headers

The following important security headers are **missing** from HTTP responses:

| Header | Status | Risk |
|--------|--------|------|
| `Strict-Transport-Security` (HSTS) | MISSING | Users can be downgraded to HTTP via MITM attacks |
| `Content-Security-Policy` (CSP) | MISSING | Increased XSS risk from injected scripts |
| `Referrer-Policy` | MISSING | User browsing data may leak to third parties |
| `Permissions-Policy` | MISSING | Unrestricted browser feature access (camera, geolocation, etc.) |

**Good Headers Present:**
- `X-Content-Type-Options: nosniff` - Prevents MIME-type sniffing attacks
- `X-Frame-Options: DENY` - Prevents clickjacking attacks
- `X-XSS-Protection: 1; mode=block` - Legacy XSS protection (deprecated but still helpful)
- `Cache-Control: no-cache, no-store, must-revalidate` - Proper caching for dynamic content

**Remediation:**
Add these headers in your Express server (or Render configuration):

```javascript
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://checkout.razorpay.com https://www.googletagmanager.com https://verify.msg91.com https://verify.phone91.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://nominatim.openstreetmap.org; frame-src https://checkout.razorpay.com;");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.removeHeader('X-Powered-By'); // Remove Express fingerprint
  next();
});
```

### 3.2 Server Information Leakage

**Issue:** The `X-Powered-By: Express` header reveals that the backend is built with Express.js. This helps attackers target known Express vulnerabilities.

**Remediation:**
```javascript
app.disable('x-powered-by');
```

### 3.3 Potential XSS Vulnerabilities

**Issue:** The JavaScript code (`app.js`) uses `innerHTML` extensively with dynamic content, including user-provided data. While many usages appear to use static template data, any user input that is not properly sanitized before being inserted via `innerHTML` creates an XSS vulnerability.

**Examples of concern:**
- Bus operator names, hotel names, and user-generated content are rendered via `innerHTML`
- If any of these fields are stored in the database without sanitization, an attacker could inject malicious JavaScript

**Remediation:**
1. Use `textContent` instead of `innerHTML` wherever possible
2. If `innerHTML` is necessary, sanitize all user input before inserting it using a library like DOMPurify:
   ```javascript
   import DOMPurify from 'dompurify';
   element.innerHTML = DOMPurify.sanitize(userInput);
   ```
3. Escape all dynamic content in HTML templates

### 3.4 Authentication Tokens in localStorage

**Issue:** JWT `authToken`, `refreshToken`, and `currentUser` data are stored in `localStorage`. If an XSS vulnerability exists, attackers can easily steal these tokens.

**Remediation:**
- Consider using `HttpOnly` cookies for the refresh token (most secure)
- For the access token, localStorage is acceptable only if XSS is properly mitigated
- Implement short token expiry times
- Add CSRF protection if switching to cookies

---

## 4. Good Security Practices Found

| Practice | Status | Notes |
|----------|--------|-------|
| HTTPS enforced | PASS | Valid SSL certificate, Cloudflare protection |
| Frame protection | PASS | `X-Frame-Options: DENY` prevents clickjacking |
| MIME sniffing protection | PASS | `X-Content-Type-Options: nosniff` |
| Auth endpoint protection | PASS | `/api/auth/me`, `/api/razorpay/create-order` require valid tokens |
| Server-side payment order creation | PASS | Razorpay orders are created server-side, not client-side |
| Cache control | PASS | Proper no-cache headers for dynamic content |
| Input validation | PASS | Phone numbers are normalized and validated |
| Password min length | PASS | Minimum 6 characters enforced |

---

## 5. Functionality Issues

### 5.1 Empty Search Results

All search endpoints currently return empty arrays, suggesting the database is not populated:

| Endpoint | Result | Status |
|----------|--------|--------|
| `POST /api/buses/search` | `{"success":true,"buses":[]}` | No data |
| `POST /api/hotels/search` | `{"success":true,"hotels":[]}` | No data |
| `GET /api/cafes` | `{"success":true,"cafes":[]}` | No data |

**Recommendation:** Populate the database with sample data before launch, or add a "Coming Soon" message if the service is not yet available in those cities.

### 5.2 Google Sign-In Configuration

The `GOOGLE_CLIENT_ID` is loaded dynamically from `/api/config`. Since the config endpoint is publicly exposed, this works functionally but is architecturally wrong. The Google Client ID should be embedded directly in the frontend or loaded via a secure, authenticated endpoint.

### 5.3 PWA & Offline Support

**Status:** Good
- Service worker properly caches static assets
- Network-first strategy for API calls (correct - prevents stale data)
- Manifest.json is properly configured
- App icons and theme colors are set

### 5.4 SEO Implementation

**Status:** Excellent
- Proper meta descriptions and keywords
- Open Graph tags for social sharing
- Twitter Card tags
- JSON-LD structured data for TravelAgency
- Canonical URLs
- Preconnect hints for Google Fonts

---

## 6. Recommended Priority Action Plan

### IMMEDIATE (Do Today)
1. **Rotate ALL API keys** - Razorpay, Firebase, MSG91, Google OAuth
2. **Remove `/api/config` endpoint** - Never expose secrets publicly
3. **Restrict Razorpay key** to your domain in Razorpay Dashboard
4. **Restrict Firebase API key** by HTTP referrer in Firebase Console

### THIS WEEK
5. Add missing security headers (HSTS, CSP, Referrer-Policy, Permissions-Policy)
6. Remove `X-Powered-By: Express` header
7. Add `HttpOnly` cookie option for refresh tokens
8. Implement input sanitization for all user-generated content
9. Populate database with sample data for search endpoints

### BEFORE FULL LAUNCH
10. Conduct a full XSS audit with DOMPurify integration
11. Implement rate limiting on all API endpoints
12. Add CSRF protection
13. Set up Content Security Policy reporting (`report-uri`)
14. Add security monitoring and alert for suspicious API usage

---

## 7. Overall Assessment

| Area | Score | Notes |
|------|-------|-------|
| HTTPS / Encryption | 8/10 | Valid SSL, missing HSTS |
| Authentication | 7/10 | Good JWT, tokens in localStorage |
| API Security | 3/10 | CRITICAL: Exposed keys, no rate limiting visible |
| XSS Prevention | 5/10 | Multiple innerHTML uses, no CSP |
| Data Protection | 6/10 | Proper auth checks, but tokens vulnerable to XSS |
| Functionality | 6/10 | Good UI/UX, empty search results |
| SEO | 9/10 | Excellent meta tags and structured data |
| PWA | 8/10 | Good service worker and caching |

**Overall Security Score: 4/10** - The critical API key exposure makes this site currently unsafe for production use, especially with real payment processing enabled.

---

*Report generated by automated security analysis. Manual penetration testing is recommended for production readiness.*
