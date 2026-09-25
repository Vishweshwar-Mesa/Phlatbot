# Phlatmatch

Flat-search helper for Riya, Meera and Kavita. It captures each person's constraints up front, filters
listings deterministically, and structures a blind vote reveal. **It never picks a flat.**

- **App** (Next.js on Vercel): each person has a private link `/p/<token>` with Home, Constraints,
  Shortlist and History tabs. It can be installed to the phone's home screen.
- **Telegram (@Phlatbot)**: only for listings. Forward or paste a listing, answer questions about anything
  it doesn't mention, then confirm Yes/Edit.
- **Supabase**: all data, service role only (RLS on with no policies). Schema is in `supabase/migrations`.
- **Gemini (`gemini-3.8-flash`)**: only three narrow jobs: extracting listing fields, writing the narrative
  from already-computed verdicts, and classifying whether a custom factor is housing-relevant.

## Decisions (agreed with the owner)

| Topic | Decision |
|---|---|
| Max rent | Each person's **share**; compared against `monthly_rent / 3` |
| Unmentioned soft factor | Counts as 0 and is shown as "no data" (distinct from an explicit "no") |
| Missing hard-constraint fields | The bot asks the submitter about all of them in **one message**; the reply is parsed deterministically |
| No-go fuzzy match | Word overlap (3+ letters) or near-spelling is flagged; the person confirms it **in the app** |
| Shortlist | Top 3 for voting; other qualifying listings shown below as "also qualified" |
| Preference edit after assessment | Unpublished assessments are re-scored immediately |
| Digest before all 3 are onboarded | Notify with who's missing; nothing is matched |
| Empty day | Notify "no new listings today" with an honest empty page |
| Telegram scope | Listings and their questions only; everything else is in the app |
| Linking Telegram | "Connect Telegram" button in the app opens `t.me/Phlatbot?start=<code>` |
| Digest alert | Web push notification from the installed app (no Telegram group ping) |
| Look | Pastel light theme plus a dark mode (follows the phone, with a toggle) |

## Development

```
npm install
cp .env.example .env.local   # fill in
npm run dev
npm test
```

Work happens on `dev` (Vercel preview). `main` is production and is only updated at release.
