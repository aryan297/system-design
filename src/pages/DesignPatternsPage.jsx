import { useParams, useNavigate, NavLink } from "react-router-dom";
import { DESIGN_PATTERNS_CATEGORIES } from "../data/designPatterns";
import CodeBlock from "../components/CodeBlock";
import gopherImg from "../assets/gopher.png";
import "./GoBasicsPage.css";

export default function DesignPatternsPage() {
  const { categoryId, topicId } = useParams();
  const navigate = useNavigate();

  const category = DESIGN_PATTERNS_CATEGORIES.find((c) => c.id === categoryId);
  const topic = category?.topics.find((t) => t.id === topicId);

  if (!category || !topic) {
    const first = DESIGN_PATTERNS_CATEGORIES[0];
    navigate(`/design-patterns/${first.id}/${first.topics[0].id}`, { replace: true });
    return null;
  }

  const totalTopics = DESIGN_PATTERNS_CATEGORIES.reduce((s, c) => s + c.topics.length, 0);

  // Flat list for prev/next navigation
  const allTopics = DESIGN_PATTERNS_CATEGORIES.flatMap((c) =>
    c.topics.map((t) => ({ ...t, categoryId: c.id }))
  );
  const currentIdx = allTopics.findIndex(
    (t) => t.categoryId === categoryId && t.id === topicId
  );
  const prevTopic = currentIdx > 0 ? allTopics[currentIdx - 1] : null;
  const nextTopic = currentIdx < allTopics.length - 1 ? allTopics[currentIdx + 1] : null;

  return (
    <div className="gb-layout">
      {/* ── Left panel ── */}
      <aside className="gb-panel">
        <div className="gb-panel-header">
          <span style={{ fontSize: "1.6rem" }}>🏛️</span>
          <div>
            <div className="gb-panel-title">Design Patterns</div>
            <div className="gb-panel-sub">{totalTopics} patterns · GoF, Go examples</div>
          </div>
        </div>

        {DESIGN_PATTERNS_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="gb-cat">
              <NavLink
                to={`/design-patterns/${cat.id}/${cat.topics[0].id}`}
                className={`gb-cat-header ${isOpen ? "gb-cat-header--open" : ""}`}
              >
                <span className="gb-cat-icon">{cat.icon}</span>
                <span className="gb-cat-title">{cat.title}</span>
                <span className="gb-cat-count">{cat.topics.length}</span>
                <span className="gb-cat-chevron">{isOpen ? "▾" : "▸"}</span>
              </NavLink>

              {isOpen && (
                <div className="gb-topic-list">
                  {cat.topics.map((t, idx) => (
                    <NavLink
                      key={t.id}
                      to={`/design-patterns/${cat.id}/${t.id}`}
                      className={({ isActive }) =>
                        `gb-topic-item ${isActive ? "gb-topic-item--active" : ""}`
                      }
                    >
                      <span className="gb-topic-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="gb-topic-name">{t.title}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {/* ── Right panel ── */}
      <main className="gb-detail">
        {/* Header */}
        <div className="gb-detail-header">
          <div className="gb-detail-meta">
            <span className="gb-badge">Design Patterns</span>
            <span className="gb-cat-badge">{category.icon} {category.title}</span>
            <span className="gb-lang-badge">
              <img src={gopherImg} alt="Go" className="gb-gopher-sm" />
              Go
            </span>
          </div>
          <h1 className="gb-detail-title">{topic.title}</h1>
          <p className="gb-detail-summary">{topic.summary}</p>
        </div>

        {/* Explanation */}
        <section className="gb-section">
          <h2 className="gb-section-title">Explanation</h2>
          <p className="gb-explanation">{topic.explanation}</p>
        </section>

        {/* Key Points */}
        <section className="gb-section">
          <h2 className="gb-section-title">Key Points</h2>
          <ul className="gb-key-points">
            {topic.keyPoints.map((point, i) => (
              <li key={i} className="gb-key-point">
                <span className="gb-key-bullet">→</span>
                <span className="gb-key-text">{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Gotchas — optional */}
        {topic.gotchas && topic.gotchas.length > 0 && (
          <section className="gb-section">
            <h2 className="gb-section-title">Common Gotchas</h2>
            <ul className="gb-gotchas">
              {topic.gotchas.map((g, i) => (
                <li key={i} className="gb-gotcha">
                  <span className="gb-gotcha-icon">⚠</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Code */}
        <section className="gb-section">
          <h2 className="gb-section-title">Go Code</h2>
          <CodeBlock code={topic.code} label="Go" />
        </section>

        {/* Prev / Next navigation */}
        <div className="gb-nav-footer">
          {prevTopic ? (
            <NavLink
              to={`/design-patterns/${prevTopic.categoryId}/${prevTopic.id}`}
              className="gb-nav-btn gb-nav-btn--prev"
            >
              <span className="gb-nav-arrow">←</span>
              <span className="gb-nav-label">
                <span className="gb-nav-hint">Previous</span>
                <span className="gb-nav-name">{prevTopic.title}</span>
              </span>
            </NavLink>
          ) : (
            <div />
          )}

          {nextTopic ? (
            <NavLink
              to={`/design-patterns/${nextTopic.categoryId}/${nextTopic.id}`}
              className="gb-nav-btn gb-nav-btn--next"
            >
              <span className="gb-nav-label">
                <span className="gb-nav-hint">Next</span>
                <span className="gb-nav-name">{nextTopic.title}</span>
              </span>
              <span className="gb-nav-arrow">→</span>
            </NavLink>
          ) : (
            <div />
          )}
        </div>
      </main>
    </div>
  );
}
