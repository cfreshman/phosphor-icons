import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XCircle, User, Lock, CloudArrowUp } from "@phosphor-icons/react";
import { useMediaQuery, useSessionStorage } from "@/hooks";
import Tabs, { Tab } from "@/components/Tabs";
import "./AuthPanel.css";

interface AuthPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  isLoading: boolean;
}

const variants = {
  desktop: {
    initial: { y: 188 },
    animate: { y: 0 },
    exit: { y: 188 },
  },
  mobile: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
};

const AuthPanel: React.FC<AuthPanelProps> = ({ 
  isOpen, 
  onClose, 
  onSignIn,
  onSignUp, 
  isLoading 
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [i, setInitialTab] = useSessionStorage("auth_tab", 0);
  const isMobile = useMediaQuery("(max-width: 719px)");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (i === 0) {
      await onSignIn(email, password);
    } else {
      await onSignUp(email, password);
    }
    setEmail("");
    setPassword("");
  };

  const tabs: Tab[] = [
    {
      header: "Sign In",
      content: (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <User size={16} />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="input-group">
            <Lock size={16} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <button 
            type="submit" 
            className="auth-submit"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )
    },
    {
      header: "Sign Up",
      content: (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <User size={16} />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="input-group">
            <Lock size={16} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <button 
            type="submit" 
            className="auth-submit"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>
      )
    }
  ];

  return (
    <AnimatePresence initial={true}>
      {isOpen && (
        <div className="auth-panel-container">
          <motion.aside
            initial="initial"
            animate="animate"
            exit="exit"
            variants={isMobile ? variants.mobile : variants.desktop}
            className="auth-panel secondary detail-footer card"
            transition={isMobile ? { duration: 0.25 } : { duration: 0.1 }}
          >
            <div className="detail-preview">
              <figure>
                <CloudArrowUp size={64} />
                <figcaption>
                  <p>Cloud Sync</p>
                  <small className="versioning">
                    Sync your bookmarks across devices
                  </small>
                </figcaption>
              </figure>
            </div>

            <Tabs tabs={tabs} initialIndex={i} onTabChange={setInitialTab} />

            <button
              tabIndex={0}
              className="close-button"
              onClick={onClose}
              onKeyDown={(e) => {
                e.key === "Enter" && onClose();
              }}
            >
              <XCircle color="currentColor" size={28} weight="fill" />
            </button>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AuthPanel; 