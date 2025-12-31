import { memo, useMemo } from "react";
import { CopyButton } from "./tool-renderers";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface ParsedBlock {
  type: "paragraph" | "code" | "heading" | "list" | "blockquote";
  content: string;
  language?: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code",
        content: codeLines.join("\n"),
        language,
      });
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({
        type: "blockquote",
        content: quoteLines.join("\n"),
      });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const items: string[] = [];
      const ordered = !!orderedMatch;
      const pattern = ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/;

      while (i < lines.length) {
        const match = lines[i].match(pattern);
        if (!match) {
          break;
        }
        items.push(match[1]);
        i++;
      }
      blocks.push({
        type: "list",
        content: "",
        items,
        ordered,
      });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paragraphLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].startsWith("> ") &&
      !lines[i].match(/^[-*]\s/) &&
      !lines[i].match(/^\d+\.\s/)
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: "paragraph",
      content: paragraphLines.join("\n"),
    });
  }

  return blocks;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-cyan-300 text-[12px] font-mono"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push(
        <strong key={key++} className="font-semibold text-zinc-50">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      nodes.push(
        <em key={key++} className="italic text-zinc-200">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[`*_\[]/);
    if (nextSpecial === -1) {
      nodes.push(remaining);
      break;
    }
    if (nextSpecial === 0) {
      nodes.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      nodes.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return nodes;
}

function CodeBlock(props: { content: string; language?: string }) {
  const { content, language } = props;

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border border-zinc-700/50 border-b-0 rounded-t-lg">
        <span className="text-[10px] text-zinc-500 font-mono">
          {language || "code"}
        </span>
        <CopyButton text={content} />
      </div>
      <pre className="text-xs text-zinc-300 bg-zinc-900/80 border border-zinc-700/50 rounded-b-lg p-3 overflow-x-auto">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function BlockRenderer(props: { block: ParsedBlock }) {
  const { block } = props;

  if (block.type === "code") {
    return <CodeBlock content={block.content} language={block.language} />;
  }

  if (block.type === "heading") {
    const level = block.level || 1;
    const sizeClass =
      level === 1
        ? "text-base font-semibold"
        : level === 2
          ? "text-sm font-semibold"
          : "text-[13px] font-medium";

    return (
      <div className={`${sizeClass} text-zinc-100 mt-3 mb-1.5`}>
        {parseInline(block.content)}
      </div>
    );
  }

  if (block.type === "blockquote") {
    return (
      <div className="border-l-2 border-zinc-600 pl-3 my-2 text-zinc-400 italic">
        {parseInline(block.content)}
      </div>
    );
  }

  if (block.type === "list" && block.items) {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={`my-2 ml-3 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"} list-inside text-zinc-200`}
      >
        {block.items.map((item, idx) => (
          <li key={idx} className="text-[13px] leading-relaxed">
            {parseInline(item)}
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p className="text-[13px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
      {parseInline(block.content)}
    </p>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer(props: MarkdownRendererProps) {
  const { content, className = "" } = props;

  const blocks = useMemo(() => parseBlocks(content), [content]);

  if (blocks.length === 0) {
    return null;
  }

  if (blocks.length === 1 && blocks[0].type === "paragraph") {
    return (
      <div className={`text-[13px] leading-relaxed break-words ${className}`}>
        {parseInline(blocks[0].content)}
      </div>
    );
  }

  return (
    <div className={`space-y-2 break-words ${className}`}>
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </div>
  );
});
