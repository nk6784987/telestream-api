# TeleStream API v2 — Auto-Indexing

Telegram pe video upload karo → Bot khud sab handle karega. Koi caption nahi likhna, koi TMDB ID dhundhna nahi.

---

## Ek Baar Setup (15 minutes)

### Step 1 — Telegram Bot banao

1. Telegram pe **@BotFather** ko open karo
2. `/newbot` bhejo
3. Naam do (kuch bhi): `MyStreamBot`
4. Username do (kuch bhi, `_bot` se khatam): `mystream123_bot`
5. Jo **Token** aaye — copy karke rakho

---

### Step 2 — TMDB API Key lo (FREE)

1. **themoviedb.org** pe jaao → Sign Up (free)
2. Login karo → Top-right pe apna avatar click karo
3. **Settings** → **API** → **Request an API Key**
4. **Developer** select karo
5. Form mein kuch bhi bharo (Application URL: `http://localhost`)
6. **API Key (v3 auth)** copy karo

---

### Step 3 — Apna Telegram User ID pata karo

1. Telegram pe **@userinfobot** ko `/start` bhejo
2. Jo number aaye — woh tera `ADMIN_USER_ID` hai

---

### Step 4 — GitHub pe upload karo

1. **github.com** → Login → **New repository**
2. Naam: `telestream-api` → **Create**
3. Ye saare files upload karo (drag & drop)
4. **Commit changes**

---

### Step 5 — Railway pe deploy karo

1. **railway.app** → Login (GitHub se)
2. **New Project** → **Deploy from GitHub repo**
3. `telestream-api` select karo
4. Deploy hone do (1-2 min)
5. Jab ho jaaye: **Settings** tab → **Domains** → **Generate Domain**
6. URL copy karo (example: `https://telestream-api-production.up.railway.app`)

---

### Step 6 — Variables set karo

Railway dashboard → apna project → **Variables** tab:

| Variable | Kya daalna hai |
|---|---|
| `BOT_TOKEN` | Step 1 ka token |
| `TMDB_API_KEY` | Step 2 ka key |
| `ADMIN_USER_ID` | Step 3 ka number |
| `BASE_URL` | Step 5 ka Railway URL |
| `WEBHOOK_SECRET` | Kuch bhi random likhо, jaise `secret123abc` |
| `DB_PATH` | Exactly yahi: `/app/data/db.sqlite` |

Variables save karo → Railway automatically redeploy karega.

---

### Step 7 — Webhook register karo (ek baar)

Browser mein yeh URL kholo:
```
https://TERA-RAILWAY-URL.up.railway.app/admin/register-webhook
```

Yeh aana chahiye:
```json
{ "success": true }
```

---

### Step 8 — Telegram Channel setup

1. Telegram mein naya **Channel** banao
2. Channel Settings → **Administrators** → apna bot add karo
3. Bot ko **"Post Messages"** permission do

---

## Ab kaise kaam karta hai

```
Tu channel mein video upload karta hai
           ↓
Bot tujhe private message mein puchega:
"Ye kya hai?"  [🎬 Movie] [📺 TV Show] [🎌 Anime]
           ↓
Tu tap karta hai (Movie)
           ↓
Bot khud filename se search karta hai TMDB pe
Results dikhata hai poster ke saath
           ↓
Tu sahi title tap karta hai
           ↓
Bot quality confirm karta hai
(filename se auto-detect: 1080p / 720p etc.)
           ↓
✅ Index ho gaya! Embed URL bhi deta hai
```

---

## Embed karna apni website pe

```html
<iframe
  src="https://TERA-URL.up.railway.app/embed/TMDB_ID?type=movie"
  width="100%"
  height="450"
  frameborder="0"
  allowfullscreen>
</iframe>
```

TV show ke liye:
```html
<iframe
  src="https://TERA-URL.up.railway.app/embed/TMDB_ID?type=tv&s=1&e=1"
  width="100%" height="450" frameborder="0" allowfullscreen>
</iframe>
```

---

## API Endpoints

| Endpoint | Kya karta hai |
|---|---|
| `GET /embed/:tmdb_id?type=movie` | Video player page |
| `GET /stream/:file_id` | Direct video stream |
| `GET /api/v1/movie/:tmdb_id` | Movie JSON info |
| `GET /api/v1/tv/:tmdb_id/season/1/episode/1` | TV episode JSON |
| `GET /api/v1/stats` | Total indexed count |
| `GET /admin/register-webhook` | Webhook register (ek baar) |
| `GET /admin/stats` | Server stats |

