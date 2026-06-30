import { useParams, useNavigate, NavLink } from "react-router-dom";
import { SDI_CATEGORIES } from "../data/sdInterview";
import "./SDInterviewPage.css";

const DIFF_CLASS = { Easy: "sdi-diff-easy", Medium: "sdi-diff-medium", Hard: "sdi-diff-hard" };

const CATEGORY_LABELS = SDI_CATEGORIES.reduce((acc, c) => {
  acc[c.id] = c.title;
  return acc;
}, {});

export default function SDInterviewPage() {
  const { categoryId, problemId } = useParams();
  const navigate = useNavigate();

  const category = SDI_CATEGORIES.find((c) => c.id === categoryId);
  const problem = category?.problems.find((p) => p.id === problemId);

  if (!category || !problem) {
    const first = SDI_CATEGORIES[0];
    navigate(`/system-design-guide/${first.id}/${first.problems[0].id}`, { replace: true });
    return null;
  }

  return (
    <div className="sdi-layout">
      {/* ── Left panel ── */}
      <aside className="sdi-panel">
        <div className="sdi-panel-header">
          <span className="sdi-panel-icon">🧭</span>
          <div>
            <div className="sdi-panel-title">System Design Interview Guide</div>
            <div className="sdi-panel-sub">
              {SDI_CATEGORIES.reduce((s, c) => s + c.problems.length, 0)} questions · HLD + LLD + Cheat Sheet
            </div>
          </div>
        </div>

        {SDI_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="sdi-cat">
              <NavLink
                to={`/system-design-guide/${cat.id}/${cat.problems[0].id}`}
                className={`sdi-cat-header ${isOpen ? "sdi-cat-header--open" : ""}`}
              >
                <span className="sdi-cat-icon">{cat.icon}</span>
                <span className="sdi-cat-title">{cat.title}</span>
                <span className="sdi-cat-chevron">{isOpen ? "▾" : "▸"}</span>
              </NavLink>

              {isOpen && (
                <div className="sdi-problem-list">
                  {cat.problems.map((p, idx) => (
                    <NavLink
                      key={p.id}
                      to={`/system-design-guide/${cat.id}/${p.id}`}
                      className={({ isActive }) =>
                        `sdi-problem-item ${isActive ? "sdi-problem-item--active" : ""}`
                      }
                    >
                      <span className="sdi-problem-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="sdi-problem-name">{p.title}</span>
                      <span className={`sdi-diff ${DIFF_CLASS[p.difficulty]}`}>
                        {p.difficulty}
                      </span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {/* ── Right panel ── */}
      <main className="sdi-detail">
        {/* Header */}
        <div className="sdi-detail-header">
          <div className="sdi-detail-meta">
            <span className="sdi-badge">{category.icon} {CATEGORY_LABELS[problem.category]}</span>
            <span className={`sdi-diff sdi-diff--lg ${DIFF_CLASS[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
          </div>
          <h1 className="sdi-detail-title">{problem.title}</h1>
        </div>

        {/* The Question */}
        <section className="sdi-section">
          <div className="sdi-section-label sdi-label-question">
            <span className="sdi-label-icon">🎤</span>
            <h2 className="sdi-section-title">Interview Question</h2>
          </div>
          <p className="sdi-question-text">{problem.question}</p>
        </section>

        {/* Model Answer */}
        <section className="sdi-section">
          <div className="sdi-section-label sdi-label-answer">
            <span className="sdi-label-icon">🧩</span>
            <h2 className="sdi-section-title">Model Answer</h2>
          </div>
          <div className="sdi-answer-short">{problem.answer.short}</div>
          {Array.isArray(problem.answer.detailed) ? (
            <ul className="sdi-answer-detailed-list">
              {problem.answer.detailed.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="sdi-answer-detailed">{problem.answer.detailed}</p>
          )}
        </section>

        {/* Entity model */}
        {problem.entities && problem.entities.length > 0 && (
          <section className="sdi-section">
            <div className="sdi-section-label sdi-label-entities">
              <span className="sdi-label-icon">🗂️</span>
              <h2 className="sdi-section-title">Entity Model</h2>
            </div>
            <div className="sdi-entities">
              {problem.entities.map((ent, i) => (
                <div key={i} className="sdi-entity-card">
                  <div className="sdi-entity-name">{ent.name}</div>
                  <div className="sdi-entity-desc">{ent.description}</div>
                  <ul className="sdi-entity-fields">
                    {ent.fields.map((f, j) => (
                      <li key={j}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* What a strong answer covers */}
        <section className="sdi-section">
          <div className="sdi-section-label sdi-label-points">
            <span className="sdi-label-icon">✅</span>
            <h2 className="sdi-section-title">What a Strong Answer Covers</h2>
          </div>
          <ul className="sdi-points">
            {problem.keyPoints.map((kp, i) => (
              <li key={i} className="sdi-point-card">
                <div className="sdi-point-text">{kp.point}</div>
                <div className="sdi-point-row sdi-point-row--example">
                  <span className="sdi-point-tag sdi-point-tag--example">Example</span>
                  <span>{kp.example}</span>
                </div>
                <div className="sdi-point-row sdi-point-row--best">
                  <span className="sdi-point-tag sdi-point-tag--best">Best way to design it</span>
                  <span>{kp.bestApproach}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Real-world example */}
        <section className="sdi-section">
          <div className="sdi-section-label sdi-label-example">
            <span className="sdi-label-icon">🌍</span>
            <h2 className="sdi-section-title">Real-World Example</h2>
          </div>
          <p className="sdi-example-text">{problem.example}</p>
        </section>

        {/* Likely follow-ups */}
        {problem.followUps.length > 0 && (
          <section className="sdi-section sdi-section--last">
            <div className="sdi-section-label sdi-label-followups">
              <span className="sdi-label-icon">🔁</span>
              <h2 className="sdi-section-title">Likely Follow-Up Questions</h2>
            </div>
            <ul className="sdi-followups">
              {problem.followUps.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
