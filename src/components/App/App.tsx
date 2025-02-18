import { Fragment, Suspense, useMemo, useEffect } from "react";
import { useRecoilValue } from "recoil";

import "./App.css";
import Header from "@/components/Header";
import Toolbar from "@/components/Toolbar";
import IconGrid from "@/components/IconGrid";
import Footer from "@/components/Footer";
import ErrorBoundary from "@/components/ErrorBoundary";
import Notice from "@/components/Notice";
// import Recipes from "@/components/Recipes";
import { useCSSVariables } from "@/hooks";
import { useBookmarks } from "@/hooks/useBookmarks";
import { isDarkThemeSelector } from "@/state";

const mobile = /Android|iPhone|iPod|iPad|Opera Mini|IEMobile/i;
const isMobile = mobile.test(window.navigator.userAgent);

const errorFallback = <Notice message="Search error" />;
const waitingFallback = <Notice type="none" message="" />;

const App: React.FC<any> = () => {
  const isDark = useRecoilValue(isDarkThemeSelector);
  const { fetchBookmarks } = useBookmarks();

  useEffect(() => {
    // Debug auth state
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
    console.log('All localStorage keys:', keys);
    
    // Get the auth token key
    const authKey = keys.find(k => k.endsWith('-auth-token'));
    const token = authKey ? JSON.parse(localStorage.getItem(authKey) || '{}').access_token : null;
    
    console.log('Token found:', !!token);
    if (token) {
      console.log('Token value:', token.slice(0, 20) + '...');
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        }
      })
      .then(r => {
        console.log('Auth response status:', r.status);
        return r.json();
      })
      .then(user => console.log('User data:', user))
      .catch(err => console.error('Auth check failed:', err));
    }

    fetchBookmarks();
  }, [fetchBookmarks]);

  useCSSVariables(
    useMemo(
      () => ({
        "--foreground": isDark ? "white" : "var(--moss)",
        "--foreground-card": isDark ? "white" : "var(--moss)",
        "--foreground-secondary": isDark ? "var(--pewter)" : "var(--elephant)",
        "--background": isDark ? "var(--slate)" : "var(--vellum)",
        "--background-card": isDark ? "var(--stone)" : "var(--vellum)",
        "--background-layer": isDark ? "var(--scrim)" : "var(--translucent)",
        "--border-card": isDark ? "var(--shadow)" : "var(--moss-shadow)",
        "--border-secondary": isDark ? "var(--scrim)" : "var(--moss-shadow)",
        "--hover-tabs": isDark ? "var(--slate-sheer)" : "var(--ghost-sheer)",
        "--hover-buttons": isDark ? "var(--scrim)" : "var(--slate)",
      }),
      [isDark]
    )
  );

  return (
    <Fragment>
      <Header />
      <main>
        <Toolbar isMobile={isMobile} />
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={waitingFallback}>
            <IconGrid />
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* <Recipes /> */}
      <Footer />
    </Fragment>
  );
};

export default App;
