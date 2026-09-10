import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="noise grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-5 text-center text-[hsl(var(--foreground))]">
      <div className="max-w-md">
        <div className="mx-auto mb-8 grid size-16 place-items-center rounded-[20px] bg-[hsl(var(--primary))] text-[hsl(var(--accent))]"><Compass size={29} /></div>
        <p className="font-mono-ui text-[11px] uppercase tracking-[.2em] text-[hsl(var(--accent-foreground))]">A wrong turn</p>
        <h1 className="mt-4 font-display text-6xl tracking-[-.06em]">Nothing here.</h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">This page has drifted beyond the edge of your Harbor. Let’s get you back to solid ground.</p>
        <Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-not-found-home"><ArrowLeft size={15} /> Return to Harbor</Link>
      </div>
    </main>
  );
}
