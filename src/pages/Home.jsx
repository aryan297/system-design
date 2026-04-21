import { Link } from "react-router-dom";
import { SYSTEMS } from "../data/systems";
import "./Home.css";

export default function Home() {
  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-hero-title">System Design Studio</h1>
        <p className="home-hero-sub">
          Deep-dive HLD &amp; LLD breakdowns — architected for study, built to scale.
        </p>
        <div className="home-hero-author">
          <div className="home-author-avatar">AA</div>
          <div className="home-author-text">
            <span className="home-author-by">Designed &amp; built by</span>
            <span className="home-author-name">Aryan Aman</span>
          </div>
          <a
            href="https://github.com/aryan297"
            target="_blank"
            rel="noopener noreferrer"
            className="home-github-link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            aryan297
          </a>
        </div>
      </div>

      <div className="home-grid">
        {SYSTEMS.map((sys) => (
          <div key={sys.id} className="system-card">
            <div className="system-card-top">
              <span className="system-card-icon">{sys.icon}</span>
              <span className="system-card-name">{sys.name}</span>
            </div>
            <p className="system-card-desc">{sys.description}</p>
            <div className="system-card-links">
              <Link to={`/${sys.id}/hld`} className="system-card-link hld-link">
                HLD <span className="system-card-link-arrow">→</span>
              </Link>
              <Link to={`/${sys.id}/lld`} className="system-card-link lld-link">
                LLD <span className="system-card-link-arrow">→</span>
              </Link>
            </div>
          </div>
        ))}

        {/* Placeholder for future systems */}
        <div className="system-card system-card--placeholder">
          <div className="system-card-top">
            <span className="system-card-icon">+</span>
            <span className="system-card-name">More Coming</span>
          </div>
          <p className="system-card-desc">
            Twitter · Uber · WhatsApp · Google Search — add systems as you study
          </p>
        </div>
      </div>
    </div>
  );
}
