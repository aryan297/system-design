import { NavLink, useLocation } from "react-router-dom";
import { SYSTEMS } from "../data/systems";
import "./Sidebar.css";

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      {/* Logo row — desktop always visible, mobile inside drawer */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚙️</span>
        <span className="sidebar-logo-text">SysDesign</span>
        {/* Close button visible only on mobile */}
        <button className="sidebar-close" onClick={onClose} aria-label="Close sidebar">
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        <p className="sidebar-section-label">Systems</p>

        {SYSTEMS.map((sys) => {
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
                    className={({ isActive: a }) =>
                      `sidebar-sub-link ${a ? "active" : ""}`
                    }
                  >
                    HLD
                    <span className="badge badge-neutral">High Level</span>
                  </NavLink>
                  <NavLink
                    to={`/${sys.id}/lld`}
                    className={({ isActive: a }) =>
                      `sidebar-sub-link ${a ? "active" : ""}`
                    }
                  >
                    LLD
                    <span className="badge badge-neutral">Low Level</span>
                  </NavLink>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-footer-text">Add more systems as you study</p>
      </div>
    </aside>
  );
}
