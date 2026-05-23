import { useState, useMemo } from "react";
import { SD_CATEGORIES } from "../data/systemDesignEncyclopedia";
import "./EncyclopediaPage.css";

const LEVEL_LABEL = { basic: "Basic", inter: "Inter", adv: "Advanced", expert: "Expert", phd: "PhD" };

function TopicCard({ topic, color }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ep-topic">
      <button className="ep-topic-header" onClick={() => setOpen((v) => !v)}>
        <span className="ep-topic-name" style={{ color: `${color}dd` }}>
          {topic.name}
        </span>
        <span className={`ep-level-badge level-${topic.level}`}>
          {LEVEL_LABEL[topic.level] ?? topic.level}
        </span>
        <span
          className="ep-topic-chevron"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          <p className="ep-topic-desc">{topic.desc}</p>
          {topic.brief && (
            <div className="ep-brief">
              {topic.brief.what && (
                <div className="ep-brief-section">
                  <span className="ep-brief-label" style={{ color }}>What</span>
                  <p className="ep-brief-text">{topic.brief.what}</p>
                </div>
              )}
              {topic.brief.why && (
                <div className="ep-brief-section">
                  <span className="ep-brief-label" style={{ color }}>Why it matters</span>
                  <p className="ep-brief-text">{topic.brief.why}</p>
                </div>
              )}
              {topic.brief.how && (
                <div className="ep-brief-section">
                  <span className="ep-brief-label" style={{ color }}>How it works</span>
                  <p className="ep-brief-text">{topic.brief.how}</p>
                </div>
              )}
              {topic.brief.tradeoffs && (
                <div className="ep-brief-section">
                  <span className="ep-brief-label" style={{ color }}>Trade-offs</span>
                  <p className="ep-brief-text">{topic.brief.tradeoffs}</p>
                </div>
              )}
              {topic.brief.example && (
                <div className="ep-brief-section ep-brief-example">
                  <span className="ep-brief-label">Real example</span>
                  <p className="ep-brief-text">{topic.brief.example}</p>
                </div>
              )}
              {topic.brief.interview && (
                <div className="ep-brief-section ep-brief-interview">
                  <span className="ep-brief-label">Interview tip</span>
                  <p className="ep-brief-text">{topic.brief.interview}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CategorySection({ category, isOpen, onToggle, filteredTopics }) {
  const topics = filteredTopics ?? category.topics;
  if (topics.length === 0) return null;

  return (
    <section className="ep-category" id={category.id}>
      <button
        className="ep-category-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="ep-category-num">{category.num}</span>
        <h2 className="ep-category-title" style={{ color: category.color }}>
          {category.title}
        </h2>
        <span className="ep-category-count">{topics.length} topics</span>
        <span
          className="ep-category-chevron"
          style={{
            color: category.color,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="ep-topic-list">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} color={category.color} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function EncyclopediaPage() {
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState(
    Object.fromEntries(SD_CATEGORIES.map((c) => [c.id, true]))
  );

  const toggle = (id) => setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  const allOpen = Object.values(openCats).every(Boolean);
  const toggleAll = () =>
    setOpenCats(Object.fromEntries(SD_CATEGORIES.map((c) => [c.id, !allOpen])));

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return SD_CATEGORIES.map((c) => ({ ...c, filteredTopics: null }));
    return SD_CATEGORIES.map((c) => ({
      ...c,
      filteredTopics: c.topics.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          (t.brief?.what ?? "").toLowerCase().includes(q)
      ),
    }));
  }, [q]);

  const totalVisible = filtered.reduce(
    (s, c) => s + (c.filteredTopics ?? c.topics).length,
    0
  );

  const totalTopics = SD_CATEGORIES.reduce((s, c) => s + c.topics.length, 0);

  return (
    <div className="ep-page">
      <header className="ep-header">
        <p className="ep-eyebrow">Interview Reference</p>
        <h1 className="ep-title">
          System Design <em>Encyclopedia</em>
        </h1>
        <p className="ep-subtitle">
          {totalTopics} topics · {SD_CATEGORIES.length} categories · Basic → PhD
        </p>
        <div className="ep-search-wrap">
          <span className="ep-search-icon">⌕</span>
          <input
            className="ep-search"
            type="text"
            placeholder="Search topics, concepts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <nav className="ep-nav">
        {SD_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className="ep-nav-pill"
            style={{ color: c.color, borderColor: `${c.color}44` }}
            onClick={() => {
              setOpenCats((prev) => ({ ...prev, [c.id]: true }));
              document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {c.title}
          </button>
        ))}
      </nav>

      <div className="ep-controls">
        <span className="ep-result-count">
          {q ? `${totalVisible} of ${totalTopics} topics` : `${totalTopics} topics`}
        </span>
        <button className="ep-toggle-all" onClick={toggleAll}>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <main className="ep-main">
        {totalVisible === 0 ? (
          <div className="ep-empty">No topics match "{query}"</div>
        ) : (
          filtered.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              isOpen={openCats[cat.id]}
              onToggle={() => toggle(cat.id)}
              filteredTopics={cat.filteredTopics}
            />
          ))
        )}
      </main>
    </div>
  );
}
