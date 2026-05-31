import { useParams, useNavigate, NavLink } from "react-router-dom";
import { GO_BASICS_CATEGORIES } from "../data/goBasics";
import CodeBlock from "../components/CodeBlock";
import gopherImg from "../assets/gopher.png";
import "./GoBasicsPage.css";

export default function GoBasicsPage() {
  const { categoryId, topicId } = useParams();
  const navigate = useNavigate();

  const category = GO_BASICS_CATEGORIES.find((c) => c.id === categoryId);
  const topic = category?.topics.find((t) => t.id === topicId);

  if (!category || !topic) {
    const first = GO_BASICS_CATEGORIES[0];
    navigate(`/go-basics/${first.id}/${first.topics[0].id}`, { replace: true });
    return null;
  }

  const totalTopics = GO_BASICS_CATEGORIES.reduce((s, c) => s + c.topics.length, 0);

  // Flat list for prev/next navigation
  const allTopics = GO_BASICS_CATEGORIES.flatMap((c) =>
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
          <img src={gopherImg} alt="Go Gopher" className="gb-panel-gopher" />
          <div>
            <div className="gb-panel-title">Go Basics</div>
            <div className="gb-panel-sub">{totalTopics} topics · gobyexample style</div>
          </div>
        </div>

        {GO_BASICS_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="gb-cat">
              <NavLink
                to={`/go-basics/${cat.id}/${cat.topics[0].id}`}
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
                      to={`/go-basics/${cat.id}/${t.id}`}
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
            <span className="gb-badge">Go Basics</span>
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

        {/* Conversion Examples — optional */}
        {topic.examples && topic.examples.length > 0 && (
          <section className="gb-section">
            <h2 className="gb-section-title">Conversion Examples</h2>
            <div className="gb-examples-table">
              <div className="gb-examples-head">
                <span>Expression</span>
                <span>Result</span>
                <span>Notes</span>
              </div>
              {topic.examples.map((ex, i) => (
                <div key={i} className="gb-examples-row">
                  <code className="gb-ex-expr">{ex.expr}</code>
                  <code className="gb-ex-result">{ex.result}</code>
                  <span className="gb-ex-note">{ex.note}</span>
                </div>
              ))}
            </div>
          </section>
        )}

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
              to={`/go-basics/${prevTopic.categoryId}/${prevTopic.id}`}
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
              to={`/go-basics/${nextTopic.categoryId}/${nextTopic.id}`}
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
