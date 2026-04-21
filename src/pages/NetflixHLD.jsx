import { useState } from "react";
import { NETFLIX_HLD, NETFLIX_QNA } from "../data/netflix";
import PageHeader from "../components/PageHeader";
import DiagramBlock from "../components/DiagramBlock";
import MetricsTable from "../components/MetricsTable";
import SectionCard from "../components/SectionCard";
import ContentText from "../components/ContentText";
import QnASection from "../components/QnASection";
import "./NetflixHLD.css";

const TABS = ["Study", "Interview Q&A"];

export default function NetflixHLD() {
  const [activePhase, setActivePhase] = useState(NETFLIX_HLD.phases[0].id);
  const [activeTab, setActiveTab] = useState("Study");
  const current = NETFLIX_HLD.phases.find((p) => p.id === activePhase);

  return (
    <div className="hld-page">
      <PageHeader
        icon="🎬"
        title={NETFLIX_HLD.title}
        subtitle={NETFLIX_HLD.subtitle}
        type="HLD"
      />

      {/* Top-level tab bar */}
      <div className="hld-tab-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`hld-tab-btn ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "Interview Q&A" && <span className="hld-tab-badge">{NETFLIX_QNA.length}</span>}
            {t}
          </button>
        ))}
      </div>

      {/* ── STUDY TAB ── */}
      {activeTab === "Study" && (
        <>
          {/* Overview */}
          <div className="hld-overview">
            <SectionCard title="System Overview">
              <ContentText text={NETFLIX_HLD.overview} />
            </SectionCard>
          </div>

          {/* Architecture Diagram */}
          <div className="hld-section">
            <DiagramBlock diagram={NETFLIX_HLD.diagram} title="Architecture Diagram" />
          </div>

          {/* Key Metrics */}
          <div className="hld-section">
            <h2 className="hld-section-title">Key Metrics</h2>
            <MetricsTable metrics={NETFLIX_HLD.metrics} />
          </div>

          {/* Phase Navigation + Content */}
          <div className="hld-section">
            <h2 className="hld-section-title">Study Phases</h2>
            <div className="phase-layout">
              <div className="phase-tabs">
                {NETFLIX_HLD.phases.map((p) => (
                  <button
                    key={p.id}
                    className={`phase-tab ${activePhase === p.id ? "active" : ""}`}
                    onClick={() => setActivePhase(p.id)}
                  >
                    <span className="phase-tab-label">{p.label}</span>
                    <span className="phase-tab-title">{p.title}</span>
                  </button>
                ))}
              </div>

              <div className="phase-content">
                <div className="phase-content-header">
                  <span className="badge badge-accent">{current.label}</span>
                  <h3 className="phase-content-title">{current.title}</h3>
                </div>
                <div className="phase-sections">
                  {current.sections.map((s, i) => (
                    <div key={i} className="phase-section">
                      <h4 className="phase-section-title">{s.title}</h4>
                      <ContentText text={s.content} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INTERVIEW Q&A TAB ── */}
      {activeTab === "Interview Q&A" && (
        <div className="hld-section">
          <div className="qna-header-row">
            <div>
              <h2 className="hld-section-title" style={{ marginBottom: 4 }}>FAANG Interview Questions</h2>
              <p className="qna-header-sub">
                {NETFLIX_QNA.length} questions asked at Netflix, Google, Meta, Amazon — click to reveal model answers
              </p>
            </div>
            <div className="qna-stats">
              {["Hard", "Medium", "Easy"].map((d) => {
                const count = NETFLIX_QNA.filter((q) => q.difficulty === d).length;
                const cls = { Hard: "diff-hard", Medium: "diff-medium", Easy: "diff-easy" }[d];
                return (
                  <span key={d} className={`qna-diff ${cls}`} style={{ padding: "4px 10px" }}>
                    {count} {d}
                  </span>
                );
              })}
            </div>
          </div>
          <QnASection questions={NETFLIX_QNA} />
        </div>
      )}
    </div>
  );
}
