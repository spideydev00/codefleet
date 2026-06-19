#!/usr/bin/env node

import { runCli } from './forge-cli.js'

void runCli(process.argv.slice(2)).then(
  code => process.exit(code),
  () => process.exit(3),
)
