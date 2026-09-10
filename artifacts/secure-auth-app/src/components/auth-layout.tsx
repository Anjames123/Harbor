import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { ArrowUpRight, Check, ShieldCheck } from 'lucide-react';
import { Brand, SecurityNote } from '@/components/brand';

export function AuthLayout({ children, eyebrow, title, description, footer }: { children: ReactNode; eyebrow: string; title: ReactNode; description: string; footer?: ReactNode }) {
  return (
    <main className="noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(390px,43%)_1fr]">
        <aside className="relative hidden overflow-hidden bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute -right-24 top-24 size-96 rounded-full border border-[hsl(var(--accent)/.18)]" />
          <div className="absolute -right-10 top-40 size-64 rounded-full border border-[hsl(var(--accent)/.18)]" />
          <div className="absolute bottom-28 left-12 size-28 rounded-full bg-[hsl(var(--accent)/.1)] blur-2xl" />
          <div className="relative z-10 rise-in">
            <Brand inverse />
            <div className="mt-24 max-w-sm">
              <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.14)] text-[hsl(var(--accent))]">
                <ShieldCheck size={25} strokeWidth={1.7} />
              </div>
              <p className="mb-5 font-mono-ui text-[11px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">{eyebrow}</p>
              <h1 className="font-display text-5xl leading-[.98] tracking-[-.045em] xl:text-[4.35rem]">{title}</h1>
              <p className="mt-7 max-w-[310px] text-[15px] leading-7 text-[hsl(var(--primary-foreground)/.68)]">{description}</p>
            </div>
          </div>
          <div className="relative z-10 flex items-end justify-between">
            <SecurityNote inverse />
            <Link href="/verify-email" className="group inline-flex items-center gap-1 text-xs text-[hsl(var(--primary-foreground)/.65)] hover:text-[hsl(var(--accent))]" data-testid="link-help-verification">Need to verify? <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
          </div>
        </aside>
        <section className="flex min-h-[100dvh] flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-10 xl:px-24">
          <header className="flex items-center justify-between lg:hidden">
            <Brand />
            <SecurityNote />
          </header>
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-[450px] rise-in delay-1">{children}</div>
          </div>
          <footer className="flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
            <span>© 2025 Harbor Systems</span>
            <span className="flex items-center gap-1.5"><Check size={13} className="text-[hsl(var(--accent-foreground))]" /> Secure by default</span>
            {footer}
          </footer>
        </section>
      </div>
    </main>
  );
}