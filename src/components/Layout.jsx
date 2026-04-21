import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Layout.css";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <header className="topbar">
        <button
          className={`hamburger ${open ? "hamburger--open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span /><span /><span />
        </button>
        <span className="topbar-title">⚙️ SysDesign</span>
      </header>

      {/* Overlay (mobile) */}
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <Sidebar open={open} onClose={() => setOpen(false)} />

      {/* Main content */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
