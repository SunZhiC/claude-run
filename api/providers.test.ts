import { describe, expect, it, vi } from "vitest";
import { ProviderManager, pickPreferredAdapter } from "./providers";
import type { ProviderAdapter, ProviderName } from "./provider-types";
import type {
  ConversationMessage,
  SearchResult,
  Session,
  SessionMeta,
  StreamResult,
} from "./storage";

function createMeta(model: string): SessionMeta {
  return {
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_write_5m_tokens: 0,
      cache_write_1h_tokens: 0,
      cache_read_tokens: 0,
    },
    subagents: [],
    model,
    costs: null,
  };
}

function createAdapter(
  name: ProviderName,
  ownsSession: boolean,
  label: string = name,
): ProviderAdapter {
  const conversation: ConversationMessage[] = [
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: `${label}-conversation`,
      },
    },
  ];
  const stream: StreamResult = {
    messages: conversation,
    nextOffset: label.length,
  };
  const meta = createMeta(`${label}-model`);

  return {
    name,
    init: vi.fn(async () => {}),
    getWatchPaths: vi.fn(() => ({ paths: [], depth: 0 })),
    getSessions: vi.fn(async (): Promise<Session[]> => []),
    getProjects: vi.fn(async (): Promise<string[]> => []),
    getConversation: vi.fn(async () => conversation),
    getConversationStream: vi.fn(async () => stream),
    getSessionMeta: vi.fn(async () => meta),
    searchConversations: vi.fn(async (): Promise<SearchResult[]> => []),
    ownsSession: vi.fn(() => ownsSession),
    invalidateHistoryCache: vi.fn(),
    invalidateSessionMeta: vi.fn(),
    addToFileIndex: vi.fn(),
    resolveSessionId: vi.fn(() => null),
  };
}

describe("pickPreferredAdapter", () => {
  it("prefers non-Claude providers when multiple adapters claim one session", () => {
    const claude = createAdapter("claude", true);
    const codex = createAdapter("codex", true);
    const gemini = createAdapter("gemini", true);

    expect(pickPreferredAdapter([claude, gemini, codex], "session-1")?.name).toBe(
      "codex",
    );
  });
});

describe("ProviderManager", () => {
  it("delegates conversation, stream, and meta to the preferred adapter", async () => {
    const claude = createAdapter("claude", true, "claude");
    const codex = createAdapter("codex", true, "codex");
    const gemini = createAdapter("gemini", false, "gemini");
    const manager = new ProviderManager();

    (manager as unknown as { adapters: ProviderAdapter[] }).adapters = [
      claude,
      codex,
      gemini,
    ];

    expect(manager.getProviderForSession("session-1")).toBe("codex");

    const conversation = await manager.getConversation("session-1");
    expect(conversation).toEqual([
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: "codex-conversation",
        },
      },
    ]);
    expect(codex.getConversation).toHaveBeenCalledWith("session-1");
    expect(claude.getConversation).not.toHaveBeenCalled();

    const stream = await manager.getConversationStream("session-1", 42);
    expect(stream).toEqual({
      messages: [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: "codex-conversation",
          },
        },
      ],
      nextOffset: 5,
    });
    expect(codex.getConversationStream).toHaveBeenCalledWith("session-1", 42);
    expect(claude.getConversationStream).not.toHaveBeenCalled();

    const meta = await manager.getSessionMeta("session-1");
    expect(meta.model).toBe("codex-model");
    expect(codex.getSessionMeta).toHaveBeenCalledWith("session-1");
    expect(claude.getSessionMeta).not.toHaveBeenCalled();
  });

  it("uses the single owning adapter when there is no conflict", async () => {
    const claude = createAdapter("claude", false);
    const codex = createAdapter("codex", false);
    const gemini = createAdapter("gemini", true, "gemini");
    const manager = new ProviderManager();

    (manager as unknown as { adapters: ProviderAdapter[] }).adapters = [
      claude,
      codex,
      gemini,
    ];

    expect(manager.getProviderForSession("session-2")).toBe("gemini");

    const meta = await manager.getSessionMeta("session-2");
    expect(meta.model).toBe("gemini-model");
    expect(gemini.getSessionMeta).toHaveBeenCalledWith("session-2");
    expect(codex.getSessionMeta).not.toHaveBeenCalled();
    expect(claude.getSessionMeta).not.toHaveBeenCalled();
  });
});
