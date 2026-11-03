// These are classification hints, not paths to probe or proof of authentication.
export function authKind(value, signals = {}, text = '') {
  let url;
  try { url = new URL(value); } catch { return null; }
  let route = url.pathname.toLowerCase();
  try { route = decodeURIComponent(route); } catch { /* A literal percent sign is not a classification failure. */ }
  const hint = `${signals.title || ''} ${(signals.headings || []).join(' ')} ${text}`;
  if (signals.consentRoute) return 'consent';
  if (/(?:^|\/)(?:signup|sign-up|register|registration|registreren)(?:\/|$)/.test(route)) return 'signup';
  if (/(?:^|\/)(?:login|log-in|signin|sign-in|inloggen|aanmelden|connexion)(?:\/|$)/.test(route) ||
      /^(?:login|signin|auth)\./i.test(url.hostname)) return 'login';
  if (signals.passwordFields && /\b(?:sign\s*in|log\s*in|inloggen|aanmelden)\b/i.test(hint)) return 'login';
  if (signals.passwordFields && /\b(?:sign\s*up|register|create\s+(?:an?\s+)?account)\b/i.test(hint)) return 'signup';
  return null;
}

export class AuthGate {
  constructor(scope, policy = 'stop') {
    if (!['stop', 'record'].includes(policy)) throw new Error('Auth policy must be stop or record');
    this.scope = scope;
    this.policy = policy;
    this.requirements = new Map();
    this.navigationUrls = new Set();
  }

  require({ kind = 'login', pageUrl, loginUrl = null, protectedUrl = null, reason, evidence = [] }) {
    const key = JSON.stringify([kind, loginUrl || protectedUrl || pageUrl]);
    const allowed = loginUrl ? this.scope.allows(loginUrl, 'page') : null;
    if (loginUrl && allowed) this.navigationUrls.add(loginUrl);
    if (this.requirements.has(key)) {
      const existing = this.requirements.get(key);
      existing.protectedUrl ||= protectedUrl;
      existing.protectedUrls = [...new Set([...existing.protectedUrls, ...[protectedUrl].filter(Boolean)])];
      for (const item of evidence) if (!existing.evidence.some(e => JSON.stringify(e) === JSON.stringify(item))) existing.evidence.push(item);
      return;
    }
    this.requirements.set(key, {
      kind, pageUrl, loginUrl, protectedUrl, protectedUrls: [protectedUrl].filter(Boolean), reason, evidence, loginInScope: allowed,
      action: allowed === false
        ? 'Login destination is outside scope. The collector cannot visit it. Use an authorized session for the in-scope application only; do not add an excluded provider.'
        : kind === 'consent'
          ? 'Complete the normal consent choice in an approved browser session, then provide a local saved storage-state file.'
          : kind === 'signup'
            ? 'Use your existing authorized account, or register a test account yourself if the program permits it, then provide a local saved storage-state file. The collector will not register an account.'
          : 'Sign in with your own authorized account in a browser and provide a local saved storage-state file. Do not paste a password, session cookie or token into chat.'
    });
  }

  page(record, signals) {
    if (record.status !== 200) return;
    const kind = authKind(record.finalUrl || record.url, signals);
    if (kind) this.require({ kind, pageUrl: record.url, loginUrl: record.finalUrl || record.url,
      reason: `${kind}-page`, evidence: [{ type: 'page-signals', passwordFields: signals.passwordFields || 0,
        title: signals.title || '', consentRoute: !!signals.consentRoute }] });
  }

  challenge(url, pageUrl, status, hasChallenge = false) {
    if (status !== 401 && !(status === 403 && hasChallenge)) return;
    this.require({ pageUrl, protectedUrl: url, reason: `http-${status}-authentication`,
      evidence: [{ type: 'http-status', status, authenticationChallenge: hasChallenge }] });
  }

  redirect(from, to) {
    const kind = authKind(to);
    if (!kind || kind === 'consent') return;
    this.require({ kind, pageUrl: from, loginUrl: to, protectedUrl: from,
      reason: 'redirect-to-authentication', evidence: [{ type: 'redirect', from, to }] });
  }

  get required() { return this.requirements.size > 0; }
  get paused() { return this.policy === 'stop' && this.required; }
  describe() { return { required: this.required, paused: this.paused, policy: this.policy, requirements: [...this.requirements.values()] }; }
}
