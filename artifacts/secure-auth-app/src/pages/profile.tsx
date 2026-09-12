import { CalendarDays, Camera, Link2, MapPin, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Avatar, LoadingPosts, PostList, SocialError } from '@/components/social';
import { useAuth } from '@/components/auth-context';
import { followUser, getMyProfile, getUser, type SocialPost, type SocialUser, updateProfile, uploadImage } from '@/lib/social-api';

type ProfileData = SocialUser & { posts?: SocialPost[]; createdAt?: string; location?: string; website?: string };
export function ProfilePage() {
  const params = useParams<{ id: string }>();
  const { token, user: sessionUser } = useAuth();
  const isMe = params.id === sessionUser?.id;
  const [profile, setProfile] = useState<ProfileData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => { setLoading(true); setError(false); (isMe ? getMyProfile(token) : getUser(token, params.id)).then((value) => setProfile(value as ProfileData)).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [params.id, token, isMe]);
  const follow = async () => { if (!profile) return; await followUser(token, profile.id, Boolean(profile.isFollowing)); setProfile({ ...profile, isFollowing: !profile.isFollowing, followersCount: (profile.followersCount ?? 0) + (profile.isFollowing ? -1 : 1) }); };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      const updated = await updateProfile(token, {
        name: String(form.get('name') ?? '').trim(),
        username: String(form.get('username') ?? '').trim(),
        bio: String(form.get('bio') ?? '').trim(),
        ...(profile.avatarPath ? { avatarPath: profile.avatarPath } : {}),
      });
      setProfile({ ...profile, ...updated });
      setEditing(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not save your profile.');
    } finally { setSaving(false); }
  };
  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    setFormError('');
    try {
      const avatarPath = await uploadImage(token, file);
      const updated = await updateProfile(token, { avatarPath });
      setProfile({ ...profile, ...updated });
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not update your profile picture.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return <AppShell eyebrow="People" title={profile?.name ?? 'Profile'}>{error ? <SocialError onRetry={load} /> : loading ? <LoadingPosts /> : profile ? <div className="grid gap-8 lg:grid-cols-[minmax(0,650px)_280px]"><div><section className="social-card relative overflow-hidden rounded-[28px]"><div className="h-28 bg-[hsl(var(--primary))] sm:h-36"><div className="absolute left-6 top-16 sm:top-24"><Avatar user={profile} size="lg" /></div></div><div className="p-6 pt-14 sm:pt-12"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="font-display text-4xl tracking-[-.05em]">{profile.name ?? profile.username ?? 'A person'}</h1><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">@{profile.username ?? profile.handle ?? profile.id}</p></div><div className="flex items-center gap-2">{isMe && <><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={chooseAvatar} /><button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-extrabold hover:bg-[hsl(var(--muted))]"><Camera size={14} /> Photo</button><button onClick={() => setEditing(!editing)} className="rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-extrabold hover:bg-[hsl(var(--muted))]">{editing ? 'Close' : 'Edit profile'}</button></>}{!isMe && <button onClick={() => void follow()} className={`rounded-full px-5 py-2.5 text-xs font-extrabold ${profile.isFollowing ? 'border border-[hsl(var(--border))] bg-transparent' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'}`}>{profile.isFollowing ? 'Following' : 'Follow'}</button>}</div></div>{editing && <form onSubmit={saveProfile} className="mt-6 grid gap-3 rounded-2xl bg-[hsl(var(--muted)/.55)] p-4 sm:grid-cols-2"><input name="name" defaultValue={profile.name} placeholder="Name" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm outline-none" /><input name="username" defaultValue={profile.username ?? ''} placeholder="Username" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm outline-none" /><textarea name="bio" defaultValue={profile.bio ?? ''} placeholder="A short bio" rows={3} className="sm:col-span-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm outline-none" /><button disabled={saving} className="w-fit rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-xs font-extrabold text-[hsl(var(--primary-foreground))]">{saving ? 'Saving…' : 'Save profile'}</button>{formError && <p className="text-xs font-semibold text-[hsl(var(--destructive))] sm:col-span-2">{formError}</p>}</form>}{profile.bio && <p className="mt-5 max-w-xl text-sm leading-6">{profile.bio}</p>}<div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[hsl(var(--muted-foreground))]">{profile.location && <span className="flex items-center gap-1"><MapPin size={14} />{profile.location}</span>}{profile.website && <span className="flex items-center gap-1"><Link2 size={14} />{profile.website}</span>}{profile.createdAt && <span className="flex items-center gap-1"><CalendarDays size={14} />Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}</div><div className="mt-6 flex gap-5 border-t border-[hsl(var(--border))] pt-5 text-sm"><span><b>{profile.postsCount ?? profile.posts?.length ?? 0}</b> posts</span><span><b>{profile.followersCount ?? 0}</b> followers</span><span><b>{profile.followingCount ?? 0}</b> following</span></div></div></section><div className="mt-7"><p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Recent posts</p><PostList posts={profile.posts ?? []} emptyTitle="No posts yet." emptyDetail="When they share something, it will appear here." /></div></div><aside className="social-card hidden h-fit rounded-[26px] p-6 lg:block"><UserRound size={18} className="text-[hsl(var(--accent-foreground))]" /><p className="mt-5 font-display text-2xl">A profile is a little window.</p><p className="mt-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Stay curious. Follow the threads that feel like you.</p></aside></div> : null}</AppShell>;
}