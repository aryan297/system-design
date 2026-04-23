import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getSystem } from "../data/index";
import PageHeader from "../components/PageHeader";
import DiagramBlock from "../components/DiagramBlock";
import MetricsTable from "../components/MetricsTable";
import SectionCard from "../components/SectionCard";
import ContentText from "../components/ContentText";
import QnASection from "../components/QnASection";
import "./SystemHLD.css";

const TABS = ["Study", "Interview Q&A"];

export default function SystemHLD() {
  const { systemId } = useParams();
  const system = getSystem(systemId);

  const [activeTab, setActiveTab] = useState("Study");
  const [activePhase, setActivePhase] = useState(system?.hld?.phases?.[0]?.id ?? "");

  if (!system) return <Navigate to="/" replace />;

  const { hld, qna, meta } = system;
  const current = hld.phases.find((p) => p.id === activePhase) ?? hld.phases[0];

  return (
    <div className="hld-page">
      <PageHeader icon={meta.icon} title={hld.title} subtitle={hld.subtitle} type="HLD" />

      {/* Tab bar */}
      <div className="hld-tab-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`hld-tab-btn ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "Interview Q&A" && (
              <span className="hld-tab-badge">{qna.length}</span>
            )}
            {t}
          </button>
        ))}
      </div>

      {/* ── STUDY ── */}
      {activeTab === "Study" && (
        <>
          <div className="hld-overview">
            <SectionCard title="System Overview">
              <ContentText text={hld.overview} />
            </SectionCard>
          </div>

          <div className="hld-section">
            <DiagramBlock diagram={hld.diagram} title="Architecture Diagram" />
          </div>

          <div className="hld-section">
            <h2 className="hld-section-title">Key Metrics</h2>
            <MetricsTable metrics={hld.metrics} />
          </div>

          <div className="hld-section">
            <h2 className="hld-section-title">Study Phases</h2>
            <div className="phase-layout">
              <div className="phase-tabs">
                {hld.phases.map((p) => (
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

      {/* ── Q&A ── */}
      {activeTab === "Interview Q&A" && (
        <div className="hld-section">
          <div className="qna-header-row">
            <div>
              <h2 className="hld-section-title" style={{ marginBottom: 4 }}>
                FAANG Interview Questions
              </h2>
              <p className="qna-header-sub">
                {qna.length} questions — click to reveal model answers
              </p>
            </div>
            <div className="qna-stats">
              {["Hard", "Medium", "Easy"].map((d) => {
                const count = qna.filter((q) => q.difficulty === d).length;
                if (!count) return null;
                const cls = { Hard: "diff-hard", Medium: "diff-medium", Easy: "diff-easy" }[d];
                return (
                  <span key={d} className={`qna-diff ${cls}`} style={{ padding: "4px 10px" }}>
                    {count} {d}
                  </span>
                );
              })}
            </div>
          </div>
          <QnASection questions={qna} />
        </div>
      )}
    </div>
  );
}
