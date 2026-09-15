const base = process.env.ANGIE_TEST_URL ?? 'http://localhost:3000';

const login = await fetch(`${base}/api/access`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'demo-participant' }),
});

if (!login.ok) throw new Error(`Participant login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Participant cookie was not returned.');

const response = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
if (!response.ok) throw new Error(`Session read failed: ${response.status}`);

const data = await response.json();
console.log(JSON.stringify({ session: data.session, answers: data.answers }, null, 2));
