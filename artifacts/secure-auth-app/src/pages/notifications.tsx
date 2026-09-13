import { useEffect, useState } from 'react';
import { Bell, Check, ChevronRight, MessageCircle, Settings2, UserPlus } from 'lucide-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-context';
import { avatarFor, getNotifications, getNotificationPreferences, markNotificationsRead, objectUrl, updateNotificationPreferences, type Notification, type NotificationPreferences } from '@/lib/social-api';

const relativeTime = (date: string) => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};
function NotificationIcon({ type }: { type: string }) {
  const Icon = type === 'message' ? MessageCircle : type === 'follow' ? UserPlus : Bell;
  return <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent-foreground))]"><Icon size={17} /></span>;
}
function NotificationRow({ item }: { item: Notification }) {
  const avatar = objectUrl(avatarFor(item.actor ?? undefined));
  return <div className={`flex gap-3 border-b border-[hsl(var(--border)/.7)] px-5 py-4 ${item.isRead ? '' : 'bg-[hsl(var(--accent)/.07)]'}`}><NotificationIcon type={item.type} /><div className="min-w-0 flex-1"><div className="flex gap-3"><p className="flex-1 text-sm font-bold">{item.title}</p><span className="shrink-0 font-mono-ui text-[10px] text-[hsl(var(--muted-foreground))]">{relativeTime(item.createdAt)}</span></div><p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{item.body}</p>{item.conversationId && <Link href="/messages" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold text-[hsl(var(--accent-foreground))]">Open conversation <ChevronRight size={13} /></Link>}</div>{!item.isRead && <span className="mt-2 size-2 shrink-0 rounded-full bg-[hsl(var(--accent-foreground))]" />}{avatar && <img src={avatar} alt="" className="hidden size-8 rounded-full object-cover sm:block" />}</div>;
}
function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-5 border-b border-[hsl(var(--border)/.7)] py-4 last:border-0"><span><span className="block text-sm font-extrabold">{label}</span><span className="mt-1 block text-xs leading-5 text-[hsl(var(--muted-foreground))]">{description}</span></span><button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${value ? 'left-6' : 'left-1'}`} /></button></label>;
}
export function NotificationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [tab, setTab] = useState<'activity' | 'settings'>('activity');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!token) return;
    void Promise.all([getNotifications(token), getNotificationPreferences(token)]).then(([notifications, prefs]) => { setItems(notifications); setPreferences(prefs); }).finally(() => setLoading(false));
  }, [token]);
  const markRead = async () => { if (!token) return; await markNotificationsRead(token); setItems((current) => current.map((item) => ({ ...item, isRead: true }))); };
  const changePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!token || !preferences) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next); setSaved(false);
    try { await updateNotificationPreferences(token, { [key]: value }); setSaved(true); setTimeout(() => setSaved(false), 1600); } catch { setPreferences(preferences); }
  };
  return <AppShell title="Notifications" eyebrow="Stay in the loop"><div className="mb-8"><p className="font-mono-ui text-[10px] uppercase tracking-[.22em] text-[hsl(var(--accent-foreground))]">Signals from your harbor</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-4xl sm:text-5xl">Notifications.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">The small updates that help you stay close to the people and conversations you care about.</p></div>{tab === 'activity' && items.some((item) => !item.isRead) && <button onClick={() => void markRead()} className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-extrabold hover:bg-[hsl(var(--muted))]"><Check size={14} /> Mark all read</button>}</div></div>
    <div className="mb-5 flex gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit"><button onClick={() => setTab('activity')} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold ${tab === 'activity' ? 'bg-[hsl(var(--card))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}><Bell className="mr-2 inline size-4" />Activity</button><button onClick={() => setTab('settings')} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold ${tab === 'settings' ? 'bg-[hsl(var(--card))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}><Settings2 className="mr-2 inline size-4" />Preferences</button></div>
    {tab === 'activity' ? <section className="social-card overflow-hidden rounded-[1.5rem]">{loading ? <div className="p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading your notifications…</div> : items.length ? items.map((item) => <NotificationRow key={item.id} item={item} />) : <div className="grid place-items-center px-5 py-20 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent-foreground))]"><Bell size={24} /></div><h2 className="mt-4 font-display text-2xl">All caught up.</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">New messages and activity will show up here.</p></div>}</section> : <section className="social-card max-w-2xl rounded-[1.5rem] p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent-foreground))]"><Settings2 size={18} /></span><div><h2 className="font-display text-2xl">Choose your signals</h2><p className="text-xs text-[hsl(var(--muted-foreground))]">You’re in control of what reaches you.</p></div></div>{preferences && <div><Toggle label="Messages" description="When someone sends you a private message." value={preferences.messageNotifications} onChange={(value) => void changePreference('messageNotifications', value)} /><Toggle label="New followers" description="When someone starts following you." value={preferences.followNotifications} onChange={(value) => void changePreference('followNotifications', value)} /><Toggle label="Interactions" description="Likes, comments, and other activity on your posts." value={preferences.interactionNotifications} onChange={(value) => void changePreference('interactionNotifications', value)} /><Toggle label="Email updates" description="Occasional email reminders about important activity." value={preferences.emailNotifications} onChange={(value) => void changePreference('emailNotifications', value)} /></div>}{saved && <p className="mt-4 text-xs font-bold text-emerald-700">Preferences saved.</p>}</section>}
  </AppShell>;
}