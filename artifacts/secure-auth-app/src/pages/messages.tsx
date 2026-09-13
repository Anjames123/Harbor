import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Circle, MessageCircle, MoreHorizontal, Search, Send, Smile, UserRound } from 'lucide-react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-context';
import {
  getConversations, getMessages, markConversationRead, sendMessage, startConversation,
  type ChatMessage, type Conversation, type ConversationUser,
} from '@/lib/social-api';
import { searchSocial, avatarFor, objectUrl, type SocialUser } from '@/lib/social-api';

const formatTime = (date?: string) => {
  if (!date) return '';
  const value = new Date(date);
  const today = new Date();
  if (value.toDateString() === today.toDateString()) return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return value.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function Avatar({ user, size = 'md' }: { user?: ConversationUser | SocialUser; size?: 'sm' | 'md' | 'lg' }) {
  const src = objectUrl(avatarFor(user));
  const classes = { sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-14 text-lg' }[size];
  return src ? <img src={src} alt="" className={`${classes} rounded-full object-cover`} /> :
    <div className={`${classes} grid shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] font-extrabold text-[hsl(var(--primary-foreground))]`}>
      {(user?.name ?? '?').slice(0, 1).toUpperCase()}
    </div>;
}

function ConversationRow({ item, selected, onClick }: { item: Conversation; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 border-b border-[hsl(var(--border)/.7)] px-4 py-4 text-left transition hover:bg-[hsl(var(--muted)/.55)] ${selected ? 'bg-[hsl(var(--accent)/.13)]' : ''}`}>
    <div className="relative">
      <Avatar user={item.otherUser} />
      {item.otherUser.isOnline && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[hsl(var(--card))] bg-emerald-500" />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-extrabold">{item.otherUser.name ?? 'Member'}</p><span className="shrink-0 font-mono-ui text-[10px] text-[hsl(var(--muted-foreground))]">{formatTime(item.updatedAt)}</span></div>
      <p className={`mt-1 truncate text-xs ${item.unreadCount ? 'font-bold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{item.lastMessage?.content ?? 'Start a conversation'}</p>
    </div>
    {item.unreadCount > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--accent-foreground))] text-[10px] font-extrabold text-[hsl(var(--card))]">{item.unreadCount > 9 ? '9+' : item.unreadCount}</span>}
  </button>;
}

function EmptyChat({ onSearch }: { onSearch: () => void }) {
  return <div className="grid h-full place-items-center p-8 text-center"><div className="max-w-xs"><div className="mx-auto grid size-16 place-items-center rounded-3xl bg-[hsl(var(--accent)/.22)] text-[hsl(var(--accent-foreground))]"><MessageCircle size={28} /></div><h2 className="mt-5 font-display text-2xl">A quieter kind of connection.</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Choose a conversation or find someone from the harbor to start talking.</p><button onClick={onSearch} className="mt-6 rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-xs font-extrabold text-[hsl(var(--primary-foreground))]">Find someone</button></div></div>;
}

export function MessagesPage() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SocialUser[]>([]);
  const [typing, setTyping] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) ?? null, [conversations, selectedId]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try { setConversations(await getConversations(token)); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load conversations.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!token) return;
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${scheme}//${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: string; message?: ChatMessage; conversationId?: string; isTyping?: boolean };
      if (payload.type === 'message' && payload.message) {
        const incoming = payload.message;
        if (incoming.conversationId === selectedIdRef.current) {
          setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
          if (!incoming.isMine) void markConversationRead(token, incoming.conversationId);
        }
        void loadConversations();
      }
      if (payload.type === 'typing' && payload.conversationId === selectedIdRef.current) setTyping(Boolean(payload.isTyping));
    };
    return () => { socket.close(); socketRef.current = null; };
  }, [token, loadConversations]);

  useEffect(() => {
    if (!token || !selectedId) return;
    setMessagesLoading(true);
    void getMessages(token, selectedId).then((items) => {
      setMessages(items);
      return markConversationRead(token, selectedId);
    }).then(() => loadConversations()).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load messages.')).finally(() => setMessagesLoading(false));
  }, [token, selectedId, loadConversations]);

  useEffect(() => {
    if (!token || search.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => { void searchSocial(token, search.trim()).then((result) => setSearchResults(result.users.filter((item) => item.id !== user?.id))).catch(() => setSearchResults([])); }, 250);
    return () => clearTimeout(timer);
  }, [search, token, user?.id]);

  const selectConversation = (id: string) => { setSelectedId(id); setSearch(''); setSearchResults([]); };
  const beginConversation = async (person: SocialUser) => {
    if (!token) return;
    try {
      const conversation = await startConversation(token, person.id);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      selectConversation(conversation.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start conversation.'); }
  };
  const send = async () => {
    const content = draft.trim();
    if (!token || !selectedId || !content) return;
    setDraft('');
    try {
      const message = socketRef.current?.readyState === WebSocket.OPEN ? null : await sendMessage(token, selectedId, content);
      if (message) setMessages((current) => [...current, message]);
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'message', conversationId: selectedId, content }));
      void loadConversations();
    } catch (reason) { setDraft(content); setError(reason instanceof Error ? reason.message : 'Could not send message.'); }
  };
  const updateTyping = (value: string) => {
    setDraft(value);
    if (!selectedId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'typing', conversationId: selectedId, isTyping: true }));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.send(JSON.stringify({ type: 'typing', conversationId: selectedId, isTyping: false })), 900);
  };

  return <AppShell title="Messages" eyebrow="Private conversations">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.22em] text-[hsl(var(--accent-foreground))]">Private conversations</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Keep in touch.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">A direct line for the people who make the harbor feel like home.</p></div><button onClick={() => setLocation('/notifications')} className="rounded-full border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-extrabold hover:bg-[hsl(var(--muted))]">Notification settings</button></div>
    {error && <div role="alert" className="mb-4 rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.07)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}
    <section className="social-card grid min-h-[680px] overflow-hidden rounded-[1.5rem] lg:grid-cols-[330px_minmax(0,1fr)]">
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] lg:border-b-0 lg:border-r">
        <div className="border-b border-[hsl(var(--border))] p-4"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find someone to message" className="w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.7)] py-3 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/.5)]" /></div>{searchResults.length > 0 && <div className="mt-2 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">{searchResults.map((person) => <button key={person.id} onClick={() => void beginConversation(person)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[hsl(var(--muted))]"><Avatar user={person} size="sm" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{person.name}</span><span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">@{person.username}</span></span></button>)}</div>}</div>
        <div className="flex items-center justify-between px-4 pb-2 pt-4"><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Your inbox</p><span className="text-xs text-[hsl(var(--muted-foreground))]">{conversations.length}</span></div>
        <div>{loading ? <div className="space-y-3 p-4">{[1, 2, 3].map((item) => <div key={item} className="skeleton-shimmer h-14 rounded-xl" />)}</div> : conversations.length ? conversations.map((item) => <ConversationRow key={item.id} item={item} selected={item.id === selectedId} onClick={() => selectConversation(item.id)} />) : <p className="px-4 py-8 text-center text-sm leading-6 text-[hsl(var(--muted-foreground))]">No conversations yet. Search for someone above.</p>}</div>
      </div>
      <div className="flex min-h-[590px] flex-col bg-[hsl(var(--background)/.3)]">
        {!selected ? <EmptyChat onSearch={() => document.querySelector<HTMLInputElement>('input[placeholder="Find someone to message"]')?.focus()} /> : <>
          <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-5 py-4"><div className="relative"><Avatar user={selected.otherUser} /><span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-[hsl(var(--card))] ${selected.otherUser.isOnline ? 'bg-emerald-500' : 'bg-[hsl(var(--muted-foreground)/.4)]'}`} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{selected.otherUser.name}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{selected.otherUser.isOnline ? 'Online now' : 'Offline'}</p></div><button className="rounded-full p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="More conversation actions"><MoreHorizontal size={18} /></button></header>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">{messagesLoading ? <div className="grid h-full place-items-center text-sm text-[hsl(var(--muted-foreground))]">Loading messages…</div> : messages.length ? messages.map((message) => <div key={message.id} className={`flex ${message.isMine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] rounded-2xl px-4 py-3 ${message.isMine ? 'rounded-br-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'rounded-bl-md bg-[hsl(var(--card))] shadow-sm'}`}><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p><div className={`mt-1.5 flex items-center justify-end gap-1 font-mono-ui text-[9px] ${message.isMine ? 'text-[hsl(var(--primary-foreground)/.65)]' : 'text-[hsl(var(--muted-foreground))]'}`}><span>{formatTime(message.createdAt)}</span>{message.isMine && (message.readAt ? <CheckCheck size={12} /> : <Check size={12} />)}</div></div></div>) : <div className="grid flex-1 place-items-center text-center text-sm text-[hsl(var(--muted-foreground))]">Say hello to {selected.otherUser.name?.split(' ')[0] ?? 'your friend'}.</div>}{typing && <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><span className="flex gap-0.5"><i className="size-1.5 animate-bounce rounded-full bg-current" /><i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" /><i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" /></span>{selected.otherUser.name?.split(' ')[0] ?? 'They'} is typing</div>}<div ref={messagesEndRef} /></div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-4"><div className="flex items-end gap-2 rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.8)] p-2 focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/.35)]"><button type="button" className="rounded-xl p-2 text-[hsl(var(--muted-foreground))]" aria-label="Add emoji"><Smile size={18} /></button><textarea value={draft} onChange={(event) => updateTyping(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} placeholder="Write a message…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none" /><button type="submit" disabled={!draft.trim()} className="grid size-10 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-40" aria-label="Send message"><Send size={16} /></button></div><p className="mt-2 px-1 text-[10px] text-[hsl(var(--muted-foreground))]">Enter to send · Shift + Enter for a new line</p></form>
        </>}
      </div>
    </section>
  </AppShell>;
}