export type SocialUser = {
  id: string;
  name?: string;
  username?: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  avatarPath?: string;
  avatar_url?: string;
  avatar_path?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  isFollowing?: boolean;
};

export type SocialComment = {
  id: string;
  content: string;
  author?: SocialUser;
  user?: SocialUser;
  createdAt?: string;
  replies?: SocialComment[];
};

export type SocialPost = {
  id: string;
  content?: string;
  body?: string;
  text?: string;
  imagePath?: string;
  imageUrl?: string;
  objectPath?: string;
  author?: SocialUser;
  user?: SocialUser;
  createdAt?: string;
  likesCount?: number;
  commentsCount?: number;
  repostsCount?: number;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  liked?: boolean;
  isLiked?: boolean;
  bookmarked?: boolean;
  isBookmarked?: boolean;
  reposted?: boolean;
  isReposted?: boolean;
  comments?: SocialComment[];
};

type RequestOptions = { method?: string; body?: unknown };

async function socialRequest<T>(path: string, token: string | null, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'detail' in payload ? String(payload.detail) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function listFrom<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of keys) if (Array.isArray(record[key])) return record[key] as T[];
    if (record.data && Array.isArray(record.data)) return record.data as T[];
    if (record.data && typeof record.data === 'object') return listFrom<T>(record.data, keys);
  }
  return [];
}

export const unwrapList = <T>(payload: unknown, keys: string[]) => listFrom<T>(payload, keys);
export const unwrapEntity = <T>(payload: unknown) => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  }
  return payload as T;
};
export const getPostText = (post: SocialPost) => post.content ?? post.body ?? post.text ?? '';
export const getPostAuthor = (post: SocialPost): SocialUser => post.author ?? post.user ?? { id: '', name: 'A friend' };
export const getCommentAuthor = (comment: SocialComment): SocialUser => comment.author ?? comment.user ?? { id: '', name: 'A friend' };
export const getCount = (post: SocialPost, key: 'likes' | 'comments' | 'reposts') => ({
  likes: post.likesCount ?? post.likeCount,
  comments: post.commentsCount ?? post.commentCount,
  reposts: post.repostsCount ?? post.repostCount,
}[key] ?? 0);
export const isLiked = (post: SocialPost) => Boolean(post.liked ?? post.isLiked);
export const isBookmarked = (post: SocialPost) => Boolean(post.bookmarked ?? post.isBookmarked);
export const isReposted = (post: SocialPost) => Boolean(post.reposted ?? post.isReposted);
export const avatarFor = (user?: SocialUser) => user?.avatarUrl ?? user?.avatarPath ?? user?.avatar_url ?? user?.avatar_path;
export const objectUrl = (path?: string) => path ? (path.startsWith('http') || path.startsWith('/api/storage/') ? path : `/api/storage/${path.replace(/^\/+/, '')}`) : undefined;

export function getFeed(token: string | null) { return socialRequest<unknown>('/api/feed', token).then((value) => unwrapList<SocialPost>(value, ['posts', 'items', 'results'])); }
export function getExplore(token: string | null) { return socialRequest<unknown>('/api/explore', token).then((value) => ({ posts: unwrapList<SocialPost>(value, ['posts', 'items', 'results']), users: unwrapList<SocialUser>(value, ['users', 'people', 'suggestions']) })); }
export function getBookmarks(token: string | null) { return socialRequest<unknown>('/api/bookmarks', token).then((value) => unwrapList<SocialPost>(value, ['posts', 'items', 'results'])); }
export function searchSocial(token: string | null, query: string) { return socialRequest<unknown>(`/api/search?q=${encodeURIComponent(query)}`, token).then((value) => ({ posts: unwrapList<SocialPost>(value, ['posts']), users: unwrapList<SocialUser>(value, ['users', 'people']) })); }
export function getUser(token: string | null, id: string) { return socialRequest<unknown>(`/api/users/${encodeURIComponent(id)}`, token).then(unwrapEntity<SocialUser & { posts?: SocialPost[] }>); }
export function getMyProfile(token: string | null) { return socialRequest<unknown>('/api/users/me/profile', token).then(unwrapEntity<SocialUser & { posts?: SocialPost[] }>); }
export function updateProfile(token: string | null, body: { name?: string; username?: string; bio?: string; avatarPath?: string }) {
  return socialRequest<unknown>('/api/users/me/profile', token, { method: 'PATCH', body }).then(unwrapEntity<SocialUser & { posts?: SocialPost[] }>);
}
export function createPost(token: string | null, body: { content: string; imagePath?: string }) { return socialRequest<unknown>('/api/posts', token, { method: 'POST', body }).then(unwrapEntity<SocialPost>); }
export function mutatePost(token: string | null, id: string, action: 'like' | 'bookmark' | 'repost') { return socialRequest<unknown>(`/api/posts/${encodeURIComponent(id)}/${action}`, token, { method: 'POST' }); }
export function createComment(token: string | null, id: string, content: string) { return socialRequest<unknown>(`/api/posts/${encodeURIComponent(id)}/comments`, token, { method: 'POST', body: { content } }).then(unwrapEntity<SocialComment>); }
export function createReply(token: string | null, id: string, content: string) { return socialRequest<unknown>(`/api/comments/${encodeURIComponent(id)}/replies`, token, { method: 'POST', body: { content } }).then(unwrapEntity<SocialComment>); }
export function followUser(token: string | null, id: string, following: boolean) { return socialRequest<unknown>(`/api/users/${encodeURIComponent(id)}/follow`, token, { method: following ? 'DELETE' : 'POST' }); }

export async function uploadImage(token: string | null, file: File) {
  const requested = await socialRequest<unknown>('/api/uploads/request-url', token, {
    method: 'POST',
    body: { name: file.name, contentType: file.type, size: file.size },
  });
  const record = (requested && typeof requested === 'object' ? requested : {}) as Record<string, unknown>;
  const uploadUrl = String(record.uploadUrl ?? record.url ?? record.signedUrl ?? '');
  const objectPath = String(record.objectPath ?? record.path ?? record.key ?? '');
  if (!uploadUrl || !objectPath) throw new Error('The upload service did not return a destination.');
  const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!upload.ok) throw new Error('Image upload failed. Please try again.');
  return objectPath;
}