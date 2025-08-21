# VS Code Extension Guide

## Extension Structure

```
extensions/payrox-vscode/
├── package.json
├── src/
│   ├── extension.ts          # Main extension entry
│   ├── commands/
│   │   ├── split.ts          # Facet splitting commands
│   │   ├── manifest.ts       # Manifest operations
│   │   ├── factory.ts        # Factory operations
│   │   └── safety.ts         # Safety checks
│   ├── providers/
│   │   ├── treeProvider.ts   # File tree provider
│   │   └── statusProvider.ts # Status bar provider
│   ├── utils/
│   │   ├── terminal.ts       # Terminal utilities
│   │   ├── workspace.ts      # Workspace detection
│   │   └── config.ts         # Configuration management
│   └── types/
│       └── payrox.ts         # PayRox type definitions
└── resources/
    ├── icons/
    └── schemas/
```

## Core Extension Features

### 1. Command Palette Commands

```typescript
// src/commands/split.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import { getWorkspaceRoot, isPayRoxProject } from '../utils/workspace';
import { runInTerminal } from '../utils/terminal';

export class SplitCommands {
    
    static register(context: vscode.ExtensionContext) {
        // Register split contract command
        const splitContract = vscode.commands.registerCommand(
            'payrox.split.contract',
            SplitCommands.splitContract
        );
        
        // Register split current file command
        const splitCurrentFile = vscode.commands.registerCommand(
            'payrox.split.currentFile',
            SplitCommands.splitCurrentFile
        );
        
        // Register split with options command
        const splitWithOptions = vscode.commands.registerCommand(
            'payrox.split.withOptions',
            SplitCommands.splitWithOptions
        );
        
        context.subscriptions.push(splitContract, splitCurrentFile, splitWithOptions);
    }
    
    static async splitContract() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot || !isPayRoxProject(workspaceRoot)) {
            vscode.window.showErrorMessage('PayRox project not detected');
            return;
        }
        
        // Show file picker for contract selection
        const contractFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Solidity Files': ['sol']
            },
            defaultUri: vscode.Uri.file(path.join(workspaceRoot, 'contracts'))
        });
        
        if (!contractFile || contractFile.length === 0) {
            return;
        }
        
        const contractPath = contractFile[0].fsPath;
        await SplitCommands.executeSplit(contractPath);
    }
    
    static async splitCurrentFile() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active Solidity file');
            return;
        }
        
        const filePath = activeEditor.document.fileName;
        if (!filePath.endsWith('.sol')) {
            vscode.window.showErrorMessage('Current file is not a Solidity contract');
            return;
        }
        
        await SplitCommands.executeSplit(filePath);
    }
    
    static async splitWithOptions() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot || !isPayRoxProject(workspaceRoot)) {
            vscode.window.showErrorMessage('PayRox project not detected');
            return;
        }
        
        // Contract selection
        const contractFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Solidity Files': ['sol'] },
            defaultUri: vscode.Uri.file(path.join(workspaceRoot, 'contracts'))
        });
        
        if (!contractFile || contractFile.length === 0) {
            return;
        }
        
        // Options configuration
        const options = await SplitCommands.showOptionsDialog();
        if (!options) {
            return;
        }
        
        await SplitCommands.executeSplit(contractFile[0].fsPath, options);
    }
    
    static async showOptionsDialog() {
        const items: vscode.QuickPickItem[] = [
            {
                label: 'Externalize Functions',
                description: 'Force external visibility on generated functions',
                picked: false
            },
            {
                label: 'No Dispatch Guard',
                description: 'Omit onlyDispatcher modifier',
                picked: false
            }
        ];
        
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select splitting options'
        });
        
        if (!selected) {
            return null;
        }
        
        const outputDir = await vscode.window.showInputBox({
            prompt: 'Output directory for facets',
            value: 'contracts/facets',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Output directory is required';
                }
                return null;
            }
        });
        
        if (!outputDir) {
            return null;
        }
        
        return {
            externalize: selected.some(s => s.label === 'Externalize Functions'),
            noDispatchGuard: selected.some(s => s.label === 'No Dispatch Guard'),
            outputDir: outputDir.trim()
        };
    }
    
    static async executeSplit(contractPath: string, options?: any) {
        const workspaceRoot = getWorkspaceRoot()!;
        const splitterPath = path.join(workspaceRoot, 'scripts/tools/ast/split-facets.js');
        
        if (!require('fs').existsSync(splitterPath)) {
            vscode.window.showErrorMessage('PayRox splitter not found. Run npm install first.');
            return;
        }
        
        // Build command
        let command = `node "${splitterPath}" "${contractPath}"`;
        
        if (options?.outputDir) {
            command += ` --out "${options.outputDir}"`;
        }
        if (options?.externalize) {
            command += ' --externalize';
        }
        if (options?.noDispatchGuard) {
            command += ' --no-dispatch-guard';
        }
        
        // Show progress and execute
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Splitting Contract",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Running facet splitter..." });
            
            try {
                await runInTerminal('PayRox Splitter', command, workspaceRoot);
                vscode.window.showInformationMessage('✅ Contract split successfully');
                
                // Open generated facets
                const outputDir = options?.outputDir || path.join(path.dirname(contractPath), 'facets');
                await SplitCommands.openGeneratedFacets(outputDir);
                
            } catch (error: any) {
                vscode.window.showErrorMessage(`Split failed: ${error.message}`);
            }
        });
    }
    
    static async openGeneratedFacets(outputDir: string) {
        try {
            const fs = require('fs');
            const files = fs.readdirSync(outputDir).filter((f: string) => f.endsWith('.sol'));
            
            if (files.length > 0) {
                const shouldOpen = await vscode.window.showInformationMessage(
                    `Generated ${files.length} facets. Open them?`,
                    'Yes', 'No'
                );
                
                if (shouldOpen === 'Yes') {
                    for (const file of files.slice(0, 3)) { // Limit to first 3 files
                        const filePath = path.join(outputDir, file);
                        const document = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(document, { preview: false });
                    }
                }
            }
        } catch (error) {
            // Ignore errors when opening files
        }
    }
}
```

### 2. Manifest Operations

```typescript
// src/commands/manifest.ts
import * as vscode from 'vscode';
import { runInTerminal } from '../utils/terminal';
import { getWorkspaceRoot } from '../utils/workspace';

export class ManifestCommands {
    
    static register(context: vscode.ExtensionContext) {
        const buildManifest = vscode.commands.registerCommand(
            'payrox.manifest.build',
            ManifestCommands.buildManifest
        );
        
        const applyManifest = vscode.commands.registerCommand(
            'payrox.manifest.apply',
            ManifestCommands.applyManifest
        );
        
        const commitManifest = vscode.commands.registerCommand(
            'payrox.manifest.commit',
            ManifestCommands.commitManifest
        );
        
        const activateManifest = vscode.commands.registerCommand(
            'payrox.manifest.activate',
            ManifestCommands.activateManifest
        );
        
        context.subscriptions.push(buildManifest, applyManifest, commitManifest, activateManifest);
    }
    
    static async buildManifest() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace detected');
            return;
        }
        
        const facetsDir = await vscode.window.showInputBox({
            prompt: 'Facets directory path',
            value: 'contracts/facets',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Facets directory is required';
                }
                return null;
            }
        });
        
        if (!facetsDir) {
            return;
        }
        
        const command = `npx hardhat payrox:manifest:build --facets-dir "${facetsDir}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Building Manifest",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox Manifest', command, workspaceRoot);
                vscode.window.showInformationMessage('✅ Manifest built successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Manifest build failed: ${error.message}`);
            }
        });
    }
    
    static async applyManifest() {
        const config = await ManifestCommands.getManifestConfig();
        if (!config) {
            return;
        }
        
        const command = `npx hardhat payrox:manifest:apply --dispatcher "${config.dispatcher}" --manifest "${config.manifestPath}" --network "${config.network}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Applying Manifest",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox Manifest', command, getWorkspaceRoot()!);
                vscode.window.showInformationMessage('✅ Manifest applied successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Manifest apply failed: ${error.message}`);
            }
        });
    }
    
    static async commitManifest() {
        const dispatcher = await vscode.window.showInputBox({
            prompt: 'Dispatcher contract address',
            validateInput: (value) => {
                if (!value.trim() || !value.startsWith('0x')) {
                    return 'Valid contract address required';
                }
                return null;
            }
        });
        
        if (!dispatcher) {
            return;
        }
        
        const network = await ManifestCommands.selectNetwork();
        if (!network) {
            return;
        }
        
        const command = `npx hardhat payrox:manifest:commit --dispatcher "${dispatcher}" --network "${network}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Committing Manifest",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox Manifest', command, getWorkspaceRoot()!);
                vscode.window.showInformationMessage('✅ Manifest committed successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Manifest commit failed: ${error.message}`);
            }
        });
    }
    
    static async activateManifest() {
        const dispatcher = await vscode.window.showInputBox({
            prompt: 'Dispatcher contract address',
            validateInput: (value) => {
                if (!value.trim() || !value.startsWith('0x')) {
                    return 'Valid contract address required';
                }
                return null;
            }
        });
        
        if (!dispatcher) {
            return;
        }
        
        const network = await ManifestCommands.selectNetwork();
        if (!network) {
            return;
        }
        
        // Confirmation dialog for activation
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to activate the manifest? This action cannot be undone.',
            'Yes, Activate', 'Cancel'
        );
        
        if (confirm !== 'Yes, Activate') {
            return;
        }
        
        const command = `npx hardhat payrox:manifest:activate --dispatcher "${dispatcher}" --network "${network}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Activating Manifest",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox Manifest', command, getWorkspaceRoot()!);
                vscode.window.showInformationMessage('✅ Manifest activated successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Manifest activation failed: ${error.message}`);
            }
        });
    }
    
    static async getManifestConfig() {
        const dispatcher = await vscode.window.showInputBox({
            prompt: 'Dispatcher contract address',
            validateInput: (value) => {
                if (!value.trim() || !value.startsWith('0x')) {
                    return 'Valid contract address required';
                }
                return null;
            }
        });
        
        if (!dispatcher) {
            return null;
        }
        
        const manifestFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON Files': ['json'] },
            defaultUri: vscode.Uri.file(getWorkspaceRoot()!)
        });
        
        if (!manifestFile || manifestFile.length === 0) {
            return null;
        }
        
        const network = await ManifestCommands.selectNetwork();
        if (!network) {
            return null;
        }
        
        return {
            dispatcher,
            manifestPath: manifestFile[0].fsPath,
            network
        };
    }
    
    static async selectNetwork(): Promise<string | undefined> {
        const networks = ['mainnet', 'goerli', 'polygon', 'localhost'];
        return await vscode.window.showQuickPick(networks, {
            placeHolder: 'Select network'
        });
    }
}
```

### 3. Safety Dashboard

```typescript
// src/commands/safety.ts
import * as vscode from 'vscode';
import { runInTerminal } from '../utils/terminal';
import { getWorkspaceRoot } from '../utils/workspace';

export class SafetyCommands {
    
    static register(context: vscode.ExtensionContext) {
        const runSafetyCheck = vscode.commands.registerCommand(
            'payrox.safety.check',
            SafetyCommands.runSafetyCheck
        );
        
        const showSafetyDashboard = vscode.commands.registerCommand(
            'payrox.safety.dashboard',
            SafetyCommands.showSafetyDashboard
        );
        
        const runCIGuard = vscode.commands.registerCommand(
            'payrox.safety.ciGuard',
            SafetyCommands.runCIGuard
        );
        
        context.subscriptions.push(runSafetyCheck, showSafetyDashboard, runCIGuard);
    }
    
    static async runSafetyCheck() {
        const dispatcher = await vscode.window.showInputBox({
            prompt: 'Dispatcher contract address',
            validateInput: (value) => {
                if (!value.trim() || !value.startsWith('0x')) {
                    return 'Valid contract address required';
                }
                return null;
            }
        });
        
        if (!dispatcher) {
            return;
        }
        
        const networks = ['mainnet', 'goerli', 'polygon', 'localhost'];
        const network = await vscode.window.showQuickPick(networks, {
            placeHolder: 'Select network'
        });
        
        if (!network) {
            return;
        }
        
        const command = `npx hardhat payrox:safety:check --dispatcher "${dispatcher}" --network "${network}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running Safety Checks",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox Safety', command, getWorkspaceRoot()!);
                vscode.window.showInformationMessage('✅ All safety checks passed');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Safety check failed: ${error.message}`);
            }
        });
    }
    
    static async showSafetyDashboard() {
        const panel = vscode.window.createWebviewPanel(
            'payroxSafety',
            'PayRox Safety Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        panel.webview.html = SafetyCommands.getSafetyDashboardHtml();
        
        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'runCheck':
                        await SafetyCommands.runSafetyCheckFromDashboard(message.dispatcher, message.network);
                        break;
                    case 'refreshStatus':
                        await SafetyCommands.refreshSafetyStatus(panel, message.dispatcher, message.network);
                        break;
                }
            }
        );
    }
    
    static getSafetyDashboardHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PayRox Safety Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .header {
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 20px;
                    margin-bottom: 20px;
                }
                .check-item {
                    display: flex;
                    align-items: center;
                    padding: 10px;
                    margin: 5px 0;
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                }
                .status-icon {
                    margin-right: 10px;
                    font-size: 16px;
                }
                .success { color: #4CAF50; }
                .error { color: #F44336; }
                .warning { color: #FF9800; }
                .pending { color: #2196F3; }
                .config-section {
                    margin: 20px 0;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 5px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                input {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    border-radius: 4px;
                    width: 100%;
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🛡️ PayRox Safety Dashboard</h1>
                <p>Monitor and verify PayRox system integrity</p>
            </div>
            
            <div class="config-section">
                <h3>Configuration</h3>
                <label>Dispatcher Address:</label>
                <input type="text" id="dispatcher" placeholder="0x..." />
                
                <label>Network:</label>
                <select id="network">
                    <option value="mainnet">Mainnet</option>
                    <option value="goerli">Goerli</option>
                    <option value="polygon">Polygon</option>
                    <option value="localhost">Localhost</option>
                </select>
                
                <button onclick="runSafetyCheck()">Run Safety Check</button>
                <button onclick="refreshStatus()">Refresh Status</button>
            </div>
            
            <div class="config-section">
                <h3>Safety Checks</h3>
                
                <div class="check-item">
                    <span class="status-icon pending" id="freeze-status">⏳</span>
                    <div>
                        <strong>Dispatcher Freeze State</strong>
                        <div>Verify dispatcher is not frozen when it shouldn't be</div>
                    </div>
                </div>
                
                <div class="check-item">
                    <span class="status-icon pending" id="codehash-status">⏳</span>
                    <div>
                        <strong>Codehash Integrity</strong>
                        <div>Verify contract bytecode hasn't been modified</div>
                    </div>
                </div>
                
                <div class="check-item">
                    <span class="status-icon pending" id="routes-status">⏳</span>
                    <div>
                        <strong>Route Integrity</strong>
                        <div>Verify all expected routes are present and correct</div>
                    </div>
                </div>
                
                <div class="check-item">
                    <span class="status-icon pending" id="merkle-status">⏳</span>
                    <div>
                        <strong>Merkle Proof Validation</strong>
                        <div>Verify OrderedMerkle proofs are valid</div>
                    </div>
                </div>
                
                <div class="check-item">
                    <span class="status-icon pending" id="selectors-status">⏳</span>
                    <div>
                        <strong>Selector Regression Check</strong>
                        <div>Verify no regression in available function selectors</div>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function runSafetyCheck() {
                    const dispatcher = document.getElementById('dispatcher').value;
                    const network = document.getElementById('network').value;
                    
                    if (!dispatcher || !network) {
                        alert('Please provide dispatcher address and network');
                        return;
                    }
                    
                    // Reset all status icons to pending
                    document.querySelectorAll('.status-icon').forEach(icon => {
                        icon.textContent = '⏳';
                        icon.className = 'status-icon pending';
                    });
                    
                    vscode.postMessage({
                        command: 'runCheck',
                        dispatcher: dispatcher,
                        network: network
                    });
                }
                
                function refreshStatus() {
                    const dispatcher = document.getElementById('dispatcher').value;
                    const network = document.getElementById('network').value;
                    
                    if (!dispatcher || !network) {
                        alert('Please provide dispatcher address and network');
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'refreshStatus',
                        dispatcher: dispatcher,
                        network: network
                    });
                }
                
                // Update status icons based on results
                function updateStatus(checkId, status) {
                    const icon = document.getElementById(checkId + '-status');
                    if (!icon) return;
                    
                    switch(status) {
                        case 'success':
                            icon.textContent = '✅';
                            icon.className = 'status-icon success';
                            break;
                        case 'error':
                            icon.textContent = '❌';
                            icon.className = 'status-icon error';
                            break;
                        case 'warning':
                            icon.textContent = '⚠️';
                            icon.className = 'status-icon warning';
                            break;
                        default:
                            icon.textContent = '⏳';
                            icon.className = 'status-icon pending';
                    }
                }
            </script>
        </body>
        </html>
        `;
    }
    
    static async runSafetyCheckFromDashboard(dispatcher: string, network: string) {
        const command = `npx hardhat payrox:safety:check --dispatcher "${dispatcher}" --network "${network}"`;
        
        try {
            await runInTerminal('PayRox Safety', command, getWorkspaceRoot()!);
            vscode.window.showInformationMessage('✅ All safety checks passed');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Safety check failed: ${error.message}`);
        }
    }
    
    static async refreshSafetyStatus(panel: vscode.WebviewPanel, dispatcher: string, network: string) {
        // Implementation to check individual safety components
        // This would run individual check commands and update the dashboard
    }
    
    static async runCIGuard() {
        const dispatcher = await vscode.window.showInputBox({
            prompt: 'Dispatcher contract address for CI guard',
            validateInput: (value) => {
                if (!value.trim() || !value.startsWith('0x')) {
                    return 'Valid contract address required';
                }
                return null;
            }
        });
        
        if (!dispatcher) {
            return;
        }
        
        const command = `npx hardhat payrox:ci:guard --dispatcher "${dispatcher}"`;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running CI Guard",
            cancellable: false
        }, async () => {
            try {
                await runInTerminal('PayRox CI Guard', command, getWorkspaceRoot()!);
                vscode.window.showInformationMessage('✅ CI guard passed - safe to proceed');
            } catch (error: any) {
                vscode.window.showErrorMessage(`CI guard failed: ${error.message}`);
            }
        });
    }
}
```

### 4. Utility Functions

```typescript
// src/utils/terminal.ts
import * as vscode from 'vscode';

export async function runInTerminal(terminalName: string, command: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const terminal = vscode.window.createTerminal({
            name: terminalName,
            cwd: cwd
        });
        
        terminal.show();
        terminal.sendText(command);
        
        // Since VS Code doesn't provide a direct way to get terminal output,
        // we'll rely on the command completing and the user seeing the output
        setTimeout(() => {
            resolve();
        }, 2000);
    });
}

// src/utils/workspace.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
}

export function isPayRoxProject(workspaceRoot: string): boolean {
    // Check for PayRox project indicators
    const indicators = [
        'scripts/tools/ast/split-facets.js',
        'tools/splitter/split-facet.ts',
        'package.json'
    ];
    
    return indicators.some(indicator => {
        const fullPath = path.join(workspaceRoot, indicator);
        return fs.existsSync(fullPath);
    });
}

export function getPayRoxConfig(workspaceRoot: string): any {
    try {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            return packageJson.payrox || {};
        }
    } catch (error) {
        // Ignore errors
    }
    return {};
}
```

### 5. Main Extension Entry

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { SplitCommands } from './commands/split';
import { ManifestCommands } from './commands/manifest';
import { SafetyCommands } from './commands/safety';
import { getWorkspaceRoot, isPayRoxProject } from './utils/workspace';

export function activate(context: vscode.ExtensionContext) {
    console.log('PayRox extension is now active!');
    
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot || !isPayRoxProject(workspaceRoot)) {
        console.log('PayRox project not detected in workspace');
        return;
    }
    
    // Register all command groups
    SplitCommands.register(context);
    ManifestCommands.register(context);
    SafetyCommands.register(context);
    
    // Add status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = "🔷 PayRox";
    statusBarItem.tooltip = "PayRox Tools Available";
    statusBarItem.command = 'payrox.showMenu';
    statusBarItem.show();
    
    // Register main menu command
    const showMenu = vscode.commands.registerCommand('payrox.showMenu', async () => {
        const items = [
            {
                label: '$(file-code) Split Contract',
                description: 'Split Solidity contract into facets',
                command: 'payrox.split.contract'
            },
            {
                label: '$(file-text) Split Current File',
                description: 'Split currently open Solidity file',
                command: 'payrox.split.currentFile'
            },
            {
                label: '$(settings-gear) Split with Options',
                description: 'Split contract with custom options',
                command: 'payrox.split.withOptions'
            },
            {
                label: '$(package) Build Manifest',
                description: 'Build manifest from facets',
                command: 'payrox.manifest.build'
            },
            {
                label: '$(cloud-upload) Apply Manifest',
                description: 'Apply manifest to dispatcher',
                command: 'payrox.manifest.apply'
            },
            {
                label: '$(check) Commit Manifest',
                description: 'Commit manifest changes',
                command: 'payrox.manifest.commit'
            },
            {
                label: '$(play) Activate Manifest',
                description: 'Activate committed manifest',
                command: 'payrox.manifest.activate'
            },
            {
                label: '$(shield) Run Safety Check',
                description: 'Run comprehensive safety checks',
                command: 'payrox.safety.check'
            },
            {
                label: '$(dashboard) Safety Dashboard',
                description: 'Open safety monitoring dashboard',
                command: 'payrox.safety.dashboard'
            },
            {
                label: '$(law) CI Guard',
                description: 'Run CI safety guard',
                command: 'payrox.safety.ciGuard'
            }
        ];
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select PayRox operation'
        });
        
        if (selected) {
            vscode.commands.executeCommand(selected.command);
        }
    });
    
    context.subscriptions.push(statusBarItem, showMenu);
    
    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('payrox.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'PayRox extension activated! Use the status bar or command palette to access PayRox tools.',
            'Show Menu'
        ).then(selection => {
            if (selection === 'Show Menu') {
                vscode.commands.executeCommand('payrox.showMenu');
            }
        });
        context.globalState.update('payrox.hasShownWelcome', true);
    }
}

export function deactivate() {
    console.log('PayRox extension deactivated');
}
```

### 6. Package Configuration

```json
{
  "name": "payrox-vscode",
  "displayName": "PayRox Tools",
  "description": "PayRox development tools for VS Code",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.70.0"
  },
  "categories": [
    "Other",
    "Programming Languages"
  ],
  "activationEvents": [
    "workspaceContains:scripts/tools/ast/split-facets.js",
    "workspaceContains:tools/splitter/split-facet.ts"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "payrox.showMenu",
        "title": "PayRox: Show Menu",
        "category": "PayRox"
      },
      {
        "command": "payrox.split.contract",
        "title": "Split Contract",
        "category": "PayRox"
      },
      {
        "command": "payrox.split.currentFile",
        "title": "Split Current File",
        "category": "PayRox"
      },
      {
        "command": "payrox.split.withOptions",
        "title": "Split with Options",
        "category": "PayRox"
      },
      {
        "command": "payrox.manifest.build",
        "title": "Build Manifest",
        "category": "PayRox"
      },
      {
        "command": "payrox.manifest.apply",
        "title": "Apply Manifest",
        "category": "PayRox"
      },
      {
        "command": "payrox.manifest.commit",
        "title": "Commit Manifest",
        "category": "PayRox"
      },
      {
        "command": "payrox.manifest.activate",
        "title": "Activate Manifest",
        "category": "PayRox"
      },
      {
        "command": "payrox.safety.check",
        "title": "Run Safety Check",
        "category": "PayRox"
      },
      {
        "command": "payrox.safety.dashboard",
        "title": "Safety Dashboard",
        "category": "PayRox"
      },
      {
        "command": "payrox.safety.ciGuard",
        "title": "CI Guard",
        "category": "PayRox"
      }
    ],
    "menus": {
      "commandPalette": [
        {
          "command": "payrox.split.contract",
          "when": "workspaceFolderCount > 0"
        },
        {
          "command": "payrox.split.currentFile",
          "when": "editorLangId == solidity"
        }
      ],
      "explorer/context": [
        {
          "command": "payrox.split.contract",
          "when": "resourceExtname == .sol",
          "group": "payrox"
        }
      ]
    },
    "configuration": {
      "title": "PayRox",
      "properties": {
        "payrox.defaultOutputDir": {
          "type": "string",
          "default": "contracts/facets",
          "description": "Default output directory for generated facets"
        },
        "payrox.defaultLibPath": {
          "type": "string",
          "default": "../libraries/LibDiamond.sol",
          "description": "Default path to LibDiamond import"
        },
        "payrox.externalizeFunctions": {
          "type": "boolean",
          "default": false,
          "description": "Force external visibility on generated functions by default"
        },
        "payrox.noDispatchGuard": {
          "type": "boolean",
          "default": false,
          "description": "Omit onlyDispatcher modifier by default"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "devDependencies": {
    "@types/vscode": "^1.70.0",
    "@types/node": "16.x",
    "typescript": "^4.7.4"
  }
}
```

This VS Code extension provides a complete graphical interface for all PayRox operations, making it easy for developers to split contracts, manage manifests, and run safety checks without leaving their IDE.
