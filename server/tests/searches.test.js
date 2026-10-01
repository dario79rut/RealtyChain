const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const app = require('../app');

let server;
let base;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function register() {
  const email = `search-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = 'pass1234';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, username: 'Search User' },
  });
  assert.equal(registered.status, 201);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200);
  return login.data.token;
}

test('saved searches require auth', async () => {
  const res = await request('/api/searches');
  assert.equal(res.status, 401);
});

test('save, list, reopen criteria, and delete a property search', async () => {
  const token = await register();
  const empty = await request('/api/searches', { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.searches, []);

  const blank = await request('/api/searches', {
    method: 'POST',
    token,
    body: { query: '   ', filters: { status: 'all', location: 'all', rooms: 'all', wcs: 'all' } },
  });
  assert.equal(blank.status, 400);

  const created = await request('/api/searches', {
    method: 'POST',
    token,
    body: {
      name: 'Miami villas',
      query: 'Beach',
      filters: {
        status: 'Available',
        minPrice: '100000',
        maxPrice: '2000000',
        location: 'Miami',
        rooms: '3',
        wcs: '2',
      },
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.search.name, 'Miami villas');
  assert.equal(created.data.search.query, 'Beach');
  assert.equal(created.data.search.filters.rooms, '3');
  assert.equal(created.data.searches.length, 1);

  const duplicate = await request('/api/searches', {
    method: 'POST',
    token,
    body: {
      query: 'beach',
      filters: {
        status: 'Available',
        minPrice: '100000',
        maxPrice: '2000000',
        location: 'Miami',
        rooms: '3',
        wcs: '2',
      },
    },
  });
  assert.equal(duplicate.status, 409);

  const invalid = await request('/api/searches', {
    method: 'POST',
    token,
    body: { query: 'Austin', filters: { status: 'Pending', rooms: '9' } },
  });
  assert.equal(invalid.status, 400);

  const listed = await request('/api/searches', { token });
  assert.equal(listed.data.searches.length, 1);
  const id = listed.data.searches[0].id;

  const other = await register();
  const hidden = await request('/api/searches', { token: other });
  assert.deepEqual(hidden.data.searches, []);
  const denied = await request(`/api/searches/${id}`, { method: 'DELETE', token: other });
  assert.equal(denied.status, 404);

  const removed = await request(`/api/searches/${id}`, { method: 'DELETE', token });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.data.searches, []);
});

test('an account can save at most 5 filters', async () => {
  const token = await register();
  for (let i = 1; i <= 5; i += 1) {
    const saved = await request('/api/searches', {
      method: 'POST',
      token,
      body: { query: `city-${i}`, filters: { status: 'Available', rooms: '1', wcs: 'all', location: 'all' } },
    });
    assert.equal(saved.status, 201);
  }
  const sixth = await request('/api/searches', {
    method: 'POST',
    token,
    body: { query: 'city-6', filters: { status: 'Available' } },
  });
  assert.equal(sixth.status, 400);
  assert.match(sixth.data.error, /5/);
  const listed = await request('/api/searches', { token });
  assert.equal(listed.data.searches.length, 5);
});
