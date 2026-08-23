import type { Writable } from "node:stream";

export const commandNames = [
  "init",
  "search",
  "read",
  "add",
  "update",
  "retire",
  "validate",
] as const;

export type CommandName = (typeof commandNames)[number];

export interface CliContext {
  readonly cwd: string;
  readonly stdout: Writable;
  readonly stderr: Writable;
}

const helpText = `Usage: common-knowledge <command> [options]

Git-native shared project knowledge for coding agents.

Commands:
  init       Initialize a Common Knowledge corpus
  search     Search active entries
  read       Read an entry by identifier
  add        Add an entry from a file
  update     Update an entry from a file
  retire     Retire an entry by identifier
  validate   Validate the corpus

Options:
  -h, --help  Show this help
`;

function isCommandName(value: string): value is CommandName {
  return commandNames.some((command) => command === value);
}

export function runCli(args: readonly string[], context: CliContext): number {
  const command = args[0];

  if (command === undefined || command === "--help" || command === "-h") {
    context.stdout.write(helpText);
    return 0;
  }

  if (!isCommandName(command)) {
    context.stderr.write(`Unknown command: ${command}\n\n${helpText}`);
    return 1;
  }

  // Later issues replace these placeholders with command implementations that
  // use context.cwd as their explicit filesystem root.
  context.stdout.write(`${command}: not implemented yet\n`);
  return 0;
}
