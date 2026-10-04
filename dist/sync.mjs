// Saves the workspace to the account in the background, one request at a time.
// A save names the version it was based on; the server refuses it if another device saved
// since then (save_workspace in supabase/schema.sql returns -1). Nothing is overwritten
// silently: the conflict handler receives both versions and the person chooses.
//
// save(version, data) -> new version or -1; load() -> { version, data } or null.
export function createSync({
  save,
  load,
  onStatus = () => {},
  onConflict = () => {},
  onRemote = () => {},
  delay = 800,
  retryDelay = 5000,
  timers = globalThis,
}) {
  let version = 0,
    pending = null,
    saving = false,
    timer = null;
  function schedule(ms) {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      flush();
    }, ms);
  }
  async function flush() {
    if (saving || pending === null) return;
    saving = true;
    const data = pending;
    pending = null;
    onStatus('saving');
    try {
      const next = await save(version, data);
      if (next === -1) {
        // Changes queued during this save were based on the same outdated copy.
        const mine = pending ?? data;
        pending = null;
        const latest = await load();
        version = latest ? latest.version : 0;
        onConflict(latest, mine);
      } else {
        version = next;
        if (pending === null) onStatus('saved');
      }
    } catch (err) {
      if (pending === null) pending = data;
      onStatus('offline', err);
      saving = false;
      schedule(retryDelay);
      return;
    }
    saving = false;
    if (pending !== null) await flush();
  }
  return {
    get version() {
      return version;
    },
    setVersion(v) {
      version = v;
    },
    idle() {
      return !saving && pending === null;
    },
    queue(data) {
      pending = data;
      onStatus('pending');
      schedule(delay);
    },
    flushNow() {
      timers.clearTimeout(timer);
      timer = null;
      return flush();
    },
    // Another device saved. Load its version only when nothing here is waiting to be saved;
    // otherwise the next save detects the conflict and both versions are offered.
    async remoteChanged(remoteVersion) {
      if (remoteVersion !== undefined && remoteVersion <= version) return false;
      if (!this.idle()) return false;
      const latest = await load();
      if (!latest || latest.version <= version || !this.idle()) return false;
      version = latest.version;
      onRemote(latest);
      return true;
    },
  };
}
