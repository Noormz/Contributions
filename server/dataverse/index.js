// Starts the Dynamics connection: change hooks (always, when DATAVERSE_URL is set) and the
// background loops (only when the app registration secret is configured).
import { installHooks, pushPending, pullChanges, status, state } from './sync.js';
import { processActionRequests } from './actions.js';
import { enabled } from './client.js';

const hooked = installHooks();

function loop(name, ms, fn) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { state.lastError = `${name}: ${e.message || e}`; console.error(`[dataverse:${name}]`, e.message || e); } finally { busy = false; }
  };
  setTimeout(tick, 1000);
  return setInterval(tick, ms);
}

export function startDataverse() {
  if (!enabled()) {
    if (hooked) console.log('[dataverse] DATAVERSE_URL is set but the app credentials are missing — changes are queued and will be sent once DATAVERSE_CLIENT_SECRET is configured.');
    return false;
  }
  state.running = true;
  loop('push', Number(process.env.DATAVERSE_PUSH_MS || 3000), async () => { let r; do { r = await pushPending(); } while (r.done === r.tried && r.tried === 100); });
  loop('actions', Number(process.env.DATAVERSE_ACTIONS_MS || 5000), processActionRequests);
  loop('pull', Number(process.env.DATAVERSE_PULL_MS || 30000), pullChanges);
  console.log('[dataverse] connected — syncing with', process.env.DATAVERSE_URL);
  return true;
}

export { status as dataverseStatus };
