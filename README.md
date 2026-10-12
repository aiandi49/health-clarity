# Health Clarity

A free, plain-language health guide. People describe a condition or attach a photo or PDF of a medical page (a visit summary, lab result or procedure report). The engine on the home page explains it, asks one question at a time, puts emergency warning signs first, and ends with questions for their doctor and a next step. The guide at `/guide` is the reference it reasons over.

It is general health information, not medical advice, and it says so.

## 1. Put it on GitHub with GitHub Desktop

1. Unzip `health-clarity.zip`. You get a folder called `health-clarity` that is already a Git repository (branch `main`, no commits yet).
2. Open GitHub Desktop and choose **File → Add local repository…**, then select the `health-clarity` folder. It opens straight away; there is no "create a repository" step.
3. In the bottom-left box, type the summary `Initial commit` and click **Commit to main**.
4. Click **Publish repository**. Keep **Keep this code private** ticked, then click **Publish repository**.
5. On GitHub, open the repository's **Settings → Code security** and turn on **Secret scanning** and **Push protection**.

## 2. Deploy on Vercel

1. In Vercel, click **Add New… → Project**, import `health-clarity` and click **Deploy**. No build settings are needed.
2. Create a dedicated API key in the Claude Console, inside a workspace made just for this project, with a monthly spend limit and spend alerts. Document reading uses more tokens than chat, so set the limit with that in mind.
3. In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` for **Production**. Use a separate low-limit key for Preview, or none.
4. Optional: add `ANTHROPIC_MODEL` (the default is `claude-sonnet-5-5`) and `SITE_ORIGINS` (comma-separated) if the site uses more than one domain.
5. Redeploy: **Deployments → ⋯ → Redeploy**.
6. Add two Firewall rate-limit rules, each with a fixed window of 600 seconds, keyed by IP address, with action Too Many Requests (429):
   - path `/api/chat`, 20 requests
   - path `/api/document`, 6 requests

   These numbers match the limiters in the code. Check Vercel's documentation for which plans include custom rate-limit rules.

Until `ANTHROPIC_API_KEY` is set and the project is redeployed, the chat and the document reader show a plain "not set up yet" message.

The chat uses Claude's web search tool for current facts, such as recalls or new treatment approvals. If web search is turned off for your organization in the Claude Console, turn it on there.

## What's in the repo

| Path | What it is |
| --- | --- |
| `index.html`, `assets/css/engine.css`, `assets/js/engine.js` | The health engine (home page) |
| `guide/index.html`, `assets/css/guide.css`, `assets/js/guide.js` | The guide at `/guide` |
| `assets/js/prefs.js` | Text-size selector and theme toggle |
| `data/gub.json` | Guide content. The guide page renders it, and `/api/chat` picks the most relevant entries for each conversation |
| `api/chat.js` | The conversation |
| `api/document.js` | Reads one uploaded image or PDF into plain-language notes |
| `api/_shared.js` | Shared protections: method, JSON, origin, size, rate limits, upstream call |
| `vercel.json` | Security headers, clean URLs, function settings |

## How document upload works

1. The person attaches a JPG, PNG, WebP or PDF, up to three per conversation.
2. Photos are shrunk in the browser (longest side 2,000 pixels, re-saved as JPEG) before upload. PDFs must be under 3 MB.
3. `/api/document` sends the file to Anthropic's API, which returns plain-language notes: what the document is, diagnoses, medications as written, flagged results, follow-ups and warning signs. The reader is told to leave out Social Security, insurance, account and phone numbers and street addresses.
4. Only those notes, capped at 6,000 characters, come back to the browser. The file itself is not stored or logged anywhere by this site.
5. The notes stay in the browser tab and are sent with later chat messages, so the conversation can refer to them.

**Note on request size.** Every other function keeps the standing 32 KB request limit. `/api/document` allows up to 4 MB, because a page photo cannot fit in 32 KB; Vercel's own platform limit is 4.5 MB. To make up for that, it accepts only those four file types, checks that the data is valid base64, has its own tighter rate limit (6 per 10 minutes) and returns only text.

**Privacy.** The site does not store uploads. However, the file is processed by Anthropic's API, and this site is not a HIPAA-covered service. The page says so next to the chat and tells people to cover ID numbers first. If you ever offer this to clinics or under a business agreement, that needs a proper HIPAA review and agreements first.

## What works, and what would need a bigger build

Works now:
- A safety-first conversation that asks one question at a time and ends with a "Next step".
- Reading uploaded medical pages into notes.
- Ranked next steps in the side cards.
- Voice input in supported browsers.
- A plain-text download of the notes and conversation.
- Text size and theme settings.
- The guide.

Not included:
- Saved history across visits, accounts, or connecting to patient portals.
- Messaging doctors or booking appointments.
- Personalized meal plans with targets; it points people to a dietitian.
- Any storage of medical data.

## Security

- The API key lives only in Vercel environment variables (and a git-ignored `.env.local`). The browser only calls `/api/chat` and `/api/document`.
- Both functions:
  - accept only POST requests with a JSON body
  - reject other websites with a 403 (this blocks other websites, not scripts, so the rate limits and spend cap still matter)
  - rate-limit each visitor
  - stop waiting for Anthropic after 110 seconds (the function limit is 120)
  - set `max_tokens` to 16000 and the model and prompt on the server
  - log status codes only
- `/api/chat` keeps the 32 KB request limit, caps messages and document notes, and forwards only user and assistant turns.
- Everything shown on the page uses `textContent`. There are no third-party scripts beyond Google Fonts. `vercel.json` sends a strict Content-Security-Policy and the standard security headers, and allows the microphone only for this site.
- If a key is ever exposed, revoke it in the Claude Console and create a new one. Deleting it is not enough.

## Local development

There are no dependencies. With the Vercel CLI installed, put `ANTHROPIC_API_KEY=...` in `.env.local`, then run:

```
vercel dev
```

## Notes

The guide was checked against public medical and government sources in October 2026. Review `data/gub.json` every few months, because treatments, recalls and rules change.
