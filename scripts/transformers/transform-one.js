#!/usr/bin/env node
/**
 * POC transformer:
 * - Build {ContractName}Storage lib
 * - Rewrite state var uses to `l.<var>` with `ContractStorage.Layout storage l = ContractStorage.layout();`
 * - If function marked `pure` but uses storage -> upgrade to `view`
 * - Emit unified diff and JSON report
 *
 * Usage:
 *   node scripts/transformers/transform-one.js --file contracts/My.sol [--contract My]
 *
 * Dev deps: @solidity-parser/parser diff
 */
const fs = require('fs')
const path = require('path')
const parser = require('@solidity-parser/parser')
const diff = require('diff')

function args () {
  const a = process.argv.slice(2)
  const out = { file: null, contract: null }
  for (let _i = 0; i < a.length; i++) {
    if (a[i] === '--file') out.file = a[++i]
    else if (a[i] === '--contract') out.contract = a[++i]
  }
  if (!out.file) throw new Error('Missing --file <path/to.sol>')
  return out
}

function isoTs () {
  return new Date().toISOString().replace(/[:]/g, '-')
}

function mkdirp (p) {
  fs.mkdirSync(p, { recursive: true })
}

function read (srcPath) {
  return fs.readFileSync(srcPath, 'utf8')
}

function write (p, content) {
  mkdirp(path.dirname(p))
  fs.writeFileSync(p, content)
}

function headerOf (source) {
  // Keep SPDX & pragma if present; otherwise return empty header
  const spdx = source.match(/^\s*\/\/\s*SPDX-License-Identifier:[^\r\n]*/m)
  const _pragma = source.match(/^\s*pragma\s+solidity\s+[^;]+;/m)
  let hdr = ''
  if (spdx) hdr += spdx[0] + '\n'
  if (pragma) hdr += pragma[0] + '\n\n'
  if (!hdr) { hdr = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\n\n' }
  return hdr
}

function buildStorageLib (contractName, stateVars) {
  // Namespaced slot with full qualification to avoid collisions
  const slotKey = `payrox.storage.PayRox-Go-Beyond-Ollama.${contractName}.v1`
  const structLines = stateVars
    .filter((v) => !v.dropped)
    .map((v) => `        ${v.type} ${v.name}; // from: ${v.from}`)
  return `library ${contractName}Storage {
    bytes32 internal constant SLOT = keccak256("${slotKey}");
    struct Layout {
${structLines.join('\n')}
    }
    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly { l.slot := slot }
    }
}
`
}

// Accurate type reconstruction for Solidity
function typeToString (t) {
  if (!t) return 'uint256'
  switch (t.type) {
    case 'ElementaryTypeName':
      return t.name
    case 'UserDefinedTypeName':
      return t.namePath
    case 'ArrayTypeName': {
      const base = typeToString(t.baseTypeName)
      return t.length ? `${base}[${t.length.number || ''}]` : `${base}[]`
    }
    case 'Mapping': {
      const key = typeToString(t.keyType)
      const value = typeToString(t.valueType)
      return `mapping(${key} => ${value})`
    }
    case 'FunctionTypeName':
      return 'bytes32 /* function pointer not supported */'
    default:
      return 'bytes /* unknown type */'
  }
}

// ----- Inheritance-aware collection (C3 linearization with safe fallback) -----
function buildContractIndex (ast) {
  /** @type {Record<string, {name:string, bases:string[], vars:Array<{name:string,type:string,declRange?:[number,number],raw?:string}>}>} */
  const idx = {}
  parser.visit(ast, {
    ContractDefinition (node) {
      const bases = (node.baseContracts || [])
        .map(
          (b) => (b.baseName && (b.baseName.name || b.baseName.namePath)) || ''
        )
        .filter(Boolean)
      const vars = []
      for (const sub of node.subNodes) {
        if (sub.type === 'StateVariableDeclaration') {
          for (const v of sub.variables) {
            if (!v?.name) continue
            // Skip constants/immutables conservatively by peeking raw text if available
            const maybeImmutable =
              (sub?.isImmutable) ||
              /immutable\b/.test(JSON.stringify(sub))
            const maybeConstant =
              (sub?.isDeclaredConst) ||
              /constant\b/.test(JSON.stringify(sub))
            if (maybeImmutable || maybeConstant) continue
            // Type extraction with accurate reconstruction
            let ty = 'uint256'
            try {
              ty = typeToString(v.typeName)
            } catch (err) {
              console.warn(
                `Failed to extract type for ${v.name}: ${err.message}`
              )
              ty = 'bytes /* type extraction failed */'
            }
            vars.push({ name: v.name, type: ty, declRange: v.range })
          }
        }
      }
      idx[node.name] = { name: node.name, bases, vars }
    }
  })
  return idx
}

function c3Linearize (name, idx, memo, stack) {
  if (memo[name]) return memo[name].slice()
  if (!idx[name]) return [name]
  stack = stack || new Set()
  if (stack.has(name)) return [name] // cycle guard
  stack.add(name)
  const parents = idx[name].bases || []
  const seqs = parents.map((p) => c3Linearize(p, idx, memo, stack))
  seqs.push(parents.slice()) // local precedence list
  const result = [name]
  // merge
  const heads = () => seqs.map((s) => s[0]).filter(Boolean)
  const tailsContain = (x) => seqs.some((s) => s.slice(1).includes(x))
  while (seqs.some((s) => s.length)) {
    let candidate = null
    for (const h of heads()) {
      if (!tailsContain(h)) {
        candidate = h
        break
      }
    }
    if (!candidate) {
      // fallback: flatten left-to-right DFS
      const seen = new Set(result)
      for (const s of seqs) {
        for (const n of s) {
          if (!seen.has(n)) {
            result.push(n)
            seen.add(n)
          }
        }
      }
      seqs.forEach((s) => (s.length = 0))
      break
    }
    result.push(candidate)
    for (const s of seqs) if (s[0] === candidate) s.shift()
  }
  memo[name] = result.slice()
  return result
}

function collectStateVarsLinearized (ast, targetContract) {
  const idx = buildContractIndex(ast)
  const root = targetContract || Object.keys(idx)[0] || 'Contract'
  const order = c3Linearize(root, idx, {}, new Set())
  // Solidity layout: bases first (most base to most derived), then root.
  // Our c3Linearize returns [C, ...bases merged]; reorder to [bases..., C]
  const linear = order
    .slice(1)
    .concat([root])
    .filter((n, i, a) => a.indexOf(n) === i)
  const acc = []
  const seen = new Set()
  const varDecls = [] // Track state variable declarations for removal

  for (const n of linear) {
    const entry = idx[n]
    if (!entry) continue
    for (const v of entry.vars) {
      if (seen.has(v.name)) {
        // drop duplicate field name to keep struct valid; record separately in report
        acc.push({ name: v.name, type: v.type, from: n, dropped: true })
        continue
      }
      seen.add(v.name)
      acc.push({
        name: v.name,
        type: v.type,
        from: n,
        dropped: false,
        declRange: v.declRange
      })
    }
  }

  // Collect state variable declaration ranges for removal
  parser.visit(ast, {
    StateVariableDeclaration (node) {
      if (node.range) {
        varDecls.push(node.range)
      }
    }
  })

  return {
    contractName: root,
    vars: acc,
    baseOrder: linear.filter((x) => x !== root),
    varDecls
  }
}

function collectConstructors (ast, targetContract) {
  const cons = []
  parser.visit(ast, {
    FunctionDefinition (n) {
      if (n.isConstructor) {
        if (
          targetContract &&
          n.loc?.source &&
          !n.loc.source.endsWith(`${targetContract}.sol`)
        ) {
          /* best-effort */
        }
        const params = (n.parameters?.parameters || [])
          .map((p) => {
            const pt = p.typeName?.name || p.typeName?.namePath || 'uint256'
            return `${pt} ${p.name || '_'}`
          })
          .join(', ')
        cons.push({ name: 'constructor', params, node: n })
      }
    }
  })
  return cons
}

function scopeLocalNames (fn) {
  const locals = new Set()
  // params
  for (const p of fn.parameters?.parameters || []) {
    if (p.name) locals.add(p.name)
  }
  // returns
  for (const r of fn.returnParameters?.parameters || []) {
    if (r.name) locals.add(r.name)
  }
  // local var declarations
  parser.visit(fn, {
    VariableDeclarationStatement (n) {
      for (const v of n.declarations || []) if (v?.name) locals.add(v.name)
    },
    VariableDeclaration (n) {
      if (n.storageLocation !== 'default' && n.name) locals.add(n.name)
    },
    ParameterList () {
      /* already covered */
    }
  })
  return locals
}

function computeEditsForContract (
  source,
  ast,
  contractName,
  stateVarNames,
  libName
) {
  // Collect symbol names to avoid dangerous replacements
  const fnNames = new Set()
  const eventNames = new Set()
  const typeNames = new Set()

  parser.visit(ast, {
    FunctionDefinition (n) {
      if (n.name) fnNames.add(n.name)
    },
    EventDefinition (n) {
      if (n.name) eventNames.add(n.name)
    },
    StructDefinition (n) {
      if (n.name) typeNames.add(n.name)
    },
    EnumDefinition (n) {
      if (n.name) typeNames.add(n.name)
    },
    ContractDefinition (n) {
      if (n.name) typeNames.add(n.name)
    }
  })

  // Find function bodies that touch any state var identifiers not shadowed
  const edits = [] // {start, end, text} insert/replace
  const patches = [] // human-readable
  parser.visit(ast, {
    FunctionDefinition (fn) {
      if (!fn.body || fn.kind === 'constructor') return
      const locals = scopeLocalNames(fn)
      const hits = []

      // Use regex-based approach for more reliable identifier matching
      const stateVarList = Array.from(stateVarNames)
      for (const varName of stateVarList) {
        if (
          locals.has(varName) ||
          fnNames.has(varName) ||
          eventNames.has(varName) ||
          typeNames.has(varName)
        ) {
          continue // Skip if shadowed by local variable or conflicts with symbol
        }

        // Create regex that matches whole word boundaries
        const regex = new RegExp(`\\b${varName}\\b`, 'g')
        let match
        const fnStart = fn.body.range ? fn.body.range[0] : 0
        const fnEnd = fn.body.range ? fn.body.range[1] : source.length
        const fnBodySource = source.slice(fnStart, fnEnd)

        while ((match = regex.exec(fnBodySource)) !== null) {
          const absoluteStart = fnStart + match.index
          const absoluteEnd = absoluteStart + match[0].length
          hits.push({ start: absoluteStart, end: absoluteEnd, name: varName })
        }
      }

      if (!hits.length) return

      // Insert `ContractStorage.Layout storage l = ContractStorage.layout();` after opening brace
      const bodyStart = fn.body.range?.[0] // index of '{'
      if (typeof bodyStart === 'number') {
        const _insertText = `{\n        ${libName}.Layout storage l = ${libName}.layout();\n`
        edits.push({ start: bodyStart, end: bodyStart + 1, text: insertText })
        patches.push(`insert l=layout() in ${fn.name || '<fallback>'}`)
      }

      // Replace each hit with l.<name>
      for (const h of hits) {
        edits.push({ start: h.start, end: h.end, text: `l.${h.name}` })
      }

      // If fn.stateMutability === 'pure', upgrade header to 'view'
      if (
        fn.stateMutability === 'pure' &&
        fn.loc &&
        fn.range &&
        fn.body?.range
      ) {
        const hdrStart = fn.range[0]
        const hdrEnd = fn.body.range[0] // up to '{'
        const hdr = source.slice(hdrStart, hdrEnd)
        if (/\bpure\b/.test(hdr)) {
          const newHdr = hdr.replace(/\bpure\b/g, 'view')
          edits.push({ start: hdrStart, end: hdrEnd, text: newHdr })
          patches.push(
            `upgrade mutability pure→view on ${fn.name || '<fallback>'}`
          )
        }
      }
    }
  })

  // Sort edits in reverse order so indices remain valid
  edits.sort((a, b) => b.start - a.start)

  let transformed = source
  for (const e of edits) {
    transformed =
      transformed.slice(0, e.start) + e.text + transformed.slice(e.end)
  }
  return { transformed, patches }
}

function makeInitializerStub (constructors, contractName, libName) {
  if (!constructors.length) return ''

  // Extract constructor body if available
  const constructorBody =
    constructors[0].node?.body
      ? extractConstructorBody(constructors[0].node)
      : '// TODO: migrate constructor body here'

  const sig = `function initialize(${constructors[0].params}) external`
  return `
    // --- Auto-generated initializer stub (constructor lifted) ---
    ${sig} {
        ${libName}.Layout storage l = ${libName}.layout();
        require(!l.__initialized, "AlreadyInitialized");
        l.__initialized = true;
        ${constructorBody}
    }
`
}

function extractConstructorBody (constructorNode) {
  // Basic extraction - in production would need more sophisticated parsing
  if (!constructorNode.body?.statements) {
    return '// TODO: migrate constructor body here'
  }
  return '// TODO: migrate constructor statements here'
}

function addInitializedVar (stateVars, contractName) {
  if (!stateVars.find((v) => v.name === '__initialized')) {
    stateVars.unshift({
      name: '__initialized',
      type: 'bool',
      from: contractName || 'Self',
      dropped: false
    })
  }
}

function run () {
  const { file, contract } = args()
  const srcPath = path.resolve(process.cwd(), file)
  const source = read(srcPath)

  let ast
  try {
    ast = parser.parse(source, { loc: true, range: true, tolerant: true })
  } catch (e) {
    console.error(
      JSON.stringify({ ok: false, error: 'parse failed', detail: String(e) })
    )
    process.exit(1)
  }

  const contractInfo = collectStateVarsLinearized(ast, contract)
  const contractName = contract || contractInfo.contractName || 'Contract'
  const stateVars = contractInfo.vars.slice() // includes base vars with {from, dropped}
  const varDecls = contractInfo.varDecls || []
  addInitializedVar(stateVars, contractName)

  const libName = `${contractName}Storage`
  const constructors = collectConstructors(ast, contractName)

  const stateVarNames = new Set(
    stateVars.filter((v) => !v.dropped).map((v) => v.name)
  )

  // Apply state variable access transformations first (on original source)
  const { transformed: contractTransformed, patches } = computeEditsForContract(
    source,
    ast,
    contractName,
    stateVarNames,
    libName
  )

  let finalContract = contractTransformed

  const libCode = buildStorageLib(contractName, stateVars)
  const hdr = headerOf(source)

  // Remove original state variable declarations (reverse order to preserve indices)
  varDecls
    .sort((a, b) => b[0] - a[0])
    .forEach(([start, end]) => {
      finalContract =
        finalContract.slice(0, start) +
        `    /* state moved to ${libName}.Layout */\n` +
        finalContract.slice(end)
    })

  // Compose final file: keep original (patched) contract source + append initializer stub into contract
  // Append initializer into the first occurrence of `contract <Name>`
  const contractDeclRe = new RegExp(`(contract\\s+${contractName}\\s*[^{]*{)`)
  if (contractDeclRe.test(finalContract) && constructors.length) {
    finalContract = finalContract.replace(
      contractDeclRe,
      `$1\n${makeInitializerStub(constructors, contractName, libName)}\n`
    )
  }

  // Remove constructors last to avoid corrupting AST parsing
  const constructorRanges = []
  parser.visit(ast, {
    FunctionDefinition (node) {
      if (node.isConstructor && node.range) {
        constructorRanges.push(node.range)
      }
    }
  })
  constructorRanges
    .sort((a, b) => b[0] - a[0])
    .forEach(([start, end]) => {
      finalContract =
        finalContract.slice(0, start) +
        '    /* constructor moved to initialize() */\n' +
        finalContract.slice(end)
    })

  const finalOutput = `${hdr}${libCode}\n${finalContract}`
  const outRoot = path.resolve(
    process.cwd(),
    '.payrox',
    'generated',
    'transformers',
    isoTs()
  )
  const appliedDir = path.join(outRoot, 'applied')
  const baseName = path.basename(srcPath, '.sol')
  const outFile = path.join(appliedDir, `${baseName}_Transformed.sol`)
  const patchFile = path.join(appliedDir, `${baseName}.patch`)
  const jsonFile = path.join(outRoot, 'changes.json')
  const reportFile = path.join(outRoot, 'report.md')

  // Write files
  write(outFile, finalOutput)
  const unified = diff.createTwoFilesPatch(
    path.basename(srcPath),
    path.basename(outFile),
    source,
    finalOutput,
    '',
    ''
  )
  write(patchFile, unified)

  const report = {
    ok: true,
    file: srcPath,
    contract: contractName,
    storageLib: libName,
    baseOrder: contractInfo.baseOrder,
    stateVars,
    droppedDuplicates: stateVars
      .filter((v) => v.dropped)
      .map((v) => ({ name: v.name, from: v.from })),
    patches,
    outFile,
    patchFile
  }
  write(jsonFile, JSON.stringify(report, null, 2))
  write(
    reportFile,
    `# Transform Report\n\n- Contract: ${contractName}\n- Storage lib: ${libName}\n- Output: ${outFile}\n- Patch: ${patchFile}\n\n## Edits\n${patches.map((p) => `- ${p}`).join('\n')}\n`
  )

  console.log(JSON.stringify(report, null, 2))
}

try {
  run()
} catch (e) {
  console.error(
    JSON.stringify({ ok: false, error: String((e?.message) || e) })
  )
  process.exit(1)
}
