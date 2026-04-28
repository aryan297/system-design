import { useState } from "react";
import gopherImg from "../assets/gopher.png";
import "./CodeBlock.css";

// ── Syntax highlighting ──────────────────────────────────────────────────────
const GO_KEYWORDS = new Set([
  "package","import","func","return","if","else","for","range","var","const",
  "type","struct","interface","switch","case","default","break","continue",
  "go","defer","select","chan","nil","true","false","fallthrough","goto",
]);
const GO_TYPES = new Set([
  "int","int8","int16","int32","int64","uint","uint8","uint16","uint32","uint64",
  "float32","float64","complex64","complex128","string","bool","byte","rune",
  "error","any","uintptr",
]);
const GO_BUILTINS = new Set([
  "make","len","cap","append","copy","delete","close","new","panic","recover",
  "print","println","fmt","os","sort","strings","strconv","math",
]);

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightGo(raw) {
  const TOKEN =
    /(\/\/[^\n]*)|(\"(?:[^\"\\]|\\.)*\")|(`[^`]*`)|(\b[a-zA-Z_]\w*\b)|(\d+(?:\.\d+)?)/g;
  let result = "";
  let last = 0;
  let m;
  while ((m = TOKEN.exec(raw)) !== null) {
    if (m.index > last) result += esc(raw.slice(last, m.index));
    const [full, comment, strDQ, strBT, ident, num] = m;
    if (comment)      result += `<span class="go-comment">${esc(comment)}</span>`;
    else if (strDQ)   result += `<span class="go-string">${esc(strDQ)}</span>`;
    else if (strBT)   result += `<span class="go-string">${esc(strBT)}</span>`;
    else if (num)     result += `<span class="go-number">${esc(num)}</span>`;
    else if (ident) {
      if (GO_KEYWORDS.has(ident))  result += `<span class="go-kw">${esc(ident)}</span>`;
      else if (GO_TYPES.has(ident)) result += `<span class="go-type">${esc(ident)}</span>`;
      else if (GO_BUILTINS.has(ident)) result += `<span class="go-builtin">${esc(ident)}</span>`;
      else result += esc(ident);
    }
    last = m.index + full.length;
  }
  if (last < raw.length) result += esc(raw.slice(last));
  return result;
}

function filenameFor(label) {
  if (!label) return "code";
  const l = label.toLowerCase();
  if (l === "go") return "solution.go";
  if (l.includes("schema") || l.includes("sql")) return "schema.sql";
  return label;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const isGo = label?.toLowerCase() === "go";
  const filename = filenameFor(label);
  const lines = code.split("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="ide">
      {/* Title bar */}
      <div className="ide-titlebar">
        <div className="ide-dots">
          <span className="ide-dot ide-dot--red" />
          <span className="ide-dot ide-dot--yellow" />
          <span className="ide-dot ide-dot--green" />
        </div>
        <div className="ide-tabs">
          <div className="ide-tab">
            {isGo && <img src={gopherImg} alt="Go" className="ide-tab-gopher" />}
            {filename}
          </div>
        </div>
        <button className="ide-copy" onClick={handleCopy}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>

      {/* Editor body */}
      <div className="ide-body">
        <div className="ide-gutter" aria-hidden="true">
          {lines.map((_, i) => (
            <div key={i} className="ide-ln">{i + 1}</div>
          ))}
        </div>
        <pre className="ide-pre">
          {isGo ? (
            <code dangerouslySetInnerHTML={{ __html: highlightGo(code) }} />
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
