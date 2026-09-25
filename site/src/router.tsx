import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

interface Location {
  path: string;
  hash: string;
}
const RouterContext = createContext<{ location: Location; navigate(to: string, opts?: { replace?: boolean }): void } | null>(null);

const current = (): Location => ({ path: window.location.pathname.replace(/\/+$/, "") || "/", hash: window.location.hash });

export function Router({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState(current);
  useEffect(() => {
    const onPop = () => setLocation(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to: string, opts: { replace?: boolean } = {}) => {
    const url = new URL(to, window.location.href);
    const samePage = url.pathname === window.location.pathname;
    if (opts.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setLocation(current());
    if (url.hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (el) el.scrollIntoView({ behavior: samePage ? "smooth" : "auto", block: "start" });
      });
    } else if (!samePage) window.scrollTo({ top: 0 });
  }, []);
  return <RouterContext.Provider value={{ location, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw Error("useRouter outside Router");
  return ctx;
}

/** An anchor that navigates client-side for same-origin links. */
export function Link({ href = "", onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isInternal(href)) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

export function isInternal(href: string) {
  if (!href || /^(https?:|mailto:)/.test(href)) return false;
  if (href.startsWith("/examples/")) return false;
  return href.startsWith("/") || href.startsWith("#");
}
