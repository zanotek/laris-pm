# LARIS project dashboard

A client-side tracker for the LARIS project (Land Administration and Registration Information System) for the Ministry of Lands and Housing Development, Zanzibar. It tracks:

- **Deliverables & reviews**: stage, days with the client, invoice link and letter-of-acceptance status
- **Open issues & risks**: severity, owner, next step; filter by who must act
- **Invoices**: countersignature and payment status
- **Field operations & equipment**: blocked / in progress / planned / to confirm / done
- **Meetings & milestones**: upcoming and recent

It's a static site (plain HTML, CSS and JavaScript) with no build step and no server code.

## Publish on GitHub Pages

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then branch `main`, folder `/ (root)`.
3. The dashboard appears at `https://zanotek.github.io/laris-pm/`.

> Pages on a **public** repo is visible to anyone with the link. If the repo goes back to private, Pages needs a paid GitHub plan, and on Enterprise you can restrict the site to repo members.

## View locally

Browsers block `fetch()` from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Add `?asof=2026-11-20` to the URL to compute "days with client" against a fixed date instead of today.

## Updating the data

Everything lives in `/data`. Edit the JSON and commit; the page loads it fresh on each visit.

| File | One entry per | Key fields |
|---|---|---|
| `project.json` | the project | `as_of` (date the data was last checked), `components`, `people` |
| `deliverables.json` | deliverable | `no`, `component`, `title`, `delivered`, `revised`, `stage`, `invoice`, `contractual_acceptance_claimed`, `letter_of_acceptance`, `note` |
| `issues.json` | issue / risk | `id`, `title`, `area`, `component`, `severity`, `owner`, `side`, `status`, `raised`, `detail`, `next_step` |
| `invoices.json` | invoice | `ref`, `component`, `deliverables`, `first_sent`, `amount`, `currency`, `status`, `paid`, `note` |
| `fieldops.json` | activity | `component`, `activity`, `location`, `start`, `end`, `status`, `note` |
| `meetings.json` | meeting / milestone | `date` (`null` = to schedule), `time`, `title`, `body`, `location`, `note` |

Allowed values:

- `deliverables.stage`: `awaiting_review` · `revised` · `comments_sent` · `accepted`
- `issues.severity`: `high` · `medium` · `low`
- `issues.side`: `client` (shows in "Waiting on the client side") · `consultant`
- `issues.status`: `open` · `closed` (closed issues are hidden)
- `invoices.status`: `awaiting_countersignature` · `countersigned` · `not_yet_invoiced` · `paid`
- `fieldops.status`: `blocked` · `in_progress` · `planned` · `check` · `done`

Dates are `YYYY-MM-DD`. Use `null` for unknown values.

"Days with client" counts calendar days since the latest submission (`revised`, otherwise `delivered`) for items at `awaiting_review` or `revised`. It turns red after 14 days, roughly the 10 working days IGN FI cites before treating a deliverable as invoiceable.

## Data sources

The first data load (20 Nov 2026) came from LARIS email correspondence and the IGN FI Deliverables Log of 5 Oct 2026. The six high-severity design issues come from the Inception Report review (`LARIS_IR01_vs_TechnicalOffer_Comments.xlsx`). Invoice amounts weren't in the emails and are left blank.
