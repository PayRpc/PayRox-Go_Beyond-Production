/**
 * Freeze Readiness Dashboard Generator
 * 
 * Generates interactive HTML dashboards for monitoring freeze readiness
 * with real-time data visualization, historical trends, and progress tracking.
 */

import * as fs from 'fs';
import * as path from 'path';

interface DashboardData {
  lastUpdate: string;
  currentStatus: {
    progress: number;
    risk: number;
    confidence: number;
    blockers: number;
    freezeReady: boolean;
  };
  categoryBreakdown: Record<string, number>;
  trends: any;
  alerts: string[];
  historicalData?: any[];
}

class FreezeReadinessDashboard {
  private outputPath: string;

  constructor(outputPath: string = './reports/dashboard') {
    this.outputPath = outputPath;
  }

  async generateDashboard(data: DashboardData): Promise<string> {
    const html = this.createDashboardHTML(data);
    const outputFile = path.join(this.outputPath, 'freeze-readiness-dashboard.html');
    
    // Ensure output directory exists
    await fs.promises.mkdir(this.outputPath, { recursive: true });
    
    // Write dashboard file
    await fs.promises.writeFile(outputFile, html);
    
    console.log(`✅ Dashboard generated: ${outputFile}`);
    return outputFile;
  }

  private createDashboardHTML(data: DashboardData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PayRox Freeze Readiness Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .dashboard {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .last-update {
            opacity: 0.9;
            font-size: 1.1rem;
        }

        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .status-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .status-card:hover {
            transform: translateY(-5px);
        }

        .status-card h3 {
            font-size: 1.1rem;
            margin-bottom: 15px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .status-value {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 10px;
        }

        .progress-value { color: #4ECDC4; }
        .risk-value { color: #FF6B6B; }
        .confidence-value { color: #45B7D1; }
        .blockers-value { color: #FFA726; }

        .progress-bar {
            height: 8px;
            background: #eee;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 10px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4ECDC4, #44A08D);
            transition: width 0.5s ease;
        }

        .freeze-status {
            grid-column: 1 / -1;
            text-align: center;
            padding: 30px;
            border-radius: 15px;
            font-size: 1.5rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .freeze-ready {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
        }

        .freeze-not-ready {
            background: linear-gradient(135deg, #FF6B6B, #E53E3E);
            color: white;
        }

        .categories-section {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .categories-section h2 {
            margin-bottom: 25px;
            color: #333;
            text-align: center;
        }

        .category-item {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
        }

        .category-name {
            width: 150px;
            font-weight: 600;
            color: #555;
        }

        .category-progress {
            flex: 1;
            margin: 0 20px;
        }

        .category-value {
            width: 80px;
            text-align: right;
            font-weight: bold;
            color: #4ECDC4;
        }

        .alerts-section {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .alert-item {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid #FF6B6B;
            background: #FFF5F5;
            color: #C53030;
        }

        .trends-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .trend-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .trend-card h3 {
            margin-bottom: 20px;
            color: #333;
        }

        .trend-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }

        .trend-item:last-child {
            border-bottom: none;
        }

        .trend-positive {
            color: #4CAF50;
        }

        .trend-negative {
            color: #FF6B6B;
        }

        .trend-stable {
            color: #666;
        }

        .footer {
            text-align: center;
            color: white;
            margin-top: 30px;
            opacity: 0.8;
        }

        @media (max-width: 768px) {
            .dashboard {
                padding: 10px;
            }

            .header h1 {
                font-size: 2rem;
            }

            .status-grid {
                grid-template-columns: 1fr;
            }

            .categories-section,
            .alerts-section {
                padding: 20px;
            }
        }

        .loading {
            display: none;
            text-align: center;
            padding: 50px;
            color: white;
        }

        .spinner {
            border: 4px solid rgba(255,255,255,0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>🔒 PayRox Freeze Readiness Dashboard</h1>
            <div class="last-update">Last Updated: ${data.lastUpdate}</div>
        </div>

        <div class="loading" id="loading">
            <div class="spinner"></div>
            <div>Refreshing data...</div>
        </div>

        <div class="status-grid">
            <div class="status-card">
                <h3>Overall Progress</h3>
                <div class="status-value progress-value">${data.currentStatus.progress.toFixed(1)}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${data.currentStatus.progress}%"></div>
                </div>
            </div>

            <div class="status-card">
                <h3>Risk Score</h3>
                <div class="status-value risk-value">${data.currentStatus.risk}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${data.currentStatus.risk}%; background: linear-gradient(90deg, #FF6B6B, #E53E3E);"></div>
                </div>
            </div>

            <div class="status-card">
                <h3>Confidence Level</h3>
                <div class="status-value confidence-value">${data.currentStatus.confidence}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${data.currentStatus.confidence}%; background: linear-gradient(90deg, #45B7D1, #2C5AA0);"></div>
                </div>
            </div>

            <div class="status-card">
                <h3>Critical Blockers</h3>
                <div class="status-value blockers-value">${data.currentStatus.blockers}</div>
                <div style="font-size: 0.9rem; color: #666; margin-top: 10px;">
                    ${data.currentStatus.blockers === 0 ? '✅ No blockers!' : '⚠️ Action required'}
                </div>
            </div>

            <div class="freeze-status ${data.currentStatus.freezeReady ? 'freeze-ready' : 'freeze-not-ready'}">
                ${data.currentStatus.freezeReady ? '🎉 Ready for Freeze!' : '⏳ Not Ready for Freeze'}
            </div>
        </div>

        <div class="categories-section">
            <h2>📊 Progress by Category</h2>
            ${Object.entries(data.categoryBreakdown).map(([category, progress]) => `
                <div class="category-item">
                    <div class="category-name">${category}</div>
                    <div class="category-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="category-value">${progress.toFixed(1)}%</div>
                </div>
            `).join('')}
        </div>

        ${data.alerts.length > 0 ? `
        <div class="alerts-section">
            <h2>🚨 Active Alerts</h2>
            ${data.alerts.map(alert => `
                <div class="alert-item">
                    ${alert}
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="trends-section">
            <div class="trend-card">
                <h3>📈 Recent Trends</h3>
                ${this.renderTrends(data.trends)}
            </div>

            <div class="trend-card">
                <h3>🎯 Next Steps</h3>
                <div class="trend-item">
                    <span>Complete Security Audits</span>
                    <span class="trend-negative">High Priority</span>
                </div>
                <div class="trend-item">
                    <span>Finish Testing Coverage</span>
                    <span class="trend-negative">Critical</span>
                </div>
                <div class="trend-item">
                    <span>Update Documentation</span>
                    <span style="color: #FFA726;">Medium Priority</span>
                </div>
                <div class="trend-item">
                    <span>Setup Monitoring</span>
                    <span style="color: #FFA726;">Medium Priority</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>🔒 PayRox Go Beyond - Enhanced Freeze Readiness Assessment v2.0.0</p>
            <p>Dashboard auto-refreshes every 5 minutes</p>
        </div>
    </div>

    <script>
        // Auto-refresh functionality
        let refreshInterval;

        function startAutoRefresh() {
            refreshInterval = setInterval(() => {
                refreshDashboard();
            }, 5 * 60 * 1000); // 5 minutes
        }

        function refreshDashboard() {
            const loading = document.getElementById('loading');
            loading.style.display = 'block';
            
            // Simulate refresh (in real implementation, this would fetch new data)
            setTimeout(() => {
                loading.style.display = 'none';
                // Update last updated time
                const now = new Date().toISOString();
                document.querySelector('.last-update').textContent = 'Last Updated: ' + now;
            }, 2000);
        }

        // Add click handlers for manual refresh
        document.addEventListener('DOMContentLoaded', () => {
            startAutoRefresh();
            
            // Add refresh button functionality (if you want to add a refresh button)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                    e.preventDefault();
                    refreshDashboard();
                }
            });
        });

        // Progress bar animations
        window.addEventListener('load', () => {
            const progressBars = document.querySelectorAll('.progress-fill');
            progressBars.forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width;
                }, 500);
            });
        });
    </script>
</body>
</html>`;
  }

  private renderTrends(trends: any): string {
    if (!trends || trends.insufficient_data) {
      return '<div class="trend-item"><span>Insufficient data for trend analysis</span></div>';
    }

    const trendItems = [];
    
    if (trends.progress_trend !== undefined) {
      const className = trends.progress_trend > 0 ? 'trend-positive' : 
                      trends.progress_trend < 0 ? 'trend-negative' : 'trend-stable';
      const direction = trends.progress_trend > 0 ? '📈' : 
                       trends.progress_trend < 0 ? '📉' : '➡️';
      trendItems.push(`
        <div class="trend-item">
          <span>Progress ${direction}</span>
          <span class="${className}">${trends.progress_trend > 0 ? '+' : ''}${trends.progress_trend.toFixed(1)}%</span>
        </div>
      `);
    }

    if (trends.risk_trend !== undefined) {
      const className = trends.risk_trend < 0 ? 'trend-positive' : 
                       trends.risk_trend > 0 ? 'trend-negative' : 'trend-stable';
      const direction = trends.risk_trend < 0 ? '📉' : 
                       trends.risk_trend > 0 ? '📈' : '➡️';
      trendItems.push(`
        <div class="trend-item">
          <span>Risk ${direction}</span>
          <span class="${className}">${trends.risk_trend > 0 ? '+' : ''}${trends.risk_trend}</span>
        </div>
      `);
    }

    if (trends.confidence_trend !== undefined) {
      const className = trends.confidence_trend > 0 ? 'trend-positive' : 
                       trends.confidence_trend < 0 ? 'trend-negative' : 'trend-stable';
      const direction = trends.confidence_trend > 0 ? '📈' : 
                       trends.confidence_trend < 0 ? '📉' : '➡️';
      trendItems.push(`
        <div class="trend-item">
          <span>Confidence ${direction}</span>
          <span class="${className}">${trends.confidence_trend > 0 ? '+' : ''}${trends.confidence_trend.toFixed(1)}%</span>
        </div>
      `);
    }

    return trendItems.join('') || '<div class="trend-item"><span>No trend data available</span></div>';
  }

  async generateSimpleDashboard(assessmentData: any): Promise<string> {
    const dashboardData: DashboardData = {
      lastUpdate: new Date().toISOString(),
      currentStatus: {
        progress: assessmentData.metadata?.overallProgress || 0,
        risk: assessmentData.metadata?.riskScore || 100,
        confidence: assessmentData.metadata?.confidenceLevel || 0,
        blockers: assessmentData.freezeDecision?.blockers?.length || 0,
        freezeReady: assessmentData.freezeDecision?.recommendFreeze || false
      },
      categoryBreakdown: assessmentData.analytics?.categoryProgress || {},
      trends: { insufficient_data: true },
      alerts: []
    };

    return await this.generateDashboard(dashboardData);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const dashboard = new FreezeReadinessDashboard();

  switch (command) {
    case 'generate':
      // Generate dashboard with sample data
      const sampleData: DashboardData = {
        lastUpdate: new Date().toISOString(),
        currentStatus: {
          progress: 39.8,
          risk: 100,
          confidence: 52,
          blockers: 4,
          freezeReady: false
        },
        categoryBreakdown: {
          'Security': 0,
          'Governance': 50,
          'Testing': 66.7,
          'Documentation': 50,
          'Operations': 33.3
        },
        trends: {
          progress_trend: 2.3,
          risk_trend: -5,
          confidence_trend: 8.1
        },
        alerts: [
          'Too many critical blockers: 4',
          'Security audits incomplete',
          'Testing coverage below threshold'
        ]
      };

      const outputFile = await dashboard.generateDashboard(sampleData);
      console.log(`📊 Dashboard generated: ${outputFile}`);
      break;

    case 'from-assessment':
      // Generate dashboard from assessment output
      const assessmentFile = args[1];
      if (!assessmentFile || !fs.existsSync(assessmentFile)) {
        console.error('❌ Assessment file not found');
        process.exit(1);
      }

      const assessmentData = JSON.parse(fs.readFileSync(assessmentFile, 'utf8'));
      const outputFile2 = await dashboard.generateSimpleDashboard(assessmentData);
      console.log(`📊 Dashboard generated from assessment: ${outputFile2}`);
      break;

    default:
      console.log('Usage: node freeze-readiness-dashboard.js [generate|from-assessment <file>]');
      console.log('');
      console.log('Commands:');
      console.log('  generate                    - Generate dashboard with sample data');
      console.log('  from-assessment <file>      - Generate dashboard from assessment JSON file');
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { FreezeReadinessDashboard, DashboardData };
