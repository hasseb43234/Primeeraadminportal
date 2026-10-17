# Prime Era — admin portal

Private dashboard for the call bookings made on the Prime Era website.
Sign in, see every booking, search and filter, change status (new / confirmed / done / cancelled / no-show),
add private notes, call / WhatsApp / email the visitor, add the call to a calendar, export CSV, delete.

This is a separate Vercel project from the public website. The two share one database:
the website **writes** bookings, this portal **reads and manages** them.

## Files
| Path | What it is |
| --- | --- |
| `index.html` | The portal screen (sign-in + dashboard) |
| `api/admin/login.js` | Sign in / sign out (signed HttpOnly cookie, 12 h) |
| `api/admin/bookings.js` | List, update and delete bookings (admin only) |
| `api/_lib/` | Storage (Redis), sign-in and helper code |
| `tools/dev-server.mjs` | Run the portal on your own computer |

## Deploy on Vercel (about 5 minutes)
1. Vercel → **Add New → Project** → import this repository. No framework, no build command — leave everything default.
2. **Use the same Redis database as the public website** (this is what lets the portal see its bookings):
   Project → **Storage** → connect the *same* Upstash Redis store you connected to the website project.
   (Or copy the website project's `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` + `KV_REST_API_TOKEN`, into this project's environment variables.)
3. Project → **Settings → Environment Variables**:

   | Name | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | a long password you choose (8+ characters; 12+ recommended) |
   | `SESSION_SECRET` | *(optional)* any long random text |

4. **Redeploy**, open the project's URL, and sign in.

## Safety
- No password is stored in this repository — it lives only in Vercel's environment variables.
- 8 wrong passwords lock sign-in for 15 minutes; sessions expire after 12 hours.
- All changes require a custom header plus a same-site cookie, so other websites cannot trigger them.
- The page is marked `noindex` and blocked in `robots.txt`.

## Run locally
```
ADMIN_PASSWORD=choose-a-long-password node tools/dev-server.mjs
```
Open http://127.0.0.1:5181/ — local test data is kept in `.data/store.json` (git-ignored).
On Windows PowerShell: `$env:ADMIN_PASSWORD="choose-a-long-password"; node tools/dev-server.mjs`
