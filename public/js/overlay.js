// The overlay in OBS: /overlay/<id>
import { mount } from './render.js';

const id = location.pathname.split('/')[2] ?? '';
const root = document.getElementById('overlay');
const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
let view = null;
let modes = [];

async function load() {
  const [overlay, live, session, setup] = await Promise.all([get(`/api/overlays/${id}`), get('/api/state'), get('/api/session'), get('/api/modes')]);
  modes = setup;
  if (view) view.setOverlay(overlay);
  else view = mount(root, overlay, { live, session, modes });
}

// If the server is not running yet when OBS starts, keep trying
while (!(await load().then(() => true, () => false))) await new Promise((r) => setTimeout(r, 3000));

const events = new EventSource('/api/events');
events.addEventListener('state', (e) => view.update({ live: JSON.parse(e.data) }));
events.addEventListener('session', (e) => view.update({ session: JSON.parse(e.data) }));
events.addEventListener('feed', (e) => view.feed(JSON.parse(e.data)));
events.addEventListener('overlay', (e) => { const o = JSON.parse(e.data); if (o.id === id) view.setOverlay(o); });
// After a server restart (an update, say) reload, so OBS does not keep running the old code
let connected = false;
events.addEventListener('open', () => { if (connected) location.reload(); connected = true; });
