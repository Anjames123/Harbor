import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AuthProvider, useAuth } from '@/components/auth-context';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '@/pages/auth';
import { DashboardPage } from '@/pages/dashboard';
import { ExplorePage } from '@/pages/explore';
import { SearchPage } from '@/pages/search';
import { ProfilePage } from '@/pages/profile';
import { BookmarksPage } from '@/pages/bookmarks';
import { AdminUsersPage } from '@/pages/admin-users';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const { token } = useAuth();
  return <RedirectTo path={token ? '/dashboard' : '/login'} />;
}

function RedirectTo({ path }: { path: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(path); }, [path, setLocation]);
  return <div className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]"><span className="font-mono-ui text-[11px] uppercase tracking-[.18em]">Opening Harbor…</span></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) return <RedirectTo path="/login" />;
  return <>{children}</>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/dashboard">{() => <Protected><DashboardPage /></Protected>}</Route>
         <Route path="/explore">{() => <Protected><ExplorePage /></Protected>}</Route>
         <Route path="/search">{() => <Protected><SearchPage /></Protected>}</Route>
         <Route path="/profile/:id">{() => <Protected><ProfilePage /></Protected>}</Route>
         <Route path="/bookmarks">{() => <Protected><BookmarksPage /></Protected>}</Route>
        <Route path="/admin/users">{() => <Protected><AdminUsersPage /></Protected>}</Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider><Router /></AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
