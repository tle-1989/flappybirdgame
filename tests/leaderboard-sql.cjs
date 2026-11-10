// Requires @electric-sql/pglite; runs real PostgreSQL locally without a remote project.
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    const schema = fs.readFileSync(path.resolve(__dirname, '../supabase/leaderboard.sql'), 'utf8');
    await db.exec(schema);
    await db.exec(schema); // Rerunning setup must preserve data and permissions.
    await db.exec('set role anon');
    assert.deepEqual((await db.query('select * from public.get_top_scores()')).rows, []);
    const submit = (id, name, score) => db.query('select public.submit_score($1::uuid, $2::text, $3::integer)', [id, name, score]);
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await submit(id(1), ' First ', 5);
    await submit(id(2), 'Winner', 9);
    await submit(id(3), 'Second', 7);
    await submit(id(4), 'Later tie', 5);
    await submit(id(1), 'Overwrite attempt', 100);
    assert.deepEqual((await db.query('select * from public.get_top_scores()')).rows, [
      { player_name: 'Winner', score: 9 }, { player_name: 'Second', score: 7 }, { player_name: 'First', score: 5 }
    ]);
    for (const [name, score] of [['', 1], ['   ', 1], ['x'.repeat(25), 1], ['Valid', 0], ['Valid', -1], ['Valid', 1000001], [null, 1], ['Valid', null]]) {
      await assert.rejects(submit(id(5), name, score), /Invalid score submission/);
    }
    await assert.rejects(submit(null, 'Valid', 1), /Invalid score submission/);
    await assert.rejects(db.query('select * from public.high_scores'), /permission denied/);
    await assert.rejects(db.query('delete from public.high_scores'), /permission denied/);
    await assert.rejects(db.query("insert into public.high_scores(run_id, player_name, score) values ($1, 'Bad', 99)", [id(6)]), /permission denied/);
    await db.exec('reset role; set role authenticated');
    assert.equal((await db.query('select * from public.get_top_scores()')).rows.length, 3);
    await assert.rejects(db.query("update public.high_scores set score = 99"), /permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as count from public.high_scores')).rows[0].count, 4);
    await db.exec(schema);
    assert.equal((await db.query('select count(*)::int as count from public.high_scores')).rows[0].count, 4);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.high_scores'::regclass")).rows[0].relrowsecurity, true);
    console.log('PASS: PostgreSQL schema reruns, persistence, top three/tie ordering, trimmed names, duplicate-run protection, invalid submissions, RLS enabled, anonymous/authenticated RPC access, and denied direct table reads/writes.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
