const authService = require('../services/authService');
const persistence = require('../mock/persistence');
const settingsService = require('../services/settingsService');
const images = require('../services/imageService');
const { sanitizeUser } = require('../models/userModel');

const IP_DENIED = 'IP address is not allowed to log in';

async function assertIpAllowed(req, res) {
  if (await settingsService.isRequestIpAllowed(req)) return true;
  res.status(403).json({ error: IP_DENIED });
  return false;
}

async function register(req, res) {
  try {
    const { email, password, username, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    if (!(await assertIpAllowed(req, res))) return;
    const user = await authService.registerUser({ email, password, username, role });
    return res.status(201).json({ user });
  } catch (err) {
    if (err.message === 'User already exists') return res.status(409).json({ error: err.message });
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    if (!(await assertIpAllowed(req, res))) return;
    const out = await authService.authenticateUser({ email, password });
    return res.json(out);
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
}

function avatar(req, res) {
  try {
    const id = req.user && req.user.sub;
    const user = persistence.data.users.find((row) => String(row.id) === String(id));
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const saved = images.saveBuffer(images.decodeUpload(req.body?.data), req.body?.filename || 'avatar.png');
    user.avatarUrl = saved.url;
    persistence.save();
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('Avatar upload error:', err);
    return res.status(status).json({ error: err.message || 'Could not save that image.' });
  }
}

function me(req, res) {
  const id = req.user && req.user.sub;
  const user = persistence.data.users.find((u) => String(u.id) === String(id));
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({ user: sanitizeUser(user) });
}

module.exports = { register, login, me, avatar };
