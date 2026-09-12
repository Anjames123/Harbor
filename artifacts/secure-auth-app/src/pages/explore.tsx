import { Compass, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { PostList, SectionHeading, SocialError, LoadingPosts, UserChip } from '@/components/social';
import { useAuth } from '@/components/auth-context';
import { followUser, getExplore, type SocialPost, type SocialUser } from '@/lib/social-api';

export function ExplorePage() {
  const { token } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [people, setPeople] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = () => { setLoading(true); setError(false); getExplore(token).then((value) => { setPosts(value.posts); setPeople(value.users); }).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [token]);
  return <AppShell eyebrow="Discover" title="Explore"><SectionHeading eyebrow="A little further out" title="Find your people." detail="Wander through the posts making a ripple beyond your usual circle." /><div className="mb-8 flex items-center gap-2 rounded-2xl border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.12)] px-4 py-3 text-sm"><Compass size={17} className="text-[hsl(var(--accent-foreground))]" /><span>Fresh perspectives, no algorithmic shouting.</span></div>{loading ? <LoadingPosts /> : error ? <SocialError onRetry={load} /> : <div className="grid gap-6 lg:grid-cols-[minmax(0,650px)_280px]"><PostList posts={posts} emptyTitle="The wider world is quiet." emptyDetail="New discoveries will appear here when people start sharing." /><aside className="social-card hidden h-fit rounded-[26px] p-5 lg:block"><div className="flex items-center gap-2"><UserPlus size={16} className="text-[hsl(var(--accent-foreground))]" /><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">People to notice</p></div>{people.length ? <div className="mt-5 space-y-4">{people.slice(0, 5).map((person) => <UserChip key={person.id} user={person} showFollow onFollow={() => void followUser(token, person.id, Boolean(person.isFollowing))} />)}</div> : <p className="mt-5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Search for a name to find people to follow.</p>}</aside></div>}</AppShell>;
}