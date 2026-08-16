import { createInterface } from 'node:readline'

const input = createInterface({ input: process.stdin })

input.on('line', (line) => {
	process.stdout.write(`${JSON.stringify({ echo: JSON.parse(line) })}\n`)
})
