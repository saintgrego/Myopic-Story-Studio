require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const { toMyoEnvelope, fromMyoEnvelope } = require('./myoFormat');
const { parsePromptToScene } = require('./parser');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Overridable so the route tests can point at a temp dir. The user's real scenes/
// and storyboard.json are working-tree data (see CLAUDE.md) — a test must never
// write into them. Unset in normal use, which keeps the paths exactly as before.
const SCENES_DIR = process.env.MYOPIC_SCENES_DIR || path.join(__dirname, '..', 'scenes');
fs.mkdirSync(SCENES_DIR, { recursive: true });

const STORYBOARD_PATH =
  process.env.MYOPIC_STORYBOARD_PATH || path.join(__dirname, '..', 'storyboard.json');

const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.myo$/;

app.post('/api/parse', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt (string) is required' });
  }
  try {
    const result = await parsePromptToScene(prompt);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/scenes', (req, res) => {
  const { scene } = req.body || {};
  if (!scene || !scene.sceneId) {
    return res.status(400).json({ error: 'scene (with sceneId) is required' });
  }
  const filename = `${scene.sceneId}.myo`;
  // The sceneId becomes a path segment, so it gets the same guard the read route
  // applies to :filename — otherwise a sceneId of "../../etc" escapes SCENES_DIR.
  // Parser-issued ids are randomUUID(), which always passes.
  if (!SAFE_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'invalid sceneId' });
  }
  const filePath = path.join(SCENES_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(toMyoEnvelope(scene), null, 2), 'utf-8');
  res.json({ filename });
});

app.get('/api/scenes', (req, res) => {
  const files = fs.readdirSync(SCENES_DIR).filter((f) => f.endsWith('.myo'));
  const scenes = [];
  for (const filename of files) {
    // scenes/ is user data in the working tree and hand-editable, so one corrupt
    // file skips itself rather than throwing the whole listing away.
    try {
      const envelope = JSON.parse(fs.readFileSync(path.join(SCENES_DIR, filename), 'utf-8'));
      scenes.push({
        filename,
        sceneId: envelope.scene_id,
        title: envelope.title,
        created: envelope.created,
      });
    } catch {
      // Unreadable or malformed — leave it out of the list.
    }
  }
  res.json({ scenes });
});

app.get('/api/scenes/:filename', (req, res) => {
  const { filename } = req.params;
  if (!SAFE_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  const filePath = path.join(SCENES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'not found' });
  }
  const envelope = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  res.json({ scene: fromMyoEnvelope(envelope) });
});

app.get('/api/storyboard', (req, res) => {
  if (!fs.existsSync(STORYBOARD_PATH)) {
    return res.json({ frames: [] });
  }
  res.json(JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf-8')));
});

app.put('/api/storyboard', (req, res) => {
  const { frames } = req.body || {};
  if (!Array.isArray(frames)) {
    return res.status(400).json({ error: 'frames (array) is required' });
  }
  fs.writeFileSync(STORYBOARD_PATH, JSON.stringify({ frames }, null, 2), 'utf-8');
  res.json({ ok: true });
});

// The CRA proxy is hardcoded to :4000, and dev tooling injects PORT for the
// frontend — so the backend uses its own variable to avoid stealing that port.
const PORT = process.env.MYOPIC_SERVER_PORT || 4000;

// Only bind a port when run as a program (`npm run server`). Requiring this module —
// which the route tests do, driving `app` through supertest — must not open a socket.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Myopic backend listening on :${PORT}`));
}

module.exports = { app };
