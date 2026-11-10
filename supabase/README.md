# Shared top-three leaderboard

The game remains a static GitHub Pages website. Supabase Postgres stores submitted names and scores across devices and browser resets. Scores remain until the project owner deletes them; keep your project active and maintain backups for long-term retention. The leaderboard lists the three highest runs, with earlier submissions winning ties. A player may have more than one entry.

## Connect the testing version

1. Open your Supabase project `kicnjdwtvmafnhyaycoh` and choose **SQL Editor → New query**.
2. Paste the complete contents of [`leaderboard.sql`](leaderboard.sql) and click **Run** as the project owner. The transaction creates the table, index, and two RPC functions and restricts client privileges. It can be rerun without deleting scores.
3. The development branch already contains your Project URL and public publishable key in `LEADERBOARD_CONFIG` in `index.html`. No private credentials or database passwords are needed by the website.
4. When you choose to test the hosted preview, copy the development branch's updated `index.html` to the separate preview repository. This change has not deployed either website. Leave the original live game's main branch and Pages configuration unchanged until approved.
5. Complete a run with at least one point, enter a name, and submit. Open the preview in another browser/device and confirm it shows the same leaderboard after reloading. Every device reads the same database; no login or local storage is required for the shared scores.

To check the SQL installation without adding a test score, run this in SQL Editor:

```sql
set role anon;
select * from public.get_top_scores();
reset role;
```

It should return zero to three rows, ordered by descending score. Direct access to `public.high_scores` is intentionally denied to browser roles. No RLS policies granting direct access are needed: the narrowly scoped `security definer` functions perform reads and inserts with the owner's privileges and a fixed empty search path.
Without configuration, the game still plays, but score submission is disabled and the board states that it is not connected. Network/storage failures do not stop gameplay. Submission retries use the same run UUID to avoid duplicate rows after an ambiguous connection failure.

## Access and limitations

Anonymous clients can call only the top-three read and validated score-submission functions; table access is revoked, RLS is enabled, and clients receive no update/delete access. Names render as text, not HTML. The database validates names and score ranges.

This casual leaderboard trusts scores reported by the browser. A determined person can forge submissions or spam names; public keys cannot prevent this. Competitive score verification, moderation, and rate limiting require a server-side game/session validation service. Do not describe these scores as cheat-proof. Do not enter sensitive personal information as a player name.


## Local browser tests

With Node, Playwright, and Chromium installed:

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/game.cjs
CHROMIUM_PATH=/usr/bin/chromium node tests/leaderboard.cjs
```

Browser tests simulate Supabase responses to test behavior without adding fake entries to the real leaderboard. They do not establish that your remote SQL has been installed. The publishable key deliberately cannot create tables, execute arbitrary SQL, or delete scores; run the supplied schema in SQL Editor rather than sharing privileged credentials.

For database security tests, install `@electric-sql/pglite` in a temporary directory and run:

```sh
npm install --prefix /tmp/flappy-sql-tests --cache /tmp/flappy-npm-cache --no-audit --no-fund @electric-sql/pglite
NODE_PATH=/tmp/flappy-sql-tests/node_modules node tests/leaderboard-sql.cjs
```

This executes the schema in an isolated local PostgreSQL instance, checks score ordering and duplicate-run handling, and verifies that anonymous/authenticated roles cannot directly read or modify the table. It never connects to your real Supabase database or adds test scores there.
