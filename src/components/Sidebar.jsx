import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SYSTEMS } from "../data/systems";
import { DSA_CATEGORIES } from "../data/dsa";
import "./Sidebar.css";

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const inDSA = location.pathname.startsWith("/dsa");
  const [systemsOpen, setSystemsOpen] = useState(!inDSA);
  const [dsaOpen, setDsaOpen] = useState(inDSA);

  return (
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚙️</span>
        <span className="sidebar-logo-text">SysDesign</span>
        <button className="sidebar-close" onClick={onClose} aria-label="Close sidebar">
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* ── Systems ── */}
        <button className="sidebar-section-toggle" onClick={() => setSystemsOpen((v) => !v)}>
          <span>Systems</span>
          <span className="sidebar-section-chevron">{systemsOpen ? "▾" : "▸"}</span>
        </button>

        {systemsOpen && SYSTEMS.map((sys) => {
          const isActive = location.pathname.startsWith(`/${sys.id}`);
          return (
            <div key={sys.id} className={`sidebar-system ${isActive ? "open" : ""}`}>
              <NavLink
                to={`/${sys.id}/hld`}
                className={({ isActive: a }) =>
                  `sidebar-system-link ${a || isActive ? "active" : ""}`
                }
              >
                <span className="sidebar-system-icon">{sys.icon}</span>
                <span className="sidebar-system-name">{sys.name}</span>
              </NavLink>

              {isActive && (
                <div className="sidebar-sub">
                  <NavLink
                    to={`/${sys.id}/hld`}
                    className={({ isActive: a }) => `sidebar-sub-link ${a ? "active" : ""}`}
                  >
                    HLD
                    <span className="badge badge-neutral">High Level</span>
                  </NavLink>
                  <NavLink
                    to={`/${sys.id}/lld`}
                    className={({ isActive: a }) => `sidebar-sub-link ${a ? "active" : ""}`}
                  >
                    LLD
                    <span className="badge badge-neutral">Low Level</span>
                  </NavLink>
                </div>
              )}
            </div>
          );
        })}

        {/* ── DSA ── */}
        <button
          className="sidebar-section-toggle"
          style={{ marginTop: "10px" }}
          onClick={() => setDsaOpen((v) => !v)}
        >
          <span>DSA — Go</span>
          <span className="sidebar-section-chevron">{dsaOpen ? "▾" : "▸"}</span>
        </button>

        {dsaOpen && DSA_CATEGORIES.map((cat) => {
          const catPath = `/dsa/${cat.id}`;
          const isCatOpen = location.pathname.startsWith(catPath);
          return (
            <div key={cat.id} className="sidebar-system">
              <NavLink
                to={`${catPath}/${cat.problems[0].id}`}
                className={`sidebar-system-link ${isCatOpen ? "active" : ""}`}
              >
                <span className="sidebar-system-icon">{cat.icon}</span>
                <span className="sidebar-system-name">{cat.title}</span>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                  {isCatOpen ? "▾" : "▸"}
                </span>
              </NavLink>

              {isCatOpen && (
                <div className="sidebar-sub">
                  {cat.problems.map((p, idx) => (
                    <NavLink
                      key={p.id}
                      to={`${catPath}/${p.id}`}
                      className={({ isActive: a }) => `sidebar-sub-link ${a ? "active" : ""}`}
                    >
                      <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", minWidth: 16 }}>
                        {idx + 1}.
                      </span>
                      {p.title}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>


      <div className="sidebar-footer">
        <div className="sidebar-author">
          <div className="sidebar-author-avatar">AA</div>
          <div className="sidebar-author-info">
            <span className="sidebar-author-name">Aryan Aman</span>
            <span className="sidebar-author-label">Designed &amp; Built</span>
          </div>
          <a
            href="https://github.com/aryan297"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-github-btn"
            aria-label="GitHub"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
        </div>
        <p className="sidebar-footer-text">Add more systems as you study</p>
      </div>
    </aside>
  );
}
