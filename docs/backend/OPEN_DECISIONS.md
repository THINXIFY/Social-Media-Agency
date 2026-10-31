# SociVanta — Open Decisions (owner approval needed)

Each decision lists the recommendation and the phase it blocks. Items marked **before coding** block 5A or 5B.

| ID | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D1 | Hosting and managed Postgres | (a) One platform running web, worker and Postgres (Render, Railway or Fly); (b) Vercel for web plus a separate worker host plus Neon or Supabase | (a), for one bill, a long-running worker and simple networking. Choose a region close to customers and processors | **5A, before coding** |
| D2 | Which services may legally and commercially be sold, and where | Per-service review | Start with a small set that passes platform-policy, supplier, processor and legal review. Everything else stays non-purchasable | 5E launch |
| D3 | Payment processors | Crypto processor, card PSP, bank transfer (manual), PayPal | Obtain **written** acceptance for this business category before integrating. Start with one crypto processor plus manual bank transfer if card acceptance is uncertain | 5D |
| D4 | Transactional email provider | Postmark, Resend, Amazon SES | Postmark or Resend for deliverability and simplicity; needs a verified sending domain. **5B ships both transports behind one interface**; pick one and set `EMAIL_TRANSPORT`, `EMAIL_FROM` and `EMAIL_API_KEY` before any public deploy | Before production |
| D5 (open; code defaults to deferred — see PHASE_5E_REPORT) | Revenue recognition | (a) Revenue when the order is paid; (b) revenue when the order completes (deferred until then) | (b) is more accurate. Analytics would show "order payments" and "recognized revenue" separately. Today's UI uses (a) | 5E |
| D6 | Referral reward destination | Separate rewards balance (current UI default) or wallet credit | Rewards balance with manual approval at launch; wallet credit later via the same idempotent ledger posting | 5G |
| D7 | Public order ID format | `SV-…` (customer demo) or `ORD-…` (admin demo) | One format everywhere, for example `SV-` plus a sequence | 5E |
| D8 | ORM | Drizzle or Prisma | **Decided in 5A: Drizzle** (the brief named Drizzle) | Resolved |
| D9 | Auth implementation | Better Auth, Auth.js, or custom following the Next.js guide | **Decided in 5B:** the Next.js database-session pattern with argon2id, otpauth and Node crypto. Better Auth was reviewed and rejected because it stores backup codes and session tokens in recoverable form (see AUTHENTICATION.md §1) | Resolved |
| D10 | Which settings live in the database versus code | Accounting currency, enabled languages and deposit limits are in code today | Keep currency and languages in code; move deposit limits and review thresholds to database settings with audit | 5H |
| D11 | Version control baseline | Still not a Git repo after 5A; all 5A work is uncommitted files | `git init`, private remote, tag `frontend-v1.0`, branch per phase | **Before coding** |
| D12 | Fulfilment suppliers | Which providers, contracts and APIs | Start with manual fulfilment (5E); integrate one vetted API provider in 5F | 5F |
| D13 | File storage | Cloudflare R2, S3, or none at launch | R2 or S3, private bucket; or launch support without attachments | 5G |
| D14 | Brand and domain | The name "SociVanta" is provisional; no domain configured (the footer shows `support@[your-domain]`) | Settle before email (D4) and processors (D3), which require a domain | 5B |
| D15 | Legal entity, jurisdiction, tax/VAT, privacy policy and data retention | — | Needed before taking real payments; affects processors and GDPR-style obligations | 5D/5I |
| D16 | Customer two-factor authentication | Optional or required for high balances | Optional, prompted when the balance exceeds a threshold | 5B |

## Assumptions made in these documents

- A single region and a single accounting currency (USD). Other currencies stay display-only, as `DEMO_FX` states today.
- Small team, so a modular monolith suffices; reconsider only if measured load or team size demands it.
- The demo datasets are not real customers and will not be migrated to production; they become seed data for development and preview only.
