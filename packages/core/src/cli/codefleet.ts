#!/usr/bin/env node

import { runCli } from './codefleet-cli.js'

void runCli(process.argv.slice(2)).then(
  code => process.exit(code),
  () => process.exit(3),
)
