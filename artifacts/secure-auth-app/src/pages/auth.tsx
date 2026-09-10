import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useConfirmPasswordReset, useLogin, useRegister, useRequestPasswordReset, useResendVerification, useVerifyEmail } from '@workspace/api-client-react';
import { AuthLayout } from '@/components/auth-layout';
import { useAuth } from '@/components/auth-context';

function getError(error: unknown) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'Something went wrong. Please try again.';
}

function Field({ label, type = 'text', value, onChange, placeholder, name, autoComplete, required = true }: { label: string; type?: string; value: string; onChange: (value: string) => void; placeholder: string; name: string; autoComplete?: string; required?: boolean }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-2 block text-[12px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="relative block">
        <input id={name} name={name} required={required} type={isPassword && !visible ? 'password' : 'text'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} data-testid={`input-${name}`} className="h-[52px] w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-4 text-sm text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--accent-foreground))] focus:ring-4 focus:ring-[hsl(var(--accent)/.22)]" />
        {isPassword && <button type="button" onClick={() => setVisible(!visible)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label={visible ? 'Hide password' : 'Show password'} data-testid={`button-toggle-${name}`}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
      </span>
    </label>
  );
}

function SubmitButton({ children, pending }: { children: string; pending: boolean }) {
  return <button disabled={pending} type="submit" className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_10px_20px_hsl(var(--primary)/.14)] hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/.92)] disabled:cursor-wait disabled:opacity-60" data-testid="button-submit">{pending ? <RefreshCw size={16} className="animate-spin" /> : <>{children}<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>}</button>;
}

function FormError({ error }: { error?: unknown }) {
  if (!error) return null;
  return <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.07)] px-4 py-3 text-sm leading-5 text-[hsl(var(--destructive))]" data-testid="status-form-error">{getError(error)}</div>;
}

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { setSession } = useAuth();
  const loginMutation = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    loginMutation.mutate({ data: { email, password } }, { onSuccess: (response) => { setSession(response); setLocation('/dashboard'); } });
  };
  return <AuthLayout eyebrow="The quiet place for access" title={<>Your work,<br /><em className="text-[hsl(var(--accent))]">kept close.</em></>} description="Harbor gives your team a private, considered place to do their best work. One secure doorway, no noise." footer={<Link href="/forgot-password" className="hidden" data-testid="link-footer" />}>
    <div className="mb-10"><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">Welcome back</p><h2 className="font-display text-4xl tracking-[-.04em]">Sign in to Harbor</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Your private workspace is ready when you are.</p></div>
    <form onSubmit={submit} className="space-y-5" data-testid="form-login">
      <Field label="Email address" name="email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" />
      <div><div className="mb-2 flex items-center justify-between"><span className="text-[12px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Password</span><Link href="/forgot-password" className="text-xs font-bold text-[hsl(var(--accent-foreground))] hover:underline" data-testid="link-forgot-password">Forgot password?</Link></div><Field label="" name="password" type="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" /></div>
      <FormError error={loginMutation.error} /><SubmitButton pending={loginMutation.isPending}>Continue securely</SubmitButton>
    </form>
    <p className="mt-8 text-center text-sm text-[hsl(var(--muted-foreground))]">New to Harbor? <Link href="/register" className="font-bold text-[hsl(var(--foreground))] underline decoration-[hsl(var(--accent))] decoration-2 underline-offset-4 hover:text-[hsl(var(--accent-foreground))]" data-testid="link-register">Create an account</Link></p>
  </AuthLayout>;
}

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { setSession } = useAuth();
  const mutation = useRegister();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate({ data: { name, email, password } }, { onSuccess: (response) => { setSession(response); setLocation('/verify-email'); } }); };
  return <AuthLayout eyebrow="A better beginning" title={<>Make room for<br /><em className="text-[hsl(var(--accent))]">good work.</em></>} description="Create your Harbor account and start with a workspace that respects your focus, your data, and your time." footer={<span />}>
    <div className="mb-9"><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">Start here</p><h2 className="font-display text-4xl tracking-[-.04em]">Create your account</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">A few details, then we’ll send a confirmation to your inbox.</p></div>
    <form onSubmit={submit} className="space-y-4" data-testid="form-register">
      <Field label="Your name" name="name" value={name} onChange={setName} placeholder="What should we call you?" autoComplete="name" />
      <Field label="Email address" name="email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" />
      <Field label="Create a password" name="password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />
      <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Use 8–128 characters. A passphrase you remember is better than one you write down.</p>
      <FormError error={mutation.error} /><SubmitButton pending={mutation.isPending}>Create my account</SubmitButton>
    </form>
    <p className="mt-7 text-center text-sm text-[hsl(var(--muted-foreground))]">Already have an account? <Link href="/login" className="font-bold text-[hsl(var(--foreground))] underline decoration-[hsl(var(--accent))] decoration-2 underline-offset-4" data-testid="link-login">Sign in</Link></p>
  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const mutation = useRequestPasswordReset(); const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate({ data: { email } }, { onSuccess: () => setSent(true) }); };
  return <AuthLayout eyebrow="A safe way back" title={<>Let’s find<br /><em className="text-[hsl(var(--accent))]">your way in.</em></>} description="No panic. Enter the address attached to your Harbor account and we’ll help you choose a new password." footer={<span />}>
    {!sent ? <><div className="mb-10"><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">Password reset</p><h2 className="font-display text-4xl tracking-[-.04em]">Forgot your password?</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">We’ll send a one-time link to your email address.</p></div><form onSubmit={submit} className="space-y-5" data-testid="form-forgot-password"><Field label="Email address" name="email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" /><FormError error={mutation.error} /><SubmitButton pending={mutation.isPending}>Send reset link</SubmitButton></form><p className="mt-8 text-center text-sm"><Link href="/login" className="font-bold text-[hsl(var(--foreground))] hover:text-[hsl(var(--accent-foreground))]" data-testid="link-back-login">← Back to sign in</Link></p></> : <SuccessState icon={<KeyRound />} title="Check your inbox" message="If an account exists for that address, a reset link is on its way. It will be valid for a limited time." linkHref="/login" linkLabel="Return to sign in" />}
  </AuthLayout>;
}

export function ResetPasswordPage() {
  const search = useSearch(); const token = useMemo(() => new URLSearchParams(search).get('token') ?? '', [search]); const mutation = useConfirmPasswordReset(); const [password, setPassword] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate({ data: { token, password } }, { onSuccess: () => setConfirmed(true) }); };
  return <AuthLayout eyebrow="A fresh start" title={<>Choose a new<br /><em className="text-[hsl(var(--accent))]">secret.</em></>} description="Set a new password for your Harbor account. Make it something only you would know." footer={<span />}>
    {!confirmed ? <><div className="mb-10"><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">New password</p><h2 className="font-display text-4xl tracking-[-.04em]">Reset your password</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{token ? 'Choose a new password below.' : 'This reset link looks incomplete. Request a new one to continue.'}</p></div><form onSubmit={submit} className="space-y-5" data-testid="form-reset-password"><Field label="New password" name="password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" /><FormError error={mutation.error} /><SubmitButton pending={mutation.isPending}>Set new password</SubmitButton></form></> : <SuccessState icon={<Check />} title="Password updated" message="Your new password is ready. Sign in with it the next time you visit." linkHref="/login" linkLabel="Continue to sign in" />}
  </AuthLayout>;
}

export function VerifyEmailPage() {
  const search = useSearch(); const token = useMemo(() => new URLSearchParams(search).get('token') ?? '', [search]); const verifyMutation = useVerifyEmail(); const resendMutation = useResendVerification(); const [email, setEmail] = useState(''); const [verified, setVerified] = useState(false); const [resent, setResent] = useState(false);
  const verifyRef = useRef(verifyMutation.mutate); verifyRef.current = verifyMutation.mutate;
  useEffect(() => { if (token) verifyRef.current({ data: { token } }, { onSuccess: () => setVerified(true) }); }, [token]);
  const resend = (event: FormEvent) => { event.preventDefault(); resendMutation.mutate({ data: { email } }, { onSuccess: () => setResent(true) }); };
  if (verified) return <AuthLayout eyebrow="You’re all set" title={<>A clear<br /><em className="text-[hsl(var(--accent))]">signal.</em></>} description="Your email is confirmed and your Harbor workspace is ready." footer={<span />}><SuccessState icon={<Check />} title="Email verified" message={verifyMutation.data?.message ?? 'Your account is now verified.'} linkHref="/dashboard" linkLabel="Open your workspace" /></AuthLayout>;
  return <AuthLayout eyebrow="One small step" title={<>Confirm it’s<br /><em className="text-[hsl(var(--accent))]">really you.</em></>} description="Verification keeps your account safe and makes sure we can reach you when it matters." footer={<span />}>
    <div className="mb-9"><div className="mb-7 flex size-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]"><Mail size={25} /></div><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">Email verification</p><h2 className="font-display text-4xl tracking-[-.04em]">Check your inbox</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">We sent a verification link after you created your account. Open it to finish setting up Harbor.</p></div>
    <FormError error={verifyMutation.error} />
    {!resent ? <form onSubmit={resend} className="space-y-5" data-testid="form-resend-verification"><Field label="Resend to" name="email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" /><FormError error={resendMutation.error} /><SubmitButton pending={resendMutation.isPending}>Resend verification</SubmitButton></form> : <div className="rounded-xl border border-[hsl(var(--accent-foreground)/.25)] bg-[hsl(var(--accent)/.12)] px-4 py-3 text-sm leading-5 text-[hsl(var(--foreground))]" data-testid="status-verification-sent">A fresh verification link is on its way.</div>}
    <p className="mt-8 text-center text-sm"><Link href="/login" className="font-bold text-[hsl(var(--foreground))]" data-testid="link-verify-login">Return to sign in</Link></p>
  </AuthLayout>;
}

function SuccessState({ icon, title, message, linkHref, linkLabel }: { icon: ReactNode; title: string; message: string; linkHref: string; linkLabel: string }) {
  return <div className="text-center" data-testid="status-success"><div className="mx-auto mb-7 flex size-16 items-center justify-center rounded-[20px] bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent-foreground))]">{icon}</div><h2 className="font-display text-4xl tracking-[-.04em]">{title}</h2><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{message}</p><Link href={linkHref} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-success-action">{linkLabel}<ArrowRight size={15} /></Link></div>;
}