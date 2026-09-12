import { Search as SearchIcon, UsersRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { PostList, SectionHeading, SocialError, LoadingPosts, UserChip } from '@/components/social';
import { useAuth } from '@/components/auth-context';
import { searchSocial, type SocialPost, type SocialUser } from '@/lib/social-api';

export function SearchPage() {
  const { token } = useAuth();
  const [location, setLocation] = useLocation();
  const initial = new URLSearchParams(location.split('?')[1] ?? '').get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(Boolean(initial));
  const [error, setError] = useState(false);
  const run = (value = query) => { if (!value.trim()) return; setLocation(`/search?q=${encodeURIComponent(value.trim())}`); setLoading(true); setSearched(true); setError(false); searchSocial(token, value.trim()).then((result) => { setPosts(result.posts); setUsers(result.users); }).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(() => { if (initial) run(initial); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); run(); };
  return <AppShell eyebrow="Search" title="Search"><SectionHeading eyebrow="Look closer" title="Search the harbor." detail="Find a person, a phrase, or a thought you want to return to." /><form onSubmit={submit} className="mb-9 flex max-w-[650px] items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-sm"><SearchIcon size={20} className="ml-3 text-[hsl(var(--muted-foreground))]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a name or #topic" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none" /><button className="rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-xs font-extrabold text-[hsl(var(--primary-foreground))]">Search</button></form>{error ? <SocialError onRetry={() => run()} /> : loading ? <LoadingPosts /> : searched ? <div className="grid gap-8 lg:grid-cols-[minmax(0,650px)_280px]"><div><p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Posts for “{initial || query}”</p><PostList posts={posts} emptyTitle="No posts found." emptyDetail="Try a different phrase, or search for someone by name." /></div><aside className="social-card h-fit rounded-[26px] p-5">{users.length ? <><div className="flex items-center gap-2"><UsersRound size={16} className="text-[hsl(var(--accent-foreground))]" /><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">People</p></div><div className="mt-5 space-y-4">{users.map((person) => <UserChip key={person.id} user={person} />)}</div></> : <p className="text-sm text-[hsl(var(--muted-foreground))]">No people matched this search.</p>}</aside></div> : <div className="social-card max-w-[650px] rounded-[26px] px-6 py-20 text-center"><SearchIcon size={25} className="mx-auto text-[hsl(var(--accent-foreground))]" /><h2 className="mt-4 font-display text-3xl">What are you curious about?</h2></div>}</AppShell>;
}