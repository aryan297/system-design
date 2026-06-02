export const CLAUDECODE_HLD = {
  title: "Claude Code — High Level Design",
  subtitle: "How an AI coding agent turns a text prompt into multi-step tool execution",

  overview: `Claude Code is Anthropic's CLI-based AI software engineering agent. It is not a chatbot that writes code in a text box — it is a reasoning agent that reads your files, runs commands, edits code, and iterates until the task is done.

The foundational architecture is an agentic loop: a tight cycle of (1) assemble context, (2) call the Claude API with tool definitions, (3) if the model calls a tool → execute it, inject the result back into context, and call the API again. This repeats until Claude produces a final text response. No tool call = end of turn.

Three design pillars that make Claude Code different from a simple API wrapper:
1. Stateful context management — the full conversation history, file reads, bash outputs, and git state are maintained across every iteration of the loop. Claude "sees" its own tool results.
2. Tool-first design — every concrete action (read a file, run a test, edit code) is a structured tool with a JSON schema. The model decides which tool to call and with what arguments; the agent runtime executes it.
3. Permission & safety layer — every tool invocation passes through a permission check before execution. Users can configure allowlists, block patterns, or require approval for any tool class.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER (Terminal)                                │
│              claude "fix the failing tests in src/auth"                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ user message
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLAUDE CODE CLI PROCESS                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    AGENTIC LOOP (core engine)                   │   │
│  │                                                                  │   │
│  │  ┌──────────────┐   API call    ┌─────────────────────────┐    │   │
│  │  │Context Builder│──────────────►  Anthropic Claude API   │    │   │
│  │  │              │               │  (claude-sonnet-4-6 /   │    │   │
│  │  │• Conversation │◄─────────────│   claude-opus-4-8)      │    │   │
│  │  │  history      │  stream resp  └─────────┬───────────────┘    │   │
│  │  │• CLAUDE.md    │                         │                    │   │
│  │  │• System prompt│          ┌──────────────▼──────────────┐    │   │
│  │  │• Tool schemas │          │   Response Router            │    │   │
│  │  └──────────────┘          │   text? → stream to terminal │    │   │
│  │         ▲                  │   tool_use? → Tool Dispatcher │    │   │
│  │         │ tool result      └──────────────┬───────────────┘    │   │
│  │         │ injected                        │ tool_use block     │   │
│  │  ┌──────┴──────────────────────────────────▼──────────────┐    │   │
│  │  │                   Tool Dispatcher                       │    │   │
│  │  │  Permission Check → Execute → Format Result            │    │   │
│  │  └──────────────────────────────────────────────────────-─┘    │   │
│  └──────────────────────────────────────────────────────────────---┘   │
│                                                                         │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  Bash Tool  │  │  Read Tool │  │   Edit/Write  │  │  MCP Servers│  │
│  │  (zsh/bash) │  │  (fs read) │  │   Tools       │  │  (external) │  │
│  └─────────────┘  └────────────┘  └───────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼ file I/O, shell exec
┌─────────────────────────────────────────────────────────────────────────┐
│                     LOCAL MACHINE / WORKSPACE                           │
│        Source files · Git repo · Shell environment · CLAUDE.md         │
└─────────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Core model", value: "claude-sonnet-4-6 (default) / claude-opus-4-8 (Opus mode)" },
    { label: "Context window", value: "200K tokens — full conversation + tool results" },
    { label: "Tool categories", value: "Bash, Read, Write, Edit, WebSearch, WebFetch, Agent, + MCP" },
    { label: "Agentic loop iterations", value: "Up to ~50 tool calls per turn (soft limit)" },
    { label: "Context compression", value: "Triggered at ~80% of context window via summarization pass" },
    { label: "Prompt cache", value: "System prompt + CLAUDE.md cached for 5-min TTL (reduces latency)" },
    { label: "Permission modes", value: "default (prompt on risky) · auto-approve · allowlist patterns" },
    { label: "Settings files", value: ".claude/settings.json (project) · ~/.claude/settings.json (global)" },
    { label: "MCP protocol", value: "JSON-RPC 2.0 over stdio/SSE — extends tool set with server-side tools" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "The Agentic Loop",
      sections: [
        {
          title: "How a Single Request Flows End-to-End",
          content: `When you type "claude fix the failing tests", here is what happens inside Claude Code:

STEP 1 — Context assembly (before any API call):
  • Load conversation history from the current session (in-memory)
  • Read CLAUDE.md files from project root and parent directories
  • Inject system prompt (role, tool instructions, safety rules)
  • Attach tool schemas (JSON Schema definitions for every available tool)
  • Include git status, recent commits, and opened IDE file (if VS Code extension)

STEP 2 — API call to Claude:
  • Single HTTPS POST to api.anthropic.com/v1/messages
  • Body: { model, system, messages, tools: [...schemas], stream: true }
  • Response streams back as server-sent events (SSE)

STEP 3 — Response routing:
  • Stream tokens arrive. Claude Code parses the stream in real-time.
  • If a "text" content block arrives → stream it directly to terminal output.
  • If a "tool_use" content block arrives → pause text output, invoke Tool Dispatcher.

STEP 4 — Tool execution:
  • Tool Dispatcher identifies the tool name (e.g. "Bash") and input (e.g. {command: "npm test"})
  • Permission check: is this tool call allowed under current settings?
  • If approved: execute the tool, capture the result (stdout/stderr, file contents, etc.)
  • Build a "tool_result" message: {tool_use_id: "...", content: "<output>"}

STEP 5 — Loop continuation:
  • Append Claude's response (including the tool_use block) to conversation history.
  • Append the tool_result to conversation history.
  • Go back to Step 2 — call the API again with the updated context.
  • This loop runs until Claude produces a response with NO tool_use blocks.

STEP 6 — Turn complete:
  • Final text response streamed to terminal.
  • Conversation history saved for next turn.
  • User can type a follow-up or exit.`,
        },
        {
          title: "Why Tool-Use API (Not Function Calling in Prompt)",
          content: `Early AI coding tools injected tool instructions into the system prompt as plain text ("You can run bash by writing BASH: <command>"). Claude Code uses Anthropic's native tool_use API instead.

Why the structured tool API is better:

1. Schema enforcement: each tool has a JSON Schema for its input parameters. The model cannot hallucinate invalid arguments — if Bash requires {command: string}, the API validates the response has exactly that structure before returning it.

2. Parallel tool calls: Claude can return multiple tool_use blocks in one response, all executed in parallel by the dispatcher. Example: reading 5 files simultaneously in one API round-trip instead of 5 sequential calls.

3. Clean separation of reasoning and action: the model's reasoning (text tokens) and its actions (tool_use blocks) are cleanly separated in the API response. Claude Code can log, display, or gate each action independently.

4. Reliable parsing: no regex needed to extract tool calls from prose. The API returns structured JSON for tool_use blocks — zero parsing ambiguity.

5. Token efficiency: tool schemas are cached by Anthropic's prompt cache layer. The 5,000-token tool schema block costs near-zero on repeated turns (cache hit rate > 99% within a session).`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Context Management",
      sections: [
        {
          title: "What Goes Into the Context Window",
          content: `Every API call sends the full context to Claude. The 200K token context window is Claude Code's working memory — everything Claude "knows" during a session lives here.

Context layers (in order of injection):

1. System prompt (cached, ~2,000 tokens):
   Defines Claude's role as a software engineer, tool usage rules, safety constraints, response style guidelines. This is fixed per Claude Code version and cached by Anthropic's prompt caching layer.

2. CLAUDE.md files (cached, variable):
   Project-specific instructions loaded from:
   • ~/.claude/CLAUDE.md (global user preferences)
   • <project-root>/CLAUDE.md (project conventions, build commands, architecture notes)
   • Any parent directory CLAUDE.md (monorepo-level instructions)
   These are appended to the system prompt and cached for the session.

3. Tool schemas (~5,000 tokens, cached):
   JSON Schema definitions for every tool available in the current session. Each tool has: name, description, input_schema with properties, required fields, and descriptions. Cached for the entire session.

4. Conversation history (grows per turn, not cached):
   Every user message, assistant response (including tool_use blocks), and tool_result is appended. This grows with every loop iteration. A 20-tool-call session adds ~10,000–50,000 tokens of history.

5. IDE context (injected per turn, ~500 tokens):
   If running in VS Code extension: current open file path, git status, recent commits. Injected as a system reminder at the start of each turn.

6. Memory files (user-configured):
   If the user has configured persistent memory, relevant memory entries are surfaced as additional system context.

Token budget awareness:
  • Context manager tracks running token count per turn.
  • At ~80% of context limit: triggers automatic summarization (see compression below).
  • Near limit: Claude Code warns the user; /compact command triggers manual compression.`,
        },
        {
          title: "Context Compression — Surviving Long Sessions",
          content: `A complex refactoring session easily consumes 150K+ tokens across dozens of tool calls. Without compression, the context window fills up and the session terminates.

Compression trigger:
  • Auto-triggered when conversation history exceeds ~80% of context limit
  • Manual trigger: user types /compact command
  • Also triggered between turns if the next user message would overflow

How compression works:
  1. Claude Code makes a separate API call with a summarization prompt:
     "Summarize the work done so far: key decisions, files changed, current state, remaining tasks."
  2. The response is a ~2,000 token summary covering all completed work.
  3. Conversation history is replaced with:
     [SUMMARY_BLOCK: <the 2000-token summary>]
     + the last 2–3 most recent turns (to preserve immediate context)
  4. All prior turns are discarded from the context window.
  5. The session continues — Claude has a summary of "what happened before" plus the fresh work.

What is preserved vs lost:
  Preserved: high-level decisions, file changes made, error patterns found, task state.
  Lost: exact file contents read earlier, specific stdout outputs from old tool calls.
  Impact: after compression, Claude may re-read a file it already read — one extra tool call. Acceptable.

Why a rolling summary and not a vector database of past context?
  • Simpler — no embedding model, no retrieval infrastructure needed.
  • Single-process — Claude Code runs on the user's machine, no external services.
  • Fast — one API call to compress vs complex similarity search.
  • Sufficient — for most sessions, a 2K summary captures all essential state.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Tool Execution & Permission System",
      sections: [
        {
          title: "The Tool Execution Pipeline",
          content: `Every tool call Claude makes goes through a four-stage pipeline before execution:

STAGE 1 — Dispatch:
  Tool Dispatcher receives the tool_use block from the API response:
  { id: "tool_abc", name: "Bash", input: { command: "npm test -- --watch=false" } }
  Dispatcher looks up the tool handler by name. Each tool is a registered handler with:
    • execute(input) → result
    • permission_class: "read_only" | "write" | "shell" | "network"
    • display_format: how to render the call in the terminal UI

STAGE 2 — Permission check:
  The permission system evaluates whether this specific tool call is allowed:
  • Check global settings (allowlist patterns, blocked patterns)
  • Check tool permission class against current permission mode
  • If mode = "auto": allow everything
  • If mode = "default": allow reads, prompt for writes/shell
  • If specific pattern matches allowlist (e.g. "Bash(npm test*)"): auto-allow
  • If user denies: inject a synthetic tool_result: "User denied this action." Loop continues.

STAGE 3 — Execution:
  Approved tools are executed by their handlers:
  • Bash: spawns a shell subprocess (zsh/bash per user's shell), captures stdout + stderr, enforces timeout (default 2 min, configurable up to 10 min)
  • Read: reads file from disk, returns raw text with line numbers (cat -n format)
  • Edit: performs exact string replacement in a file, validates old_string exists and is unique
  • Write: writes file contents, validates parent directory exists
  • WebFetch/WebSearch: HTTP requests to external URLs (separate permission class)
  • Agent: spawns a sub-agent with its own agentic loop (parallelism primitive)

STAGE 4 — Result injection:
  Tool result formatted and injected into conversation history:
  {
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: "tool_abc",
      content: "<stdout output of npm test>"
    }]
  }
  This becomes part of the next API call's message array.
  Claude reads the tool result and decides what to do next.`,
        },
        {
          title: "Permission System — Safety Without Friction",
          content: `Claude Code can delete files, run arbitrary shell commands, and make network requests. The permission system is what prevents it from doing so without user awareness.

Three permission modes:

1. Default mode (prompt on risky):
   • Auto-approve: file reads, directory listings
   • Prompt user: file writes, edits, any Bash command
   • Block: git push --force, rm -rf, dangerous patterns
   • User sees a prompt: "Allow Bash(rm -rf dist/)? [y/n/always]"

2. Allowlist mode (via settings.json):
   Rules like "Bash(npm *)" auto-approve any npm command.
   "Read(**)" auto-approve all file reads.
   Patterns use glob syntax: tool(argument_pattern)
   Configured in .claude/settings.json or ~/.claude/settings.json

3. Auto-approve mode (--dangerously-skip-permissions flag):
   All tool calls approved without prompting.
   Used in CI/CD pipelines, automated workflows.
   Named "dangerously" intentionally — it disables all safety prompts.

Hooks (settings.json extension):
  Hooks run shell commands in response to Claude Code events:
  • PreToolUse: runs before a tool executes (can block with non-zero exit)
  • PostToolUse: runs after a tool executes (output injected as context)
  • Notification: fires on tool calls regardless (for logging/alerting)
  • Stop: runs when Claude Code ends a turn

Hook use cases:
  • Auto-run prettier after every file Edit (PostToolUse on Edit)
  • Block any Bash command containing "drop table" (PreToolUse returns error)
  • Log all tool calls to an audit file (Notification hook)
  • Send a desktop notification when a long task finishes (Stop hook)

Permission is checked per-call, not per-session:
  Even if user said "always allow Bash", each specific command string can still be evaluated by hooks. This allows fine-grained "allow npm test but not npm publish" rules.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "API Integration & MCP",
      sections: [
        {
          title: "Anthropic API — Streaming, Caching, Tool Use",
          content: `Claude Code uses the Anthropic Messages API with three key features: streaming, prompt caching, and tool use.

Streaming (why it matters for UX):
  Without streaming: Claude Code would freeze for 10–60 seconds while Claude generates a response, then dump everything at once. Unusable for long responses.
  With streaming (SSE): tokens arrive as they're generated. Claude Code parses the stream in real-time:
    • Text tokens → printed to terminal immediately
    • Tool_use start event → display "Calling Bash..." in UI
    • Tool_use input_json_delta → accumulate JSON (streamed incrementally)
    • Tool_use stop event → dispatch the tool call
    • Message stop event → turn complete

Prompt caching (why it matters for cost + latency):
  The system prompt + CLAUDE.md + tool schemas are ~7,000–15,000 tokens and identical across every turn in a session. Without caching, each API call re-processes these tokens.
  With prompt caching (cache_control: {"type": "ephemeral"}):
    • First call of the session: full processing cost
    • Subsequent calls (within 5-min TTL): cache hit = 90% cost reduction + ~200ms latency reduction
  In a 30-turn session, prompt caching saves ~70% of total API cost.

Parallel tool execution:
  Claude can return multiple tool_use blocks in one response:
  [
    { id: "t1", name: "Read", input: { file_path: "/src/auth.ts" } },
    { id: "t2", name: "Read", input: { file_path: "/src/user.ts" } },
    { id: "t3", name: "Bash", input: { command: "npm test 2>&1 | tail -20" } }
  ]
  Claude Code executes all three in parallel (concurrent Promises).
  Results injected as three separate tool_result messages.
  This turns 3 sequential round-trips into 1 — critical for latency.

Token counting (before sending):
  Claude Code estimates token count of the assembled context before each API call using a local tokenizer (tiktoken-compatible). If the count would exceed the context limit, compression is triggered first. This avoids expensive API errors from oversized requests.`,
        },
        {
          title: "MCP — Extending Claude Code with Custom Tools",
          content: `Model Context Protocol (MCP) is an open standard for adding tools to AI agents. Claude Code supports MCP servers — external processes that expose additional tools via a JSON-RPC interface.

MCP architecture:
  Claude Code (client) ←→ MCP Server (external process)
  Communication: JSON-RPC 2.0 over stdio (local) or SSE (remote)

How MCP tools work:
  1. User configures MCP servers in ~/.claude/settings.json:
     { "mcpServers": { "github": { "command": "npx @github/mcp-server" } } }
  2. Claude Code starts the MCP server subprocess on launch.
  3. Claude Code calls tools/list on the MCP server → gets tool definitions (name, description, input_schema).
  4. These tool definitions are merged into the tool schemas sent to the Claude API alongside built-in tools.
  5. When Claude calls an MCP tool (e.g. "github__create_pr"), Claude Code routes the call to the MCP server via JSON-RPC: tools/call { name: "create_pr", arguments: {...} }
  6. MCP server executes the action (calls GitHub API, queries a database, etc.) and returns the result.
  7. Result injected into context exactly like a built-in tool result.

MCP use cases:
  • github MCP server: create PRs, list issues, review comments — all from Claude Code
  • postgres MCP server: run SQL queries, inspect schema — Claude can query your database directly
  • slack MCP server: send messages, read channel history
  • Custom internal tools: CI/CD status, internal APIs, proprietary data sources

MCP vs built-in tools:
  Built-in tools (Bash, Read, Write, Edit) run in-process — zero latency, direct OS access.
  MCP tools run out-of-process — slight latency (~10ms), but can call any external service.
  Both look identical to Claude — same tool_use API, same result injection. Claude doesn't know which are built-in vs MCP.`,
        },
      ],
    },
  ],
};

export const CLAUDECODE_LLD = {
  title: "Claude Code — Low Level Design",
  subtitle: "API contracts, data structures, and algorithms powering the agentic loop",

  components: [
    {
      id: "agentic-loop",
      title: "Agentic Loop Engine",
      description: "The core request-execute-feedback cycle that drives every task",
      api: `// Anthropic Messages API request (sent each loop iteration)
POST https://api.anthropic.com/v1/messages
x-api-key: {ANTHROPIC_API_KEY}
anthropic-version: 2023-06-01
anthropic-beta: prompt-caching-2024-07-31

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 8096,
  "stream": true,
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, an AI software engineer...",
      "cache_control": { "type": "ephemeral" }  // cache system prompt
    },
    {
      "type": "text",
      "text": "<CLAUDE.md contents>",
      "cache_control": { "type": "ephemeral" }  // cache project instructions
    }
  ],
  "tools": [
    // cached — tool schemas below
    { "name": "Bash", "description": "...", "input_schema": {...},
      "cache_control": { "type": "ephemeral" } },
    { "name": "Read",  "description": "...", "input_schema": {...} },
    { "name": "Edit",  "description": "...", "input_schema": {...} },
    { "name": "Write", "description": "...", "input_schema": {...} }
    // + MCP tools appended here
  ],
  "messages": [
    { "role": "user",      "content": "fix the failing tests in src/auth" },
    { "role": "assistant", "content": [
        { "type": "text",     "text": "Let me look at the failing tests." },
        { "type": "tool_use", "id": "t_01", "name": "Bash",
          "input": { "command": "npm test 2>&1 | tail -30" } }
    ]},
    { "role": "user", "content": [
        { "type": "tool_result", "tool_use_id": "t_01",
          "content": "FAIL src/auth.test.ts\\n  ✗ should validate JWT..." }
    ]},
    { "role": "assistant", "content": [
        { "type": "tool_use", "id": "t_02", "name": "Read",
          "input": { "file_path": "/src/auth.ts" } }
    ]},
    { "role": "user", "content": [
        { "type": "tool_result", "tool_use_id": "t_02",
          "content": "1\\texport function validateJWT..." }
    ]}
    // ... continues until Claude returns text with no tool_use
  ]
}`,

      internals: `Agentic loop implementation:

  async function agenticLoop(userMessage: string): Promise<void> {
    conversationHistory.push({ role: "user", content: userMessage })

    while (true) {
      // Assemble full context
      const request = buildRequest(conversationHistory)

      // Check token budget — compress if near limit
      if (estimateTokens(request) > CONTEXT_LIMIT * 0.80) {
        await compressHistory()
        continue  // rebuild request after compression
      }

      // Call Claude API (streaming)
      const response = await anthropic.messages.create({ ...request, stream: true })

      const assistantBlocks: ContentBlock[] = []
      const toolCalls: ToolUseBlock[] = []

      // Stream response
      for await (const event of response) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            process.stdout.write(event.delta.text)  // stream to terminal
          }
          if (event.delta.type === "input_json_delta") {
            accumulateToolInput(event)               // buffer tool JSON
          }
        }
        if (event.type === "content_block_stop") {
          const block = finalizeBlock(event)
          assistantBlocks.push(block)
          if (block.type === "tool_use") toolCalls.push(block)
        }
      }

      // Append assistant turn to history
      conversationHistory.push({ role: "assistant", content: assistantBlocks })

      // No tool calls → turn is complete
      if (toolCalls.length === 0) break

      // Execute tool calls (in parallel if multiple)
      const toolResults = await Promise.all(
        toolCalls.map(tc => toolDispatcher.execute(tc))
      )

      // Inject tool results as next user message
      conversationHistory.push({
        role: "user",
        content: toolResults.map(r => ({
          type: "tool_result",
          tool_use_id: r.toolUseId,
          content: r.output,
          is_error: r.isError
        }))
      })
      // Loop back → next API call
    }
  }`,
    },
    {
      id: "tool-executor",
      title: "Tool Executor & Dispatcher",
      description: "Tool registration, permission gating, execution, and result formatting",
      api: `// Tool schema (sent in every API call — defines what Claude can call)
{
  "name": "Bash",
  "description": "Execute a shell command. Use for running tests, git commands, installs.",
  "input_schema": {
    "type": "object",
    "properties": {
      "command":     { "type": "string", "description": "Shell command to run" },
      "description": { "type": "string", "description": "Brief description of what this does" },
      "timeout":     { "type": "number", "description": "Timeout in ms, max 600000" },
      "run_in_background": { "type": "boolean" }
    },
    "required": ["command"]
  }
}

// Read tool schema
{
  "name": "Read",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": { "type": "string" },
      "offset":    { "type": "integer", "description": "Line to start reading from" },
      "limit":     { "type": "integer", "description": "Max lines to read" }
    },
    "required": ["file_path"]
  }
}

// Edit tool schema (exact string replacement)
{
  "name": "Edit",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path":   { "type": "string" },
      "old_string":  { "type": "string", "description": "Exact text to replace (must be unique)" },
      "new_string":  { "type": "string" },
      "replace_all": { "type": "boolean", "default": false }
    },
    "required": ["file_path", "old_string", "new_string"]
  }
}`,

      internals: `Tool dispatcher and executor:

  class ToolDispatcher {
    private handlers: Map<string, ToolHandler> = new Map()
    private permissionSystem: PermissionSystem

    async execute(toolCall: ToolUseBlock): Promise<ToolResult> {
      const handler = this.handlers.get(toolCall.name)
      if (!handler) {
        return { toolUseId: toolCall.id, output: "Unknown tool", isError: true }
      }

      // Permission check — may prompt user
      const decision = await this.permissionSystem.check(toolCall)
      if (decision === "DENY") {
        return {
          toolUseId: toolCall.id,
          output: "User denied this tool call.",
          isError: false  // not an error, Claude should adapt
        }
      }

      // Execute with timeout
      try {
        const output = await Promise.race([
          handler.execute(toolCall.input),
          timeout(toolCall.input.timeout ?? 120_000)
        ])
        return { toolUseId: toolCall.id, output, isError: false }
      } catch (err) {
        return { toolUseId: toolCall.id, output: String(err), isError: true }
      }
    }
  }

  // Bash handler
  const BashHandler: ToolHandler = {
    execute: async ({ command, run_in_background }: BashInput) => {
      if (run_in_background) {
        const proc = spawn(command, { shell: true, detached: true })
        return \`Started background process PID \${proc.pid}\`
      }
      const { stdout, stderr } = await execAsync(command, {
        shell: process.env.SHELL ?? "/bin/zsh",
        maxBuffer: 10 * 1024 * 1024,  // 10 MB output cap
        cwd: process.cwd()
      })
      return (stdout + stderr).trim() || "(no output)"
    }
  }

  // Edit handler (exact string replacement with uniqueness check)
  const EditHandler: ToolHandler = {
    execute: async ({ file_path, old_string, new_string, replace_all }: EditInput) => {
      const content = await fs.readFile(file_path, "utf-8")
      const occurrences = content.split(old_string).length - 1
      if (occurrences === 0) throw new Error(\`old_string not found in \${file_path}\`)
      if (!replace_all && occurrences > 1)
        throw new Error(\`old_string matches \${occurrences} times — provide more context or use replace_all\`)
      const updated = replace_all
        ? content.replaceAll(old_string, new_string)
        : content.replace(old_string, new_string)
      await fs.writeFile(file_path, updated, "utf-8")
      return \`Updated \${file_path} successfully.\`
    }
  }`,
    },
    {
      id: "permission-system",
      title: "Permission System",
      description: "Allowlist rules, permission modes, and hook execution",
      api: `// .claude/settings.json — project-level permissions
{
  "permissions": {
    "allow": [
      "Bash(npm *)",            // auto-allow all npm commands
      "Bash(git diff*)",        // auto-allow git diff
      "Bash(cargo *)",          // auto-allow cargo commands
      "Read(**)",               // auto-allow all file reads
      "Edit(src/**)"            // auto-allow edits inside src/
    ],
    "deny": [
      "Bash(git push*)",        // always deny git push (must do manually)
      "Bash(rm -rf *)",         // always deny recursive delete
      "Bash(* --force*)"        // deny any --force flag in shell
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          // Non-zero exit blocks the tool call; stdout injected as context
          "command": "echo \"$CLAUDE_TOOL_INPUT\" | python3 ./scripts/audit-bash.py"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{
          "type": "command",
          "command": "npx prettier --write \"$CLAUDE_FILE_PATH\" 2>&1"
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "osascript -e 'display notification \"Claude Code finished\" with title \"Claude Code\"'"
        }]
      }
    ]
  }
}`,

      internals: `Permission evaluation (ordered rule matching):

  class PermissionSystem {
    private rules: PermissionRule[]  // loaded from settings.json + ~/.claude/settings.json

    async check(toolCall: ToolUseBlock): Promise<"ALLOW" | "DENY" | "PROMPT"> {
      const toolPattern = \`\${toolCall.name}(\${primaryArg(toolCall.input)})\`

      // 1. Check deny list first (deny takes priority over allow)
      for (const rule of this.rules.filter(r => r.type === "deny")) {
        if (globMatch(rule.pattern, toolPattern)) {
          showToUser(\`Blocked: \${toolPattern} matches deny rule "\${rule.pattern}"\`)
          return "DENY"
        }
      }

      // 2. Check allow list
      for (const rule of this.rules.filter(r => r.type === "allow")) {
        if (globMatch(rule.pattern, toolPattern)) return "ALLOW"
      }

      // 3. Run PreToolUse hooks (can block)
      const hookResult = await runHooks("PreToolUse", toolCall)
      if (hookResult.blocked) {
        return "DENY"  // hook returned non-zero exit
      }

      // 4. Default behavior per tool class
      if (toolCall.name === "Read" || toolCall.name === "Bash" && isReadOnly(toolCall)) {
        return "ALLOW"  // reads auto-allowed in default mode
      }

      // 5. Prompt user (blocking)
      return await promptUser(toolCall)
    }
  }

  // Hook execution with env vars
  async function runHooks(event: string, toolCall: ToolUseBlock): Promise<HookResult> {
    const matchingHooks = getMatchingHooks(event, toolCall.name)
    for (const hook of matchingHooks) {
      const env = {
        ...process.env,
        CLAUDE_TOOL_NAME:  toolCall.name,
        CLAUDE_TOOL_INPUT: JSON.stringify(toolCall.input),
        CLAUDE_FILE_PATH:  toolCall.input.file_path ?? "",
        CLAUDE_COMMAND:    toolCall.input.command ?? ""
      }
      const { code, stdout } = await execAsync(hook.command, { env })
      if (code !== 0) return { blocked: true, reason: stdout }
      if (stdout.trim()) injectAsContext(stdout)  // hook output → Claude sees it
    }
    return { blocked: false }
  }`,
    },
    {
      id: "context-builder",
      title: "Context Builder & Compression",
      description: "CLAUDE.md loading, token estimation, and session compression",
      api: `// CLAUDE.md discovery — walks directory tree upward
// Loaded files (in priority order, lowest to highest):
//   ~/.claude/CLAUDE.md         — global user preferences
//   /project/CLAUDE.md          — project-level instructions
//   /project/src/CLAUDE.md      — subdirectory instructions (if exists)

// CLAUDE.md example content:
/**
  # Project Context
  This is a React + TypeScript project using Vite.
  Build: npm run build | Test: npm test | Lint: npm run lint

  ## Code Style
  - Use functional components with hooks
  - Prefer named exports over default exports
  - All API calls go through src/api/ — never fetch() directly in components

  ## Architecture
  - src/pages/ — route-level components
  - src/data/  — static data files (no API calls)
  - src/components/ — shared UI components

  ## Git
  - Never commit directly to main
  - Always run tests before committing
**/

// Token estimation (before sending to API)
// Uses a local tokenizer approximation (1 token ≈ 4 chars for English code)
function estimateTokens(messages: Message[]): number {
  const text = JSON.stringify(messages)
  return Math.ceil(text.length / 3.5)  // conservative estimate for code
}

// Context window limits by model:
// claude-sonnet-4-6:  200K tokens
// claude-opus-4-8:    200K tokens
// claude-haiku-4-5:   200K tokens`,

      internals: `Context assembly pipeline:

  function buildRequest(history: Message[]): MessagesRequest {
    return {
      model: currentModel(),
      max_tokens: 8096,
      stream: true,
      system: [
        // Tier 1: always cached (changes only on Claude Code update)
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },

        // Tier 2: cached per session (changes when CLAUDE.md changes)
        ...loadClaudeMdFiles().map(md => ({
          type: "text", text: md.content, cache_control: { type: "ephemeral" }
        })),

        // Tier 3: injected per turn (not cached — changes every turn)
        { type: "text", text: buildIdeContext() },  // git status, open file
      ],
      tools: [
        // Tool schemas cached for session
        ...BUILTIN_TOOLS.map((t, i) => i < 4
          ? { ...t, cache_control: { type: "ephemeral" } }  // cache first 4 tool schemas
          : t),
        ...mcpTools  // MCP tools appended (not cached)
      ],
      messages: history
    }
  }

  Session compression algorithm:
    async function compressHistory(): Promise<void> {
      const toCompress = conversationHistory.slice(0, -4)  // keep last 4 turns fresh
      const recent = conversationHistory.slice(-4)

      // Ask Claude to summarize the work done so far
      const summary = await anthropic.messages.create({
        model: currentModel(),
        max_tokens: 2048,
        messages: [
          ...toCompress,
          { role: "user", content: \`Summarize the work done in this conversation:
            - Key decisions made
            - Files created or modified (with what change)
            - Errors encountered and how they were resolved
            - Current state and what remains to be done
            Keep it under 1500 tokens.\` }
        ]
      })

      // Replace history with summary + recent turns
      conversationHistory = [
        {
          role: "user",
          content: \`[Previous session summary]\n\${summary.content[0].text}\`
        },
        { role: "assistant", content: "Understood. Continuing from where we left off." },
        ...recent
      ]

      log.info(\`Compressed \${toCompress.length} turns → 2 turns (\${estimateTokens(conversationHistory)} tokens)\`)
    }`,
    },
    {
      id: "mcp-integration",
      title: "MCP Server Integration",
      description: "JSON-RPC tool extension protocol, server lifecycle, tool routing",
      api: `// MCP server configuration (~/.claude/settings.json)
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "\${DATABASE_URL}" }
    },
    "custom-internal": {
      "command": "python3",
      "args": ["/path/to/my-mcp-server.py"],
      "env": {}
    }
  }
}

// MCP JSON-RPC protocol (stdio transport)
// Claude Code → MCP Server

// 1. Initialize
→ { "jsonrpc":"2.0", "id":1, "method":"initialize",
    "params": { "protocolVersion":"2024-11-05", "capabilities":{} } }
← { "result": { "protocolVersion":"2024-11-05", "serverInfo": { "name":"github" } } }

// 2. List available tools
→ { "jsonrpc":"2.0", "id":2, "method":"tools/list" }
← { "result": { "tools": [
      { "name": "github__create_pr",
        "description": "Create a GitHub pull request",
        "inputSchema": { "type":"object",
          "properties": { "title":{}, "body":{}, "base":{}, "head":{} },
          "required": ["title","head","base"]
        }
      },
      { "name": "github__list_issues", ... }
    ]}}

// 3. Call a tool
→ { "jsonrpc":"2.0", "id":3, "method":"tools/call",
    "params": { "name":"github__create_pr",
      "arguments": { "title":"Fix auth bug", "head":"fix/auth", "base":"main", "body":"..." }
    }}
← { "result": { "content": [
      { "type":"text", "text":"PR #142 created: https://github.com/..." }
    ]}}`,

      internals: `MCP server lifecycle management:

  class MCPManager {
    private servers: Map<string, MCPServerProcess> = new Map()

    async startAll(config: MCPConfig): Promise<void> {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const server = await this.startServer(name, serverConfig)
          const tools = await server.listTools()
          // Prefix all tool names with server name to avoid collisions
          // e.g. "create_pr" → "github__create_pr"
          const prefixedTools = tools.map(t => ({ ...t, name: \`\${name}__\${t.name}\` }))
          this.servers.set(name, { process: server, tools: prefixedTools })
        } catch (err) {
          // MCP server startup failure is non-fatal — Claude Code continues without it
          log.warn(\`MCP server "\${name}" failed to start: \${err.message}\`)
        }
      }
    }

    async callTool(toolName: string, args: unknown): Promise<string> {
      // "github__create_pr" → server="github", tool="create_pr"
      const [serverName, ...toolParts] = toolName.split("__")
      const actualToolName = toolParts.join("__")
      const server = this.servers.get(serverName)
      if (!server) throw new Error(\`MCP server "\${serverName}" not available\`)

      const result = await server.process.callTool(actualToolName, args)
      return result.content.map(c => c.text ?? "").join("\\n")
    }

    getAllToolSchemas(): Tool[] {
      return [...this.servers.values()].flatMap(s => s.tools)
    }
  }

  // MCP tool routing in Tool Dispatcher
  // Built-in tools checked first; if no match, route to MCPManager
  async execute(toolCall: ToolUseBlock): Promise<ToolResult> {
    const builtinHandler = this.handlers.get(toolCall.name)
    if (builtinHandler) {
      return builtinHandler.execute(toolCall.input)
    }
    if (toolCall.name.includes("__")) {
      // MCP tool — route to MCPManager
      const output = await this.mcpManager.callTool(toolCall.name, toolCall.input)
      return { toolUseId: toolCall.id, output, isError: false }
    }
    return { toolUseId: toolCall.id, output: "Unknown tool", isError: true }
  }`,
    },
  ],
};

export const CLAUDECODE_QNA = [
  {
    id: "cc-q1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Anthropic", "OpenAI", "Google DeepMind"],
    question: "Design the agentic loop at the core of an AI coding agent like Claude Code. How does it handle multi-step tasks?",
    answer: `The agentic loop is a tight cycle: assemble context → call LLM API → route response → if tool call, execute and inject result → repeat until no tool calls.

Key design decisions:

1. Tool use API (not prompt-based): tools are defined as JSON schemas sent in the API request. The model returns structured tool_use blocks (not text to parse). This enables parallel tool calls, schema validation, and clean separation of reasoning from action.

2. Conversation history as working memory: every user message, assistant response (including tool_use blocks), and tool_result is appended to the message array. The model "sees" all its own past actions and their outputs. This is how it debugs iteratively — it reads the test failure, edits the file, runs tests again, reads the new output.

3. Streaming: responses stream as SSE tokens. Text tokens print immediately. Tool_use blocks are buffered until complete, then dispatched. This gives real-time feedback during long operations.

4. Loop termination: a turn ends when the model returns a response with zero tool_use blocks — only text. The model decides when it's "done."

5. Error injection: if a tool fails, the error is injected as a tool_result with is_error=true. The model reads the error and decides how to recover — retry, take a different approach, or explain to the user why it can't proceed.`,
    followups: ["How do you prevent the agent from getting stuck in an infinite loop?", "How would you add a budget/cost limit to cap how many tool calls one request can make?"],
  },
  {
    id: "cc-q2",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Anthropic", "Google", "Microsoft"],
    question: "How does Claude Code use prompt caching to reduce latency and cost across a long session?",
    answer: `In a typical session the system prompt (~2K tokens), CLAUDE.md files (~3K tokens), and tool schemas (~5K tokens) are identical across every single API call. Without caching, each call re-processes ~10K tokens of constant content — expensive and slow.

Prompt caching (cache_control: {type: "ephemeral"}):
• Marks specific content blocks as cacheable for 5 minutes.
• First call in a session: full processing at normal cost.
• Subsequent calls (within 5-min TTL): cache hit — ~90% cost reduction on cached tokens + ~200ms latency reduction.

Implementation: the system prompt array has three entries. First two (system prompt + CLAUDE.md) get cache_control markers. The third (IDE context — git status, open file) changes every turn so it's NOT cached. Tool schemas: first 4 tool definitions are cached (they never change), remaining MCP tools are not cached (may be added/removed).

In a 30-turn session with 10K tokens of constant content per call:
  Without caching: 30 × 10K = 300K tokens billed at full price.
  With caching:    1 × 10K (full) + 29 × 10K (90% discount) = ~40K tokens at full price.
  Savings: ~87% cost reduction on system content.

The 5-minute TTL matters: if the user is idle for > 5 minutes, the cache expires. The next call is a cache miss. Claude Code doesn't need to do anything — the API handles cache management transparently.`,
    followups: ["What happens to the cache when you switch models mid-session?", "How would you design a persistent cache that survives beyond 5 minutes?"],
  },
  {
    id: "cc-q3",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Anthropic", "Meta", "Amazon"],
    question: "How does context compression work in Claude Code when the context window fills up?",
    answer: `Without compression, a long session (many file reads, test runs, iterative edits) fills the 200K token context window and terminates. Compression allows sessions to run indefinitely.

Trigger: when estimated token count exceeds ~80% of context limit (or user types /compact).

Algorithm:
1. Identify the compressible portion: all turns except the last 3-4 (kept fresh for immediate context).
2. Make a summarization API call: send the compressible turns with a prompt asking Claude to write a ~1,500 token summary of: decisions made, files changed (and how), errors encountered and resolved, current state, what remains.
3. Replace the compressible turns with a two-message pair:
   user: "[Previous session summary]\n{summary text}"
   assistant: "Understood. Continuing from where we left off."
4. Append the kept-fresh recent turns.
5. Continue the session normally.

What's preserved: high-level decisions, the list of files changed and why, error patterns, task state.
What's lost: exact file contents from earlier reads, specific stdout from old bash calls.
Impact: if Claude needs a file it read before compression, it will re-read it (one extra tool call). Acceptable.

Why not a vector database for memory?
• Claude Code runs locally, single-process — no external infrastructure.
• A 1,500 token summary is sufficient for continuity in most coding sessions.
• Simplicity: one API call vs embedding model + vector store + retrieval logic.`,
    followups: ["What information would you make sure is always in the summary to ensure task continuity?", "Could you use a hierarchical summary approach (summaries of summaries) for very long sessions?"],
  },
  {
    id: "cc-q4",
    category: "Security & DRM",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Anthropic", "Google", "Microsoft"],
    question: "Design the permission system for an AI agent that can run arbitrary shell commands. What are the key safety constraints?",
    answer: `An AI that can run arbitrary shell commands can delete your codebase, exfiltrate secrets, or push broken code. The permission system must be safety-first without being so restrictive it's useless.

Three-layer approach:

1. Allowlist/denylist rules (settings.json): glob patterns like Bash(npm *) auto-allow, Bash(git push*) auto-deny. Deny rules are evaluated before allow rules — deny always wins. This gives users declarative, auditable control.

2. Default-mode prompting: any tool call not matching an allowlist rule requires interactive user approval. The user sees: "Allow Bash(rm -rf dist/)? [y/n/always]". "Always" adds the pattern to the allowlist for the session.

3. Hooks (PreToolUse): shell commands that run before a tool executes. Non-zero exit code blocks the tool call. This enables custom safety logic (scan commands for dangerous patterns, require audit logging, enforce organizational policy) without modifying Claude Code itself.

Key safety invariants:
• Deny rules cannot be overridden by allowlist rules — ordering matters.
• Auto-approve mode (CI) is explicitly named "dangerously-skip-permissions" to signal risk.
• User denial injects "User denied this action" as the tool result, not an error — Claude adapts gracefully rather than crashing.
• Tools are scoped: Read is always less risky than Bash. Permission classes allow blanket "allow all reads" without allowing writes.

The hardest problem: preventing prompt injection — a malicious file the agent reads that tries to instruct it to run dangerous commands. Claude Code mitigates this via the safety layer in the system prompt and by flagging suspicious tool results to the user.`,
    followups: ["How do you prevent Claude from being prompt-injected by a malicious file it reads?", "How would you audit all tool calls made during a session for compliance?"],
  },
  {
    id: "cc-q5",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Anthropic", "OpenAI", "Cohere"],
    question: "What is the Model Context Protocol (MCP) and how does it extend an AI agent's capabilities?",
    answer: `MCP (Model Context Protocol) is an open standard for connecting AI agents to external tools and data sources via a JSON-RPC 2.0 interface. It solves the problem of "how do you give Claude access to your internal database / GitHub / Slack without modifying Claude Code itself?"

Architecture: Claude Code (MCP client) starts MCP server subprocesses at launch. Each server is an external process that exposes tools via JSON-RPC over stdio or SSE. Claude Code calls tools/list to discover available tools, then merges them with built-in tools in the API request. When Claude calls an MCP tool (e.g. "github__create_pr"), Claude Code routes it to the correct server via JSON-RPC. The result is injected as a tool_result — identical to a built-in tool from Claude's perspective.

Key design properties:
• Claude doesn't know which tools are built-in vs MCP — same tool_use API, same result injection. This keeps the agent loop simple.
• Tool names are namespaced by server (github__create_pr) to prevent collisions.
• MCP server startup failure is non-fatal — Claude Code continues without that server.
• Servers run as separate processes with their own credentials/secrets — GitHub token stays in the MCP server process, never visible to Claude Code's main process.

Use cases: GitHub (create PRs, list issues), databases (run SQL), internal APIs (CI status, deploy triggers), observability (query metrics), custom corporate tools.`,
    followups: ["What security risks come from running MCP servers as trusted subprocesses?", "How would you design an MCP server that exposes a read-only view of a production database?"],
  },
  {
    id: "cc-q6",
    category: "Scale & Performance",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Anthropic", "Google", "Meta"],
    question: "How does Claude Code handle parallel tool execution? Why does it matter for latency?",
    answer: `Claude can return multiple tool_use blocks in a single API response. Claude Code executes all of them concurrently using Promise.all(), then injects all results as a batch tool_result message before the next API call.

Why it matters: consider a task "review these 5 files and identify the bug." Without parallel execution: 5 sequential Read calls × 1 API round-trip each = 5 round-trips (5 × ~2s = ~10s). With parallel execution: Claude requests all 5 files in one response → Claude Code reads them concurrently → 1 API round-trip (~2s) + parallel file reads (~0ms).

The ordering of tool_use blocks in the response determines how Claude presents them, but execution is concurrent. Results are injected with their tool_use_id to preserve the correlation — Claude knows which result belongs to which call.

Constraints: tools that modify state (Write, Edit, Bash with side effects) are risky to parallelize if they depend on each other. Claude generally avoids requesting conflicting parallel writes. The agentic loop doesn't enforce sequential execution for safety — it relies on Claude's judgment about which operations are safe to parallelize.

API-level constraint: Anthropic's tool_use allows multiple tool_use blocks but they're all in the same assistant message, so they all implicitly run "at the same logical time" before the next user message. This is semantically clean.`,
    followups: ["What happens if one of five parallel tool calls fails? Does Claude retry just that one?", "How would you implement a dependency graph for tool calls that must run in sequence?"],
  },
  {
    id: "cc-q7",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Anthropic", "OpenAI", "Mistral"],
    question: "How does the CLAUDE.md file system work and why is it a better approach than hardcoding project context?",
    answer: `CLAUDE.md is a markdown file that Claude Code automatically loads and injects into the system prompt. It's the project's "readme for the AI" — containing build commands, code conventions, architecture notes, and anything the model needs to work effectively in the repo.

Discovery hierarchy (lower overrides higher for specificity):
1. ~/.claude/CLAUDE.md — global user preferences (e.g. "prefer TypeScript, always use pnpm")
2. /project-root/CLAUDE.md — project-level context (build commands, testing patterns, architecture)
3. /project-root/src/CLAUDE.md — subdirectory context (specific to that module)

Why CLAUDE.md beats alternatives:

vs hardcoding in system prompt: system prompt changes require a Claude Code release. CLAUDE.md changes are immediate and user-controlled.

vs always reading README.md: README is for humans and often too verbose/irrelevant for AI. CLAUDE.md is intentionally written for the model — terse, structured, focused on what Claude needs to take action.

vs injecting at every turn from a config file: CLAUDE.md content is stable for a session so it's placed in the cacheable system prompt tier (5-min prompt cache). Injecting it per-turn wastes tokens and skips caching.

vs embeddings/RAG for project context: CLAUDE.md is simple text, no infrastructure needed. It's explicit (you control exactly what Claude knows) rather than implicit (retrieved chunks may or may not include the right context).

Lifecycle: loaded at session start, cached in the system prompt for the session duration. If CLAUDE.md changes mid-session, a new session is needed to pick up changes.`,
    followups: ["What would you put in CLAUDE.md for a large monorepo with 50 microservices?", "How do you keep CLAUDE.md from becoming stale as the codebase evolves?"],
  },
  {
    id: "cc-q8",
    category: "Fault Tolerance",
    difficulty: "Medium",
    round: "Screening",
    asked_at: ["Anthropic", "Google", "Amazon"],
    question: "How does Claude Code recover from tool failures during the agentic loop?",
    answer: `Tool failures are a normal part of agentic execution — tests fail, files don't exist, commands time out. The recovery design must allow Claude to adapt without crashing the loop.

Tool failure handling:

1. Tool result, not exception: every tool execution is wrapped in try/catch. Errors return a tool_result with is_error: true and the error message as content. The loop never terminates on a tool error — it continues to the next API call.

2. Claude reads the error: the error message is part of Claude's context. Claude decides: retry with different arguments? Read a different file? Explain to the user why it can't proceed? This is AI-level error recovery — the model reasons about failures.

3. Timeout handling: Bash commands default to 2-minute timeout (configurable up to 10 minutes). On timeout, Claude Code injects: "Command timed out after 120000ms. Consider running in background or breaking into smaller steps." Claude typically breaks the command down or uses run_in_background.

4. User denial recovery: if the user denies a tool call, the result is: "User denied this action." This is NOT an error — Claude adapts (asks permission differently, takes an alternative approach, explains what it was trying to do).

5. File not found: Read of a non-existent path returns the error. Claude typically searches for the correct path (find command, ls, git ls-files) and retries.

The key principle: failures are data, not exceptions. The agentic loop is resilient by design because the model can reason about what went wrong.`,
    followups: ["How do you prevent Claude from retrying a permanently-failing operation in an infinite loop?", "What failure modes exist that Claude can't recover from automatically?"],
  },
  {
    id: "cc-q9",
    category: "Architecture",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Anthropic", "OpenAI", "Cohere"],
    question: "What is the difference between a chatbot and an agentic AI like Claude Code? What makes Claude Code an 'agent'?",
    answer: `A chatbot has one turn: user sends message → model generates text → done. Claude Code is an agent because it takes multi-step actions in the real world that change state between model calls.

Three properties that make Claude Code an agent:

1. Tool use (acting on the world): Claude Code can read files, write code, run shell commands, search the web. A chatbot only generates text. Claude Code actually changes files on your disk.

2. Agentic loop (multi-step reasoning): after a tool call, the result is fed back into context and Claude calls the API again. It can take 20+ steps to complete a task — reading, editing, testing, reading errors, fixing, testing again. A chatbot has no concept of "loop."

3. Persistent state (working memory): the full conversation history including all tool calls and results accumulates across iterations. Claude "knows" that it ran the tests three turns ago and got a specific error. A chatbot's context is typically limited to the current conversation, not a task state machine.

The practical implication: you give Claude Code a task ("add pagination to the user list endpoint"), not a single question. It figures out the steps: read the route handler, read the existing query, edit the query to add LIMIT/OFFSET, update the API response type, write a test, run the test, fix any failures. You review the result. This is fundamentally different from "here is some code, explain it."`,
    followups: ["What are the risks of giving an AI agent unrestricted access to your development environment?", "How would you design a 'dry run' mode that shows what an agent would do without executing?"],
  },
  {
    id: "cc-q10",
    category: "Scale & Performance",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Anthropic", "Google", "Microsoft"],
    question: "Why does Claude Code stream API responses instead of waiting for the full response?",
    answer: `Without streaming: Claude Code sends an API request and waits silently for 10–60 seconds while Claude generates a long response. The terminal shows nothing. The user doesn't know if it's working. Bad UX.

With streaming (SSE): tokens arrive as they're generated. Claude Code processes the stream in real-time:

1. Text tokens print immediately to the terminal — the user sees Claude's reasoning appear word by word, just like a human typing. Perceived latency drops from "60 second freeze" to "instant start."

2. Tool_use blocks are buffered during streaming. Claude Code accumulates the JSON arguments incrementally (input_json_delta events) and dispatches the tool only when the block is complete (content_block_stop). This means tool execution starts the instant Claude finishes specifying the call, not after the entire response is done.

3. Long Bash outputs (e.g. running a test suite) are streamed back to the terminal in real time rather than dumped all at once.

The API implementation: Anthropic's Messages API supports stream: true. The response is an SSE stream of typed events: content_block_start, content_block_delta (text or json deltas), content_block_stop, message_stop. Claude Code maintains a simple state machine per content block to accumulate and route these events.

Streaming is not just UX — it's architecturally important for parallel tool dispatch: in a parallel tool call response, each tool_use block can be dispatched independently as soon as its content_block_stop arrives, without waiting for all other blocks.`,
    followups: ["How do you handle a streaming connection that drops mid-response?", "At what point in the stream can you start executing a tool call?"],
  },
];
