import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-context';
import { Composer, LoadingPosts, PostList, SectionHeading, SocialError } from '@/components/social';
import { getFeed, type SocialPost } from '@/lib/social-api';

export function DashboardPage() {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = () => { setLoading(true); setError(false); getFeed(token).then(setPosts).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [token]);
  return <AppShell eyebrow="Your Harbor" title="For you"><div className="grid gap-10 lg:grid-cols-[minmax(0,650px)_280px]"><div><SectionHeading eyebrow="Your corner of the harbor" title={`Good to see you, ${user?.name?.split(' ')[0] ?? 'there'}.`} detail="A small, human feed of people and ideas worth keeping close." /><div className="mb-7 flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><Sparkles size={15} className="text-[hsl(var(--accent-foreground))]" /> Your feed, in a little more color</div><Composer onCreated={(post) => setPosts((current) => [post, ...current])} /> <div className="mt-6">{loading ? <LoadingPosts /> : error ? <SocialError onRetry={load} /> : <PostList posts={posts} emptyTitle="The harbor is quiet." emptyDetail="Follow a few people from Explore and the good stuff will start washing in." />}</div></div><aside className="hidden lg:block"><div className="sticky top-24 space-y-4"><div className="rounded-[26px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">A note for today</p><p className="mt-5 font-display text-3xl leading-tight">Leave a little room for the unexpected.</p><p className="mt-5 text-xs leading-5 text-[hsl(var(--primary-foreground)/.65)]">There is no rush to have a finished thought.</p></div><div className="social-card rounded-[26px] p-5"><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Your rhythm</p><p className="mt-3 text-sm font-bold">Small posts. Real conversations.</p><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Share what made you pause, then stay for someone else's story.</p></div></div></aside></div></AppShell>;
}