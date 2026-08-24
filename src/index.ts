import type { Writable } from "node:stream";

import {
  CorpusAlreadyExistsError,
  corpusDirectoryName,
  initializeCorpus,
} from "./corpus.js";
import {
  addEntry,
  EntryCommandError,
  readEntry,
  retireEntry,
  updateEntry,
  validateCorpus,
} from "./entries.js";
import { withCheckoutLock } from "./lock.js";

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

const commandUsage: Readonly<Record<CommandName, string>> = {
  init: "common-knowledge init",
  search: "common-knowledge search <query> [--path <path>] [--kind <kind>]",
  read: "common-knowledge read <id>",
  add: "common-knowledge add <entry-file>",
  update: "common-knowledge update <entry-file>",
  retire: "common-knowledge retire <id> --reason <reason>",
  validate: "common-knowledge validate",
};

const helpText = `Usage: common-knowledge <command> [options]

Git-native shared project knowledge for coding agents.

Commands:
  init                                      Initialize a Common Knowledge corpus
  search <query> [--path <path>] [--kind <kind>]
                                            Search active entries
  read <id>                                 Read an entry by identifier
  add <entry-file>                          Add an entry from a file
  update <entry-file>                       Update an entry from a file
  retire <id> --reason <reason>             Retire an entry by identifier
  validate                                  Validate the corpus

Options:
  -h, --help  Show this help
`;

function isCommandName(value: string): value is CommandName {
  return commandNames.some((command) => command === value);
}

function missingOperand(name: string): string {
  return `missing required ${name}`;
}

function unsupportedOption(option: string): string {
  return `unsupported option ${JSON.stringify(option)}`;
}

function unexpectedArgument(argument: string): string {
  return `unexpected argument ${JSON.stringify(argument)}`;
}

function validateNoArguments(args: readonly string[]): string | undefined {
  const [argument] = args;
  if (argument === undefined) {
    return undefined;
  }
  return argument.startsWith("-")
    ? unsupportedOption(argument)
    : unexpectedArgument(argument);
}

function validateSingleOperand(
  args: readonly string[],
  operandName: string,
): string | undefined {
  const [operand, extra] = args;
  if (operand === undefined) {
    return missingOperand(operandName);
  }
  if (operand.startsWith("-")) {
    return unsupportedOption(operand);
  }
  if (extra !== undefined) {
    return extra.startsWith("-")
      ? unsupportedOption(extra)
      : unexpectedArgument(extra);
  }
  return undefined;
}

function validateSearch(args: readonly string[]): string | undefined {
  const [query] = args;
  if (query === undefined) {
    return missingOperand("<query>");
  }
  if (query.startsWith("-")) {
    return unsupportedOption(query);
  }

  const seenOptions = new Set<string>();
  for (let index = 1; index < args.length; index += 2) {
    const option = args[index];
    if (option === undefined) {
      break;
    }
    if (option !== "--path" && option !== "--kind") {
      return option.startsWith("-")
        ? unsupportedOption(option)
        : unexpectedArgument(option);
    }
    if (seenOptions.has(option)) {
      return `option ${JSON.stringify(option)} may only be specified once`;
    }
    seenOptions.add(option);

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return `missing value for option ${JSON.stringify(option)}`;
    }
  }
  return undefined;
}

function validateRetire(args: readonly string[]): string | undefined {
  const [id, option, reason, extra] = args;
  if (id === undefined) {
    return missingOperand("<id>");
  }
  if (id.startsWith("-")) {
    return unsupportedOption(id);
  }
  if (option === undefined) {
    return missingOperand("--reason <reason>");
  }
  if (option !== "--reason") {
    return option.startsWith("-")
      ? unsupportedOption(option)
      : unexpectedArgument(option);
  }
  if (reason === undefined || reason.startsWith("--")) {
    return `missing value for option "--reason"`;
  }
  if (extra !== undefined) {
    return extra.startsWith("-")
      ? unsupportedOption(extra)
      : unexpectedArgument(extra);
  }
  return undefined;
}

function validateInvocation(
  command: CommandName,
  args: readonly string[],
): string | undefined {
  switch (command) {
    case "init":
    case "validate":
      return validateNoArguments(args);
    case "read":
      return validateSingleOperand(args, "<id>");
    case "add":
    case "update":
      return validateSingleOperand(args, "<entry-file>");
    case "search":
      return validateSearch(args);
    case "retire":
      return validateRetire(args);
  }
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

  const commandArguments = args.slice(1);
  if (
    commandArguments.length === 1 &&
    (commandArguments[0] === "--help" || commandArguments[0] === "-h")
  ) {
    context.stdout.write(`Usage: ${commandUsage[command]}\n`);
    return 0;
  }

  const invocationError = validateInvocation(command, commandArguments);
  if (invocationError !== undefined) {
    context.stderr.write(
      `Invalid invocation for ${command}: ${invocationError}.\n` +
        `Usage: ${commandUsage[command]}\n`,
    );
    return 1;
  }

  if (command === "init") {
    try {
      withCheckoutLock(context.cwd, command, () => initializeCorpus(context.cwd));
      context.stdout.write(
        `Initialized Common Knowledge corpus at ${corpusDirectoryName}.\n`,
      );
      return 0;
    } catch (error) {
      if (error instanceof CorpusAlreadyExistsError) {
        context.stderr.write(
          `Cannot initialize Common Knowledge corpus: ${corpusDirectoryName} already exists.\n`,
        );
        return 1;
      }

      const detail = error instanceof Error ? error.message : String(error);
      context.stderr.write(
        `Failed to initialize Common Knowledge corpus: ${detail}\n`,
      );
      return 1;
    }
  }

  try {
    switch (command) {
      case "read": {
        const id = commandArguments[0];
        if (id === undefined) throw new Error("unreachable missing read ID");
        context.stdout.write(withCheckoutLock(context.cwd, command, () => readEntry(context.cwd, id)));
        return 0;
      }
      case "add": {
        const file = commandArguments[0];
        if (file === undefined) throw new Error("unreachable missing add file");
        const id = withCheckoutLock(context.cwd, command, () => addEntry(context.cwd, file));
        context.stdout.write(`Added Entry ${id}.\n`);
        return 0;
      }
      case "update": {
        const file = commandArguments[0];
        if (file === undefined) throw new Error("unreachable missing update file");
        const id = withCheckoutLock(context.cwd, command, () => updateEntry(context.cwd, file));
        context.stdout.write(`Updated Entry ${id}.\n`);
        return 0;
      }
      case "retire": {
        const id = commandArguments[0];
        const reason = commandArguments[2];
        if (id === undefined || reason === undefined) {
          throw new Error("unreachable missing retire arguments");
        }
        withCheckoutLock(context.cwd, command, () => retireEntry(context.cwd, id, reason));
        context.stdout.write(`Retired Entry ${id}.\n`);
        return 0;
      }
      case "validate": {
        const count = withCheckoutLock(context.cwd, command, () => validateCorpus(context.cwd));
        context.stdout.write(`Corpus is valid (${count} Entries).\n`);
        return 0;
      }
      case "search":
        break;
    }
  } catch (error) {
    if (error instanceof EntryCommandError) {
      context.stderr.write(`${error.message}.\n`);
      return 1;
    }
    const detail = error instanceof Error ? error.message : String(error);
    context.stderr.write(`Failed to ${command}: ${detail}\n`);
    return 1;
  }

  // Search is implemented by its dedicated issue.
  context.stdout.write(`${command}: not implemented yet\n`);
  return 0;
}
