import { Link } from 'wouter';

export function Brand({ inverse = false, href = '/login' }: { inverse?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3" data-testid="link-brand">
      <span className={`grid size-10 place-items-center rounded-[13px] ${inverse ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--accent))]'}`}>
        <span className="relative block size-5 rounded-full border-[2.5px] border-current">
          <span className="absolute -right-[3px] top-1/2 size-2 -translate-y-1/2 rounded-full bg-current" />
        </span>
      </span>
      <span className={`text-[17px] font-extrabold tracking-[-.04em] ${inverse ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>harbor<span className="text-[hsl(var(--accent))]">.</span></span>
    </Link>
  );
}

export function SecurityNote({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] ${inverse ? 'text-[hsl(var(--sidebar-foreground)/.58)]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="text-security-note">
      <span className="size-1.5 rounded-full bg-[hsl(var(--accent))]" />
      Your privacy is the product
    </div>
  );
}