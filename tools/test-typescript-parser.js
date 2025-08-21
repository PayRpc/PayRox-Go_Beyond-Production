const { execSync } = require('child_process')

try {
  execSync('npx tsc -p tsconfig.hardhat.json --noEmit', { 
    stdio: 'pipe', 
    encoding: 'utf8' 
  })
  console.log('No TypeScript errors')
} catch (error) {
  let output = ''
  if (error.stdout) {
    output = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : error.stdout
  } else if (error.stderr) {
    output = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr
  }
  
  console.log('Raw output length:', output.length)
  
  // Find all lines that contain TypeScript errors
  const errorLines = output.split('\n').filter(line => 
    line.includes('.ts(') && line.includes('): error TS')
  )
  
  console.log('Found error lines:', errorLines.length)
  
  if (errorLines.length > 0) {
    console.log('First few lines:')
    errorLines.slice(0, 5).forEach((line, i) => {
      console.log(`Line ${i + 1}:`, JSON.stringify(line))
      
      // Try different regex patterns
      const patterns = [
        /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/,
        /^([^(]+)\((\d+),(\d+)\): error TS(\d+): (.+)$/,
        /(.+\.ts)\((\d+),(\d+)\): error TS(\d+): (.+)/
      ]
      
      patterns.forEach((pattern, j) => {
        const match = line.match(pattern)
        if (match) {
          console.log(`  Pattern ${j + 1} matched:`, {
            file: match[1],
            line: match[2], 
            col: match[3],
            code: match[4],
            message: match[5]
          })
        }
      })
    })
  }
}
