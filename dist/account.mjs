import { SUPABASE_URL, SUPABASE_KEY } from './config.mjs';

// Accounts and workspace storage through Supabase. vendor/supabase.js defines window.supabase.
// PKCE keeps sign-in results in the query string (?code=...), clear of the app's #/ routes.
export function createAccount() {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
    auth = client.auth,
    returnTo = () => location.origin + location.pathname;
  return {
    async session() {
      const { data } = await auth.getSession();
      return data.session;
    },
    onChange(fn) {
      return auth.onAuthStateChange((event, session) => setTimeout(() => fn(event, session))).data
        .subscription;
    },
    // Which sign-in providers are switched on in the Supabase dashboard.
    async providers() {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_KEY },
        });
        return (await res.json()).external || {};
      } catch {
        return {};
      }
    },
    signUp(name, email, password) {
      return auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: returnTo() },
      });
    },
    signIn(email, password) {
      return auth.signInWithPassword({ email, password });
    },
    signInWith(provider) {
      return auth.signInWithOAuth({ provider, options: { redirectTo: returnTo() } });
    },
    resendConfirmation(email) {
      return auth.resend({ type: 'signup', email, options: { emailRedirectTo: returnTo() } });
    },
    sendPasswordReset(email) {
      return auth.resetPasswordForEmail(email, { redirectTo: returnTo() });
    },
    setPassword(password) {
      return auth.updateUser({ password });
    },
    signOut() {
      return auth.signOut({ scope: 'local' });
    },
    async load() {
      const { data, error } = await client.from('workspaces').select('data, version').maybeSingle();
      if (error) throw error;
      return data && { version: Number(data.version), data: data.data };
    },
    async save(version, data) {
      const { data: next, error } = await client.rpc('save_workspace', {
        expected_version: version,
        new_data: data,
      });
      if (error) throw error;
      return Number(next);
    },
    // Calls onChange(version) when this person's workspace is saved from another device.
    watch(userId, onChange) {
      const channel = client
        .channel('workspace-' + userId)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'workspaces', filter: `user_id=eq.${userId}` },
          (payload) =>
            onChange(payload.new?.version === undefined ? undefined : Number(payload.new.version)),
        )
        .subscribe();
      return () => client.removeChannel(channel);
    },
  };
}
