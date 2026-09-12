import { Bookmark, Camera, Heart, MessageCircle, Repeat2, Send, Share2, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/components/auth-context';
import {
  avatarFor, createComment, createPost, createReply, followUser, getCommentAuthor, getCount, getPostAuthor,
  getPostText, isBookmarked, isLiked, isReposted, objectUrl, type SocialComment, type SocialPost, type SocialUser,
  mutatePost, uploadImage,
} from '@/lib/social-api';

export function Avatar({ user, size = 'md' }: { user?: SocialUser; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  const initials = (user?.name ?? user?.username ?? user?.handle ?? '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const sizes = { sm: 'size-8 text-[10px]', md: 'size-10 text-xs', lg: 'size-20 text-xl' };
  return <div className={`${sizes[size]} relative shrink-0 overflow-hidden rounded-full bg-[hsl(var(--accent))] font-extrabold text-[hsl(var(--accent-foreground))] ring-4 ring-[hsl(var(--card))]`}><span className="grid size-full place-items-center">{(!avatarFor(user) || broken) && initials}</span>{avatarFor(user) && !broken && <img src={objectUrl(avatarFor(user))} alt="" className="absolute inset-0 size-full object-cover" onError={() => setBroken(true)} />}</div>;
}

export function UserChip({ user, showFollow = false, onFollow }: { user: SocialUser; showFollow?: boolean; onFollow?: () => void }) {
  const [, setLocation] = useLocation();
  return <div className="flex items-center gap-3"><button onClick={() => setLocation(`/profile/${user.id}`)} className="shrink-0"><Avatar user={user} size="sm" /></button><button onClick={() => setLocation(`/profile/${user.id}`)} className="min-w-0 text-left"><p className="truncate text-sm font-extrabold">{user.name ?? user.username ?? 'Someone new'}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">@{user.username ?? user.handle ?? user.id}</p></button>{showFollow && onFollow && <button onClick={onFollow} className="ml-auto rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-bold hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]">Follow</button>}</div>;
}

export function Composer({ onCreated }: { onCreated: (post: SocialPost) => void }) {
  const { token, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [imagePath, setImagePath] = useState<string>();
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setError(''); setUploading(true); setFileName(file.name);
    try { setImagePath(await uploadImage(token, file)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload image.'); setFileName(''); } finally { setUploading(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim() && !imagePath) return;
    setBusy(true); setError('');
    try { const post = await createPost(token, { content: text.trim(), ...(imagePath ? { imagePath } : {}) }); onCreated(post); setText(''); setImagePath(undefined); setFileName(''); if (fileRef.current) fileRef.current.value = ''; } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not share your post.'); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="social-card rounded-[26px] p-5 sm:p-6"><div className="flex gap-3"><Avatar user={user ? { id: user.id, name: user.name } : undefined} /><div className="min-w-0 flex-1"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="What is taking up a little space in your mind?" rows={3} className="w-full resize-none bg-transparent pt-1 text-base leading-7 outline-none placeholder:text-[hsl(var(--muted-foreground)/.7)]" /><div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] pt-3"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={chooseImage} /><button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><Camera size={15} /> Add an image</button>{fileName && <span className="flex items-center gap-1 rounded-full bg-[hsl(var(--accent)/.18)] px-3 py-2 text-xs font-bold text-[hsl(var(--accent-foreground))]">{uploading ? 'Uploading…' : fileName}<button type="button" aria-label="Remove image" onClick={() => { setImagePath(undefined); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }}><X size={13} /></button></span>}<button disabled={busy || uploading || (!text.trim() && !imagePath)} className="ml-auto rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-xs font-extrabold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-35">{busy ? 'Sharing…' : 'Share'}</button></div></div></div>{error && <p className="mt-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}</form>;
}

function renderText(text: string) {
  return text.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+)/g).map((part, index) => part.startsWith('#') ? <Link key={`${part}-${index}`} href={`/search?q=${encodeURIComponent(part)}`} className="font-bold text-[hsl(var(--accent-foreground))] hover:underline">{part}</Link> : part.startsWith('@') ? <Link key={`${part}-${index}`} href={`/search?q=${encodeURIComponent(part.slice(1))}`} className="font-bold text-[hsl(var(--primary))] hover:underline">{part}</Link> : <span key={index}>{part}</span>);
}

export function PostCard({ initialPost, onChange }: { initialPost: SocialPost; onChange?: (post: SocialPost) => void }) {
  const { token } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [comment, setComment] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [busy, setBusy] = useState('');
  const [shared, setShared] = useState(false);
  const author = getPostAuthor(post);
  const comments = post.comments ?? [];
  const updatePost = (next: SocialPost) => { setPost(next); onChange?.(next); };
  const act = async (action: 'like' | 'bookmark' | 'repost') => {
    setBusy(action);
    const active = action === 'like' ? isLiked(post) : action === 'bookmark' ? isBookmarked(post) : isReposted(post);
    try { await mutatePost(token, post.id, action); updatePost({ ...post, ...(action === 'like' ? { liked: !active, isLiked: !active, likesCount: Math.max(0, getCount(post, 'likes') + (active ? -1 : 1)) } : action === 'bookmark' ? { bookmarked: !active, isBookmarked: !active } : { reposted: !active, isReposted: !active, repostsCount: Math.max(0, getCount(post, 'reposts') + (active ? -1 : 1)) }) }); } finally { setBusy(''); }
  };
  const submitComment = async (event: FormEvent) => { event.preventDefault(); if (!comment.trim()) return; setBusy('comment'); try { const created = await createComment(token, post.id, comment.trim()); updatePost({ ...post, comments: [...comments, created], commentsCount: getCount(post, 'comments') + 1 }); setComment(''); setShowComments(true); } finally { setBusy(''); } };
  const submitReply = async (event: FormEvent, commentId: string) => { event.preventDefault(); if (!reply.trim()) return; setBusy('reply'); try { const created = await createReply(token, commentId, reply.trim()); updatePost({ ...post, comments: comments.map((item) => item.id === commentId ? { ...item, replies: [...(item.replies ?? []), created] } : item) }); setReply(''); setReplyFor(null); } finally { setBusy(''); } };
  const image = objectUrl(post.imagePath ?? post.imageUrl ?? post.objectPath);
  const share = () => { if (navigator.clipboard) void navigator.clipboard.writeText(window.location.href).then(() => setShared(true)); };
  return <article className="social-card rounded-[26px] p-5 sm:p-6"><div className="flex items-start gap-3"><Link href={`/profile/${author.id ?? ''}`}><Avatar user={author} /></Link><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><Link href={`/profile/${author.id ?? ''}`} className="text-sm font-extrabold hover:underline">{author.name ?? author.username ?? 'A friend'}</Link><span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">@{author.username ?? author.handle ?? 'member'}</span><p className="mt-0.5 font-mono-ui text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground)/.7)]">{post.createdAt ? new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Just now'}</p></div><button onClick={share} aria-label="Share post" className="rounded-full p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">{shared ? 'Copied' : <Share2 size={16} />}</button></div><p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">{renderText(getPostText(post))}</p>{image && <img src={image} alt="Post attachment" className="mt-4 max-h-[520px] w-full rounded-2xl object-cover" />}</div></div><div className="mt-5 flex items-center gap-1 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--muted-foreground))]"><button onClick={() => void act('like')} disabled={busy === 'like'} className={`action-button ${isLiked(post) ? 'active-like' : ''}`}><Heart size={17} fill={isLiked(post) ? 'currentColor' : 'none'} />{getCount(post, 'likes') || ''}</button><button onClick={() => setShowComments(!showComments)} className="action-button"><MessageCircle size={17} />{getCount(post, 'comments') || ''}</button><button onClick={() => void act('repost')} disabled={busy === 'repost'} className={`action-button ${isReposted(post) ? 'active-repost' : ''}`}><Repeat2 size={17} />{getCount(post, 'reposts') || ''}</button><button onClick={() => void act('bookmark')} disabled={busy === 'bookmark'} className={`action-button ml-auto ${isBookmarked(post) ? 'active-save' : ''}`} aria-label="Save post"><Bookmark size={17} fill={isBookmarked(post) ? 'currentColor' : 'none'} /></button></div>{showComments && <div className="mt-3 border-t border-[hsl(var(--border))] pt-4"><form onSubmit={submitComment} className="flex items-center gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add to the conversation…" className="min-w-0 flex-1 rounded-full bg-[hsl(var(--muted)/.65)] px-4 py-2.5 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2" /><button aria-label="Send comment" disabled={busy === 'comment'} className="grid size-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Send size={15} /></button></form><div className="mt-4 space-y-4">{comments.map((item) => <div key={item.id} className="pl-1"><div className="flex items-start gap-2"><Avatar user={getCommentAuthor(item)} size="sm" /><div className="min-w-0 flex-1 rounded-2xl bg-[hsl(var(--muted)/.6)] px-3 py-2"><p className="text-xs font-extrabold">{getCommentAuthor(item).name ?? 'Friend'}</p><p className="mt-1 text-sm leading-5">{item.content}</p></div></div><button onClick={() => setReplyFor(replyFor === item.id ? null : item.id)} className="ml-11 mt-1 text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">Reply</button>{replyFor === item.id && <form onSubmit={(event) => void submitReply(event, item.id)} className="ml-11 mt-2 flex gap-2"><input autoFocus value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" className="min-w-0 flex-1 rounded-full border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-xs outline-none" /><button disabled={busy === 'reply'} className="rounded-full bg-[hsl(var(--primary))] px-3 py-2 text-[11px] font-bold text-[hsl(var(--primary-foreground))]">Send</button></form>}{item.replies?.map((child) => <div key={child.id} className="ml-11 mt-2 flex items-start gap-2 text-sm"><Avatar user={getCommentAuthor(child)} size="sm" /><p className="rounded-2xl bg-[hsl(var(--muted)/.45)] px-3 py-2"><b>{getCommentAuthor(child).name ?? 'Friend'}</b> {child.content}</p></div>)}</div>)}</div></div>}</article>;
}

export function PostList({ posts, emptyTitle = 'Nothing here yet.', emptyDetail = 'The good stuff will show up when it arrives.' }: { posts: SocialPost[]; emptyTitle?: string; emptyDetail?: string }) {
  return posts.length ? <div className="space-y-4">{posts.map((post) => <PostCard key={post.id} initialPost={post} />)}</div> : <div className="social-card rounded-[26px] px-6 py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-full bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent-foreground))]"><Heart size={22} /></div><h2 className="mt-5 font-display text-3xl">{emptyTitle}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{emptyDetail}</p></div>;
}

export function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className="mb-7"><p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent-foreground))]">{eyebrow}</p><h1 className="mt-2 text-balance font-display text-5xl tracking-[-.055em] sm:text-6xl">{title}</h1>{detail && <p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>;
}

export function LoadingPosts() {
  return <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="social-card animate-pulse rounded-[26px] p-6"><div className="flex gap-3"><div className="skeleton-shimmer size-10 rounded-full" /><div className="flex-1"><div className="skeleton-shimmer h-3 w-36 rounded" /><div className="skeleton-shimmer mt-3 h-3 w-full rounded" /><div className="skeleton-shimmer mt-2 h-3 w-4/5 rounded" /></div></div></div>)}</div>;
}

export function SocialError({ onRetry }: { onRetry: () => void }) {
  return <div className="social-card rounded-[26px] border-[hsl(var(--destructive)/.25)] p-8"><h2 className="font-display text-3xl">The tide is a little choppy.</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">We couldn't reach the harbor. Your work is safe — try the connection again.</p><button onClick={onRetry} className="mt-5 rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-xs font-extrabold text-[hsl(var(--primary-foreground))]">Try again</button></div>;
}