#!/usr/bin/env node

import process from "node:process";

import { runCli } from "./index.js";

process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
});
