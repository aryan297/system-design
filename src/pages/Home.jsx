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
