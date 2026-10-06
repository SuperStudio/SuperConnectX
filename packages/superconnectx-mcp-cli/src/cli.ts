#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { runMcpCli } from '@superconnectx/mcp'

export async function main(argv = process.argv.slice(2)): Promise<void> {
  await runMcpCli(argv)
}

const isDirectExecution =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
