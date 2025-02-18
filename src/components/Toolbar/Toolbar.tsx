import React from "react";
import { Star, CloudArrowUp, CloudCheck } from "@phosphor-icons/react";
import { useRecoilState } from "recoil";

import StyleInput from "@/components/StyleInput";
import SearchInput from "@/components/SearchInput";
import SizeInput from "@/components/SizeInput";
import ColorInput from "@/components/ColorInput";
import SettingsActions from "@/components/SettingsActions";
import AuthPanel from "../AuthPanel";
import { useBookmarks } from "@/hooks/useBookmarks";
import { showBookmarksOnlyAtom } from "@/state";
import { supabase, signOutFromAll } from "@/lib/supabase";
import "./Toolbar.css";

type ToolbarProps = {
  isMobile: boolean;
};

const Toolbar: React.FC<ToolbarProps> = ({ isMobile }) => {
  const { fetchBookmarks } = useBookmarks();
  const [showBookmarksOnly, setShowBookmarksOnly] = useRecoilState(showBookmarksOnlyAtom);
  const [localBookmarksState, setLocalBookmarksState] = React.useState(false);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [showAuthPanel, setShowAuthPanel] = React.useState(false);
  const [isSignedIn, setIsSignedIn] = React.useState(false);

  // Update local state whenever the recoil state changes
  React.useEffect(() => {
    setLocalBookmarksState(showBookmarksOnly);
  }, [showBookmarksOnly]);

  // Add effect to track auth state
  React.useEffect(() => {
    let mounted = true;

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setIsSignedIn(!!session);
      }
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setIsSignedIn(!!session);
        if (event === 'SIGNED_OUT') {
          // Clear any local state when signed out
          setShowBookmarksOnly(false);
          setLocalBookmarksState(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setShowBookmarksOnly]);

  const handleToggleBookmarks = () => {
    // Update local state immediately for the UI
    const newState = !localBookmarksState;
    setLocalBookmarksState(newState);
    
    // Update recoil state after a tick to allow UI to update first
    setTimeout(() => {
      setShowBookmarksOnly(newState);
    }, 0);
  };

  const handleCloudSync = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setShowAuthPanel(true);
      } else {
        setIsAuthenticating(true);
        const { error } = await signOutFromAll();
        if (error) throw error;
        
        // Clear local state
        setIsSignedIn(false);
        setShowAuthPanel(false);
        
        // Refresh bookmarks to switch to local storage
        await fetchBookmarks();
      }
    } catch (error) {
      console.error("Auth error:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    try {
      setIsAuthenticating(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      setShowAuthPanel(false);
    } catch (error) {
      console.error("Sign in error:", error);
      alert("Sign in failed. Please check your credentials and try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    try {
      setIsAuthenticating(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) throw error;
      
      // Wait for session to be established
      if (data.session) {
        setShowAuthPanel(false);
      } else {
        throw new Error("Failed to establish session after signup");
      }
    } catch (error) {
      console.error("Sign up error:", error);
      alert("Sign up failed. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <>
      <nav id="toolbar" className={`toolbar ${isMobile ? 'mobile-toolbar' : ''}`}>
        {isMobile ? (
          <>
            <div className="toolbar-controls">
              <StyleInput isMobile={true} />
              <SizeInput />
              <ColorInput />
            </div>
            <div className="toolbar-search">
              <SearchInput />
              <SettingsActions />
            </div>
          </>
        ) : (
          <div className="toolbar-contents">
            <StyleInput isMobile={false} />
            <SearchInput />
            <SizeInput />
            <ColorInput />
            <SettingsActions />
          </div>
        )}
        <div className="toolbar-features">
          <div className="feature-buttons">
            <button 
              className={`feature-button ${localBookmarksState ? "active" : ""}`}
              onClick={handleToggleBookmarks}
            >
              <Star size={16} weight={localBookmarksState ? "fill" : "regular"} />
              <span>Toggle Bookmarks</span>
            </button>
            <button 
              className={`feature-button ${isAuthenticating ? "disabled" : ""} ${isSignedIn ? "synced" : ""}`}
              onClick={handleCloudSync}
              disabled={isAuthenticating}
            >
              {isSignedIn ? (
                <CloudCheck size={16} weight="fill" />
              ) : (
                <CloudArrowUp size={16} />
              )}
              <span>
                {isAuthenticating 
                  ? "Syncing..." 
                  : isSignedIn 
                    ? "Synced" 
                    : "Cloud Sync"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <AuthPanel 
        isOpen={showAuthPanel}
        onClose={() => setShowAuthPanel(false)}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        isLoading={isAuthenticating}
      />
    </>
  );
};

export default Toolbar;
