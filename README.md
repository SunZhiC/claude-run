# claude-run

A beautiful web UI for browsing Claude Code conversation history.

```bash
npx claude-run
```

The browser will open automatically at [localhost:12001](http://localhost:12001) with the UI showing claude sessions history.

## Installation

You can either run it without installation

```bash
npx claude-run
```

on install it globally

```bash
npm install -g claude-run
```

## Features

- **Real-time streaming** - Watch conversations update live as Claude responds
- **Search** - Find sessions by prompt text or project name
- **Filter by project** - Focus on specific projects
- **Dark mode** - Easy on the eyes
- **Clean UI** - Familiar chat interface with collapsible tool calls

## Usage

```bash
claude-run [options]

Options:
  -V, --version        Show version number
  -p, --port <number>  Port to listen on (default: 12001)
  -d, --dir <path>     Claude directory (default: ~/.claude)
  --no-open            Do not open browser automatically
  -h, --help           Show help
```

## How It Works

Claude Code stores conversation history in `~/.claude/`. This tool reads that data and presents it in a web interface with:

1. **Session list** - All your conversations, sorted by recency
2. **Project filter** - Focus on a specific project
3. **Conversation view** - Full message history with tool calls
4. **Real-time updates** - SSE streaming for live conversations

## Requirements

- Node.js 20+
- Claude Code installed and used at least once

## Development

```bash
# Clone the repo
git clone https://github.com/kamranahmedse/claude-run.git
cd claude-run

# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Build for production
pnpm build
```

## License

MIT © Kamran Ahmed
