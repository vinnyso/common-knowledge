import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const corpusDirectoryName = ".repo-memory";

export const corpusReadme = `# Common Knowledge Corpus

This directory is the repository-local source of truth for durable, project-specific engineering lessons.

## Structure

- \`schema.json\` is the normative JSON Schema for Entry front matter.
- \`entries/<id>.md\` stores each Entry as Markdown with YAML front matter.
- \`log.md\` is the append-only activity log for Entry changes.

Follow the repository-level knowledge protocol in the repository's agent instructions (for example, \`AGENTS.md\`) to decide when to search, read, write, or maintain this Corpus. Read only relevant Entries, verify that they still apply, and use normal Git review for changes.

Do not copy Entries into this file. Do not record secrets, personal information, verbose task transcripts, or one-off observations in the Corpus.
`;

export const corpusLog = `# Common Knowledge Activity Log

Entry activity is appended below, grouped by UTC date. Git remains the authoritative audit trail.
`;

const nonBlankSingleLine = "^(?=.*\\S)[^\\r\\n]+$";
const activityActor = "^(?=\\S)(?=.*\\S$)[^|\\r\\n]+$";
const utcTimestamp =
  "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]+)?Z$";
const entryId = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

export const entrySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:common-knowledge:schema:entry:1",
  title: "Common Knowledge Entry front matter",
  description: "The normative contract for Common Knowledge Entry front matter.",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "id",
    "kind",
    "title",
    "triggers",
    "status",
    "created_at",
    "created_by",
  ],
  properties: {
    schema_version: {
      type: "integer",
      const: 1,
      description: "Entry schema version. The prototype uses version 1.",
    },
    id: {
      type: "string",
      pattern: entryId,
      description: "Unique, stable lowercase Entry slug.",
    },
    kind: {
      type: "string",
      enum: ["gotcha", "pattern", "anti-pattern", "debugging-note"],
    },
    title: {
      type: "string",
      minLength: 1,
      pattern: nonBlankSingleLine,
      description: "A non-empty, single-line, one-sentence lesson.",
    },
    triggers: {
      type: "array",
      minItems: 1,
      items: {
        type: "string",
        minLength: 1,
        pattern: nonBlankSingleLine,
      },
      description: "One or more concrete retrieval cues.",
    },
    status: {
      type: "string",
      enum: ["active", "superseded", "retired"],
    },
    created_at: {
      type: "string",
      format: "date-time",
      pattern: utcTimestamp,
      description: "RFC 3339 UTC timestamp.",
    },
    created_by: {
      type: "string",
      minLength: 1,
      pattern: activityActor,
      description: "Non-empty, unpadded, single-line agent or human identifier without the activity-log delimiter.",
    },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["paths"],
      properties: {
        paths: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            pattern: nonBlankSingleLine,
          },
          description: "Repository-relative glob patterns.",
        },
      },
    },
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "string",
        minLength: 1,
        pattern: nonBlankSingleLine,
      },
      description: "Repository paths, issue references, or other supporting evidence.",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      pattern: utcTimestamp,
      description: "RFC 3339 UTC timestamp.",
    },
    supersedes: {
      type: "string",
      pattern: entryId,
      description: "Identifier of the previous Entry that this Entry replaces.",
    },
  },
} as const;

export class CorpusAlreadyExistsError extends Error {
  constructor(readonly corpusPath: string) {
    super(`a Common Knowledge corpus already exists at ${corpusPath}`);
    this.name = "CorpusAlreadyExistsError";
  }
}

function isErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function initializeCorpus(workingDirectory: string): string {
  const corpusPath = join(workingDirectory, corpusDirectoryName);
  const stagingPath = mkdtempSync(join(workingDirectory, ".repo-memory-init-"));
  let ownsCorpusDirectory = false;

  try {
    mkdirSync(join(stagingPath, "entries"));
    writeFileSync(join(stagingPath, "README.md"), corpusReadme, "utf8");
    writeFileSync(
      join(stagingPath, "schema.json"),
      `${JSON.stringify(entrySchema, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(join(stagingPath, "log.md"), corpusLog, "utf8");

    try {
      mkdirSync(corpusPath);
      ownsCorpusDirectory = true;
    } catch (error) {
      if (isErrorWithCode(error) && error.code === "EEXIST") {
        throw new CorpusAlreadyExistsError(corpusPath);
      }
      throw error;
    }

    for (const name of ["README.md", "schema.json", "log.md", "entries"]) {
      renameSync(join(stagingPath, name), join(corpusPath, name));
    }

    return corpusPath;
  } catch (error) {
    if (ownsCorpusDirectory) {
      rmSync(corpusPath, { recursive: true, force: true });
    }
    throw error;
  } finally {
    rmSync(stagingPath, { recursive: true, force: true });
  }
}
