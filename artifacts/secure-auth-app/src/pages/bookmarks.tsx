import { Bookmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { LoadingPosts, PostList, SectionHeading, SocialError } from '@/components/social';
import { useAuth } from '@/components/auth-context';
import { getBookmarks, type SocialPost } from '@/lib/social-api';

export function BookmarksPage() {
  const { token } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = () => { setLoading(true); setError(false); getBookmarks(token).then(setPosts).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [token]);
  return <AppShell eyebrow="Your collection" title="Saved"><SectionHeading eyebrow="Keep what matters" title="Your saved posts." detail="A private shelf for the words, images, and ideas you want to find again." /><div className="mb-7 flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><Bookmark size={15} className="text-[hsl(var(--accent-foreground))]" /> Only you can see these.</div>{loading ? <LoadingPosts /> : error ? <SocialError onRetry={load} /> : <PostList posts={posts} emptyTitle="Your shelf is empty." emptyDetail="Tap the bookmark on a post and it will stay here for later." />}</AppShell>;
}