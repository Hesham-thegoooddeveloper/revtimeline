// Public screens: the landing page and the account screens (sign in, create account,
// confirm email, password reset). Rendered into #site-main; forms are handled in app.mjs.
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// The landing page's example: a drawing approval with one branch, drawn like the app draws it.
const EXAMPLE = `<svg class="example-svg" viewBox="0 0 980 140" role="img" aria-label="Example timeline of a drawing approval: submitted, a customer request for an additional breaker branches off and merges back into revision B, then follow-up and approval are still to do.">
<path class="ln" d="M30 46 H687"/><path class="ln plan" d="M687 46 H950"/>
<path class="ln" d="M139.5 46 C172 46, 172 98, 205 98 H361 C426 98, 426 46, 490 46"/>
<line class="today" x1="687" x2="687" y1="4" y2="124"/><text class="today-t" x="687" y="137" text-anchor="middle">TODAY</text>
<circle class="st f" cx="30" cy="46" r="6"/><circle class="st f" cx="139.5" cy="46" r="6"/><circle class="st f" cx="402.6" cy="46" r="6"/><circle class="st f" cx="577.4" cy="46" r="6"/><circle class="st a" cx="840.5" cy="46" r="6"/><circle class="st a" cx="950" cy="46" r="6"/>
<circle class="st f" cx="227" cy="98" r="6"/><circle class="st f" cx="336.4" cy="98" r="6"/>
<text x="24" y="16">Started</text><text class="d" x="24" y="30">03 SEP</text>
<text x="139.5" y="16" text-anchor="middle">Submitted</text><text class="d" x="139.5" y="30" text-anchor="middle">08 SEP</text>
<text x="402.6" y="16" text-anchor="middle">Comments in</text><text class="d" x="402.6" y="30" text-anchor="middle">20 SEP</text>
<text x="577.4" y="16" text-anchor="middle">Rev B sent</text><text class="d" x="577.4" y="30" text-anchor="middle">28 SEP</text>
<text x="840.5" y="16" text-anchor="middle">Follow up</text><text class="d" x="840.5" y="30" text-anchor="middle">10 OCT</text>
<text x="956" y="16" text-anchor="end">Approval</text><text class="d" x="956" y="30" text-anchor="end">15 OCT</text>
<text x="227" y="122" text-anchor="middle">Breaker added</text><text class="d" x="227" y="136" text-anchor="middle">12 SEP</text>
<text x="336.4" y="122" text-anchor="middle">Feasibility OK</text><text class="d" x="336.4" y="136" text-anchor="middle">17 SEP</text>
</svg>`;

const GLYPHS = {
  record:
    '<path class="g-ln" d="M2 11h30"/><circle class="g-f" cx="8" cy="11" r="4"/><circle class="g-a" cx="25" cy="11" r="4"/>',
  branch:
    '<path class="g-ln" d="M2 6h30M8 6c5 0 5 11 10 11h4c4 0 5-11 9-11"/><circle class="g-f" cx="18" cy="17" r="3.4"/>',
  dates:
    '<path class="g-ln" d="M2 11h30"/><circle class="g-a" cx="12" cy="11" r="4" style="stroke-dasharray:2 2"/><circle class="g-a" cx="24" cy="11" r="4"/>',
  money:
    '<rect x="2" y="3" width="30" height="16" class="g-box"/><path class="g-ln" d="M2 11h30M14 3v16"/>',
};
const feature = (glyph, title, text) =>
  `<div><svg class="glyph" viewBox="0 0 34 22" aria-hidden="true">${GLYPHS[glyph]}</svg><h3>${title}</h3><p>${text}</p></div>`;

function landing(ctx) {
  return `<section class="hero">
  <div>
    <span class="label">Task history for project managers</span>
    <h1>Every task has a history. See all of it.</h1>
  </div>
  <div>
    <p class="lede">Record submissions, customer comments, revisions and approvals on one timeline per task. Branches show parallel work, and every date change is measured against the original plan.</p>
    <div class="cta">
      <a class="button primary lg" href="#/sign-up">Start free</a>
      <button class="button lg" data-action="guest">${ctx.guestData ? 'Open the projects in this browser' : 'Try it without an account'}</button>
    </div>
    <p class="fine">Free while in preview. Sign in with ${ctx.providerNames.length ? ctx.providerNames.join(', ') + ' or email' : 'email'}.</p>
  </div>
</section>
<section class="stage" aria-label="Example">
  <div class="example gridded">
    <div class="example-head"><b>Technical drawings</b><span class="label">Example · Project Alpha · 33/132 kV</span></div>
    ${EXAMPLE}
    <div class="example-foot">
      <p>A customer request for an additional breaker branched off on 12 Sep and merged back into revision B. The late review moved the next follow-up by two days, and the original date is kept.</p>
      <div class="pop">
        <span class="label" style="color:var(--accent)">Action</span>
        <strong>Follow up on drawing approval</strong>
        <div class="row">Due <b>10 Oct 2026</b></div>
        <div class="row">Original due <b>08 Oct 2026</b></div>
        <div class="row"><span class="shift">Moved +2 days</span><span>by late review</span></div>
      </div>
    </div>
  </div>
</section>
<section class="features" id="features" aria-label="Features">
  ${feature('record', 'Record what happened', 'Log submissions, comments and approvals as recorded events, and the work still to do as actions.')}
  ${feature('branch', 'Follow parallel work', 'Branch a task when a side request appears, then merge it back once it is resolved.')}
  ${feature('dates', 'Trust the dates', 'Actions keep their original due date. When dates move, upcoming actions shift and you see by how much.')}
  ${feature('money', 'See the commercial picture', 'PO value, VAT and payment terms sit beside the history they belong to.')}
</section>
<section class="flow" id="how" aria-labelledby="how-title">
  <h2 id="how-title">A drawing approval, as RevTimeline records it</h2>
  <div class="steps">
    <div><span class="dt">08 SEP</span><b>Submitted to customer</b><span>Recorded event on the main line</span></div>
    <div><span class="dt">20 SEP</span><b>Comments received</b><span>A breaker request opens a branch</span></div>
    <div><span class="dt">28 SEP</span><b>Revision B submitted</b><span>The branch merges back into the main line</span></div>
    <div><span class="dt">15 OCT</span><b>Final approval</b><span>Action with due and original dates</span></div>
  </div>
</section>
<footer class="site-foot">
  <span>RevTimeline · Every revision, every approval, in order.</span>
  <span>Free while in preview</span>
</footer>`;
}

function sso(ctx) {
  const buttons = [];
  if (ctx.providers.google)
    buttons.push(
      '<button type="button" class="button sso" data-provider="google"><span class="ic g" aria-hidden="true"></span>Continue with Google</button>',
    );
  if (ctx.providers.linkedin_oidc)
    buttons.push(
      '<button type="button" class="button sso" data-provider="linkedin_oidc"><span class="ic li" aria-hidden="true">in</span>Continue with LinkedIn</button>',
    );
  return buttons.length
    ? `<div class="sso-list">${buttons.join('')}</div><div class="or">or use your email</div>`
    : '';
}
const messages = (ctx) =>
  `<p class="form-note" id="form-note" role="status"${ctx.note ? '' : ' hidden'}>${esc(ctx.note)}</p>` +
  `<p class="form-error" id="form-error" role="alert"${ctx.error ? '' : ' hidden'}>${esc(ctx.error)}</p>`;
const side = `<aside class="auth-side gridded">
  <h2>Rebuild any task history in seconds.</h2>
  <ul>
    <li><span><b>One line per task.</b> Every submission, comment and approval in order.</span></li>
    <li><span><b>Branches and merges.</b> Side requests stay attached to the task they came from.</span></li>
    <li><span><b>The same projects on every device.</b> Sign in on your laptop or phone and pick up where you left off.</span></li>
  </ul>
</aside>`;
const authPage = (form) => `<div class="auth">${form}${side}</div>`;

const SCREENS = {
  landing,
  'sign-in': (ctx) =>
    authPage(`<form class="auth-form" data-form="sign-in">
  <h1>Sign in</h1>
  <p class="sub">Pick up where your projects left off.</p>
  ${sso(ctx)}
  <label>Email<input type="email" name="email" autocomplete="email" required value="${esc(ctx.email)}" /></label>
  <label>Password<input type="password" name="password" autocomplete="current-password" required /></label>
  <div class="auth-row"><a href="#/forgot">Forgot password?</a></div>
  ${messages(ctx)}
  <button type="button" class="button small" data-action="resend" hidden>Send the confirmation email again</button>
  <button class="button primary wide">Sign in</button>
  <p class="auth-foot">New to RevTimeline? <a href="#/sign-up">Create an account</a></p>
</form>`),
  'sign-up': (ctx) =>
    authPage(`<form class="auth-form" data-form="sign-up">
  <h1>Create your account</h1>
  <p class="sub">Free while in preview. Your projects sync across your devices.</p>
  ${sso(ctx)}
  <label>Name<input name="name" autocomplete="name" maxlength="80" dir="auto" /></label>
  <label>Email<input type="email" name="email" autocomplete="email" required value="${esc(ctx.email)}" /></label>
  <label>Password<input type="password" name="password" autocomplete="new-password" required minlength="8" /><small>At least 8 characters.</small></label>
  ${messages(ctx)}
  <button class="button primary wide">Create account</button>
  <p class="auth-foot">Already have an account? <a href="#/sign-in">Sign in</a></p>
</form>`),
  'check-email': (ctx) =>
    `<div class="confirm gridded"><div class="confirm-card">
  <span class="env" aria-hidden="true"></span>
  <h1>Check your inbox</h1>
  <p>We sent a confirmation link to <b>${esc(ctx.email || 'your email address')}</b>. Open it to activate your account. If it doesn't arrive in a few minutes, check your spam folder.</p>
  ${messages(ctx)}
  <div class="acts"><button class="button primary" data-action="resend">Send it again</button><a class="button" href="#/sign-up">Use a different email</a></div>
  <small>Already confirmed? <a href="#/sign-in">Sign in</a></small>
</div></div>`,
  forgot: (ctx) =>
    authPage(`<form class="auth-form" data-form="forgot">
  <h1>Reset your password</h1>
  <p class="sub">Enter your account's email and we'll send you a link to choose a new password.</p>
  <label>Email<input type="email" name="email" autocomplete="email" required value="${esc(ctx.email)}" /></label>
  ${messages(ctx)}
  <button class="button primary wide">Send reset link</button>
  <p class="auth-foot"><a href="#/sign-in">Back to sign in</a></p>
</form>`),
  'new-password': (ctx) =>
    authPage(`<form class="auth-form" data-form="new-password">
  <h1>Choose a new password</h1>
  <p class="sub">You'll stay signed in on this device.</p>
  <label>New password<input type="password" name="password" autocomplete="new-password" required minlength="8" /><small>At least 8 characters.</small></label>
  <label>Repeat the new password<input type="password" name="repeat" autocomplete="new-password" required minlength="8" /></label>
  ${messages(ctx)}
  <button class="button primary wide">Save new password</button>
</form>`),
};
export const SITE_SCREENS = Object.keys(SCREENS);
export function siteMarkup(screen, ctx) {
  return SCREENS[screen](ctx);
}

// Turns Supabase's error messages into plain instructions.
export function friendlyError(error) {
  const message = error?.message || String(error || ''),
    status = error?.status;
  if (/invalid login credentials/i.test(message))
    return "That email and password don't match an account.";
  if (/email not confirmed/i.test(message))
    return 'Confirm your email first: open the link we sent you. You can ask for it again below.';
  if (/already registered|already exists/i.test(message))
    return 'An account with this email already exists. Sign in instead.';
  if (status === 429 || /rate limit|too many/i.test(message))
    return 'Too many attempts in a short time. Wait a minute, then try again.';
  if (/password/i.test(message) && /(least|short|weak)/i.test(message))
    return 'Choose a longer password: at least 8 characters.';
  if (/failed to fetch|network/i.test(message))
    return 'RevTimeline could not reach the server. Check your internet connection and try again.';
  return message || 'Something went wrong. Try again.';
}
