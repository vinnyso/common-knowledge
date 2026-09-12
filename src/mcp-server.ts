import { isAbsolute, posix } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  readKnowledge,
  searchKnowledge,
  validateKnowledge,
} from "./application.js";
import { EntryCommandError } from "./entries.js";

const outcomeStatus = z.enum([
  "ok",
  "no_match",
  "missing_corpus",
  "invalid_entry",
  "lock_contention",
  "not_found",
  "permission_denied",
  "invalid_input",
  "operation_failed",
]);

const searchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  reasons: z.array(z.string()),
});

const toolOutcomeSchema = {
  status: outcomeStatus,
  message: z.string().optional(),
  results: z.array(searchResultSchema).optional(),
  entry: z.string().optional(),
  entry_count: z.number().int().nonnegative().optional(),
};

type ToolOutcome = z.infer<z.ZodObject<typeof toolOutcomeSchema>>;

function textResult(outcome: ToolOutcome) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(outcome, null, 2) }],
    structuredContent: outcome,
  };
}

function errorCodes(error: unknown): readonly string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string") codes.push(code);
    current = current.cause;
  }
  return codes;
}

function failedOutcome(error: unknown): ToolOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (/checkout lock .* is held/u.test(message)) {
    return { status: "lock_contention", message };
  }
  if (/Corpus not found/u.test(message)) {
    return { status: "missing_corpus", message };
  }
  if (/Entry .* does not exist/u.test(message)) {
    return { status: "not_found", message };
  }
  if (
    errorCodes(error).some((code) => code === "EACCES" || code === "EPERM") ||
    /EACCES|EPERM|permission denied/u.test(message)
  ) {
    return { status: "permission_denied", message };
  }
  if (error instanceof EntryCommandError) {
    return { status: "invalid_entry", message };
  }
  return { status: "operation_failed", message };
}

function validRepositoryPath(value: string): boolean {
  if (
    value === "" ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some((segment) => segment === "" || segment === "." || segment === "..") &&
    posix.normalize(value) === value;
}

export function createMcpServer(checkoutRoot: string): McpServer {
  const server = new McpServer(
    { name: "common-knowledge", version: "0.1.0" },
    {
      instructions:
        "Read-only Common Knowledge tools are bound to one configured Git checkout. Search uses repository knowledge from current files; read retrieves one result by Entry ID; validate checks the Corpus. Verify retrieved guidance against current code and evidence.",
    },
  );
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;

  server.registerTool(
    "search",
    {
      title: "Search Common Knowledge",
      description:
        "Search active Common Knowledge Entries in the configured checkout using deterministic Trigger and Scope ranking.",
      inputSchema: {
        query: z.string().trim().min(1).max(1000),
        path: z.string().max(4096).refine(validRepositoryPath, {
          message: "path must be a normalized repository-relative path without traversal",
        }).optional(),
        kind: z.enum(["gotcha", "pattern", "anti-pattern", "debugging-note"]).optional(),
      },
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async (input) => {
      try {
        const results = searchKnowledge(checkoutRoot, {
          query: input.query,
          ...(input.path === undefined ? {} : { path: input.path }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
        });
        return textResult(
          results.length === 0
            ? { status: "no_match", results: [] }
            : {
                status: "ok",
                results: results.map((result) => ({
                  ...result,
                  reasons: [...result.reasons],
                })),
              },
        );
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "read",
    {
      title: "Read Common Knowledge Entry",
      description: "Read one Common Knowledge Entry by stable identifier from the configured checkout.",
      inputSchema: {
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      },
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async ({ id }) => {
      try {
        return textResult({ status: "ok", entry: readKnowledge(checkoutRoot, id) });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "validate",
    {
      title: "Validate Common Knowledge Corpus",
      description: "Validate the current Common Knowledge Corpus in the configured checkout.",
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async () => {
      try {
        return textResult({ status: "ok", entry_count: validateKnowledge(checkoutRoot) });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  return server;
}

export async function runMcpServer(checkoutRoot: string): Promise<void> {
  const server = createMcpServer(checkoutRoot);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`Common Knowledge MCP bound to ${checkoutRoot}\n`);
}
