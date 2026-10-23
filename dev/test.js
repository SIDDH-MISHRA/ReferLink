// Automated checks for supabase/schema.sql. Run: npm test
// Every call runs as the "anon" role, exactly like a browser on the live site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, rpc } from './db.js';

const db = await openDb(); // in-memory, fresh every run

const fails = async (promise, message) => {
  await assert.rejects(promise, (e) => {
    assert.equal(e.message, message);
    return true;
  });
};

// Run a query as the database owner (bypasses security) to inspect stored rows.
async function asOwner(sql, params) {
  await db.exec('reset role');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('set role anon'); }
}

const board = (over = {}) => rpc(db, 'create_board', {
  p_name: 'Priya Sharma', p_company: 'Google', p_linkedin_url: 'https://www.linkedin.com/in/priya-sharma', ...over,
});

let n = 0;
const request = (slug, over = {}) => rpc(db, 'submit_request', {
  p_slug: slug,
  p_name: 'Rahul Verma',
  p_email: `rahul${++n}@example.com`,
  p_linkedin_url: 'https://linkedin.com/in/rahul-verma',
  p_job_ref: 'https://careers.google.com/jobs/results/12345',
  p_resume_url: 'https://drive.google.com/file/d/abc/view',
  p_why_fit: 'Three years of backend work in Go, which this role needs.',
  p_consent: true,
  ...over,
});

test('browser cannot read tables directly', async () => {
  await assert.rejects(db.query('select * from public.boards'), /permission denied/);
  await assert.rejects(db.query('select * from public.requests'), /permission denied/);
  await assert.rejects(db.query('select private.new_token()'), /permission denied/);
});

test('create_board returns a readable slug and a long secret token', async () => {
  const b = await board();
  assert.match(b.slug, /^priya-sharma-google-[0-9a-f]{4}$/);
  assert.match(b.dashboard_token, /^[0-9a-f]{64}$/);
  const [row] = await asOwner('select dashboard_token_hash from public.boards where id = $1', [b.board_id]);
  assert.notEqual(row.dashboard_token_hash, b.dashboard_token, 'only the fingerprint is stored');
});

test('create_board rejects bad input and bots', async () => {
  await fails(board({ p_linkedin_url: 'https://example.com/priya' }), 'invalid:linkedin_url');
  await fails(board({ p_name: 'P' }), 'invalid:name');
  await fails(board({ p_note: 'x'.repeat(201) }), 'invalid:note');
  await fails(board({ p_website: 'http://spam.example' }), 'spam');
});

test('public board shows public info only', async () => {
  const b = await board({ p_refers_for: 'Backend, Data', p_note: 'Engineering only' });
  const pub = await rpc(db, 'get_public_board', { p_slug: b.slug.toUpperCase() });
  assert.equal(pub.name, 'Priya Sharma');
  assert.equal(pub.refers_for, 'Backend, Data');
  assert.equal(pub.dashboard_token_hash, undefined);
  await fails(rpc(db, 'get_public_board', { p_slug: 'nope' }), 'not_found');
});

test('submit_request validates every field', async () => {
  const { slug } = await board();
  await fails(request(slug, { p_email: 'not-an-email' }), 'invalid:email');
  await fails(request(slug, { p_linkedin_url: 'linkedin.com/in/x' }), 'invalid:linkedin_url');
  await fails(request(slug, { p_job_ref: 'SDE' }), 'invalid:job_ref');
  await fails(request(slug, { p_resume_url: 'my resume' }), 'invalid:resume_url');
  await fails(request(slug, { p_why_fit: 'pls refer' }), 'invalid:why_fit');
  await fails(request(slug, { p_why_fit: 'x'.repeat(301) }), 'invalid:why_fit');
  await fails(request(slug, { p_consent: false }), 'invalid:consent');
  await fails(request(slug, { p_website: 'x' }), 'spam');
  await fails(request('nope', {}), 'not_found');
  const ok = await request(slug, { p_job_ref: 'JR-104523' });
  assert.match(ok.status_token, /^[0-9a-f]{64}$/);
});

test('duplicate requests are blocked, but a declined one can be retried', async () => {
  const b = await board();
  const first = await request(b.slug, { p_email: 'Same@Example.com', p_job_ref: 'https://x.com/job/1/' });
  await fails(request(b.slug, { p_email: 'same@example.com', p_job_ref: 'https://X.com/job/1' }), 'duplicate');
  // Same person, different job: allowed
  await request(b.slug, { p_email: 'same@example.com', p_job_ref: 'https://x.com/job/2' });

  const dash = await rpc(db, 'get_dashboard', { p_token: b.dashboard_token });
  const req = dash.requests.find((r) => r.job_ref === 'https://x.com/job/1/');
  await rpc(db, 'decide_request', { p_token: b.dashboard_token, p_request_id: req.id, p_decision: 'declined', p_reason: 'resume_link' });
  const status = await rpc(db, 'get_request_status', { p_token: first.status_token });
  assert.equal(status.decline_reason, 'resume_link');
  await request(b.slug, { p_email: 'same@example.com', p_job_ref: 'https://x.com/job/1' }); // retry works
});

test('dashboard token only works for its own board', async () => {
  const a = await board();
  const b = await board({ p_name: 'Arjun Mehta' });
  await request(a.slug);
  const dashA = await rpc(db, 'get_dashboard', { p_token: a.dashboard_token });
  const dashB = await rpc(db, 'get_dashboard', { p_token: b.dashboard_token });
  assert.equal(dashA.requests.length, 1);
  assert.equal(dashB.requests.length, 0);
  await fails(rpc(db, 'get_dashboard', { p_token: 'wrong' }), 'not_found');
  await fails(rpc(db, 'decide_request', {
    p_token: b.dashboard_token, p_request_id: dashA.requests[0].id, p_decision: 'referred',
  }), 'not_found');
});

test('decisions: reason required for decline, first decision time is kept', async () => {
  const b = await board();
  const { status_token } = await request(b.slug);
  const [r] = (await rpc(db, 'get_dashboard', { p_token: b.dashboard_token })).requests;
  const args = { p_token: b.dashboard_token, p_request_id: r.id };

  await fails(rpc(db, 'decide_request', { ...args, p_decision: 'declined' }), 'invalid:reason');
  await fails(rpc(db, 'decide_request', { ...args, p_decision: 'maybe' }), 'invalid:decision');

  const first = await rpc(db, 'decide_request', { ...args, p_decision: 'declined', p_reason: 'experience' });
  assert.equal(first.is_first_decision, true);
  const second = await rpc(db, 'decide_request', { ...args, p_decision: 'referred' });
  assert.equal(second.is_first_decision, false);
  assert.equal(second.decided_at, first.decided_at);
  assert.equal(second.decline_reason, null);

  const s = await rpc(db, 'get_request_status', { p_token: status_token });
  assert.equal(s.status, 'referred');
  assert.equal(s.employee_name, 'Priya Sharma');
  assert.equal(s.candidate_email, undefined, 'status page does not expose email');
});

test('delete wipes personal data but keeps an anonymous row for metrics', async () => {
  const b = await board();
  const { status_token } = await request(b.slug);
  assert.deepEqual(await rpc(db, 'delete_request', { p_token: status_token }), { deleted: true });
  await fails(rpc(db, 'get_request_status', { p_token: status_token }), 'not_found');
  await fails(rpc(db, 'delete_request', { p_token: status_token }), 'not_found');
  assert.equal((await rpc(db, 'get_dashboard', { p_token: b.dashboard_token })).requests.length, 0);

  const [row] = await asOwner('select * from public.requests where board_id = $1', [b.board_id]);
  assert.equal(row.candidate_name, null);
  assert.equal(row.candidate_email, null);
  assert.equal(row.why_fit, null);
  assert.equal(row.status_token_hash, null);
  assert.ok(row.deleted_at);
  assert.equal(row.status, 'pending');
});

test('max 20 requests per board per hour', async () => {
  const b = await board();
  for (let i = 0; i < 20; i++) await request(b.slug);
  await fails(request(b.slug), 'rate_limited');
});

test('max 50 new boards per hour across the site', async () => {
  const [{ count }] = await asOwner('select count(*)::int as count from public.boards');
  for (let i = count; i < 50; i++) await board();
  await fails(board(), 'rate_limited');
});
