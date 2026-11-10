# Shared top-three leaderboard

The game remains a static GitHub Pages website. Supabase Postgres stores submitted names and scores across devices and browser resets. Scores remain until the project owner deletes them; keep your project active and maintain backups for long-term retention. The leaderboard lists the three highest runs, with earlier submissions winning ties. A player may have more than one entry.

## Connect the testing version

1. Create a Supabase project.
2. Run `leaderboard.sql` from this directory in its SQL Editor.
3. In the project's Connect/API settings, copy the Project URL and **publishable key** (or legacy **anon** key).
4. Set `LEADERBOARD_CONFIG.projectUrl` and `LEADERBOARD_CONFIG.publishableKey` in `index.html`. These settings are public browser configuration. Never put a secret key, database password, or `service_role` key in this file.
5. Deploy the updated `index.html` only to the separate preview repository. Leave the original live game's main branch and Pages configuration unchanged until approved.
6. Complete a run with at least one point, enter a name, and submit. Open the preview in another browser/device and confirm it shows the same leaderboard after reloading.

Without configuration, the game still plays, but score submission is disabled and the board states that it is not connected. Network/storage failures do not stop gameplay. Submission retries use the same run UUID to avoid duplicate rows after an ambiguous connection failure.

## Access and limitations

Anonymous clients can call only the top-three read and validated score-submission functions; table access is revoked, RLS is enabled, and clients receive no update/delete access. Names render as text, not HTML. The database validates names and score ranges.

This casual leaderboard trusts scores reported by the browser. A determined person can forge submissions or spam names; public keys cannot prevent this. Competitive score verification, moderation, and rate limiting require a server-side game/session validation service. Do not describe these scores as cheat-proof. Do not enter sensitive personal information as a player name.
