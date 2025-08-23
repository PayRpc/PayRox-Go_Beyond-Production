import * as fs from 'node:fs'

const inFile = process.argv[2]
const outFile = process.argv[3]

if (!inFile || !outFile) {
  console.error('Usage: node mythril-to-sarif.js <input.json> <output.sarif>')
  process.exit(1)
}

if (!fs.existsSync(inFile)) {
  console.error(`Input file not found: ${inFile}`)
  process.exit(1)
}

const r = JSON.parse(fs.readFileSync(inFile, 'utf8'))
const results: any[] = []

for (const item of r.report ?? r) {
  const file = item.file || item.address || 'unknown'
  for (const f of item.findings || []) {
    results.push({
      ruleId: (f.swcID || 'UNKNOWN').toUpperCase(),
      level:
        (f.severity || 'note').toLowerCase() === 'high'
          ? 'error'
          : (f.severity || 'note').toLowerCase() === 'medium'
          ? 'warning'
          : 'note',
      message: { text: `${f.title || ''} — ${f.description || ''}`.trim() },
      locations: [{ physicalLocation: { artifactLocation: { uri: file } } }]
    })
  }
}

const sarif = {
  $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'Mythril',
          informationUri: 'https://mythril-classic.readthedocs.io/'
        }
      },
      results
    }
  ]
}

fs.writeFileSync(outFile, JSON.stringify(sarif, null, 2))
console.log(`✅ Converted ${results.length} findings to SARIF: ${outFile}`)
