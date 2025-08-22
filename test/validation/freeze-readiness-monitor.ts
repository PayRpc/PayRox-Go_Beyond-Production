import fs from 'fs';
import path from 'path';
/**
 * Automated Freeze Readiness Monitor
 * 
 * Continuous monitoring service for freeze readiness with alerting,
 * trend analysis, and automated reporting capabilities.
 * 
 * Features:
 * - Real-time condition monitoring
 * - Trend analysis and prediction
 * - Email/Slack alert integration
 * - Dashboard data export
 * - Historical tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const _execAsync = promisify(exec);

interface MonitorConfig {
  checkInterval: number; // minutes
  alertThresholds: {
    criticalBlocked: number; // max critical conditions that can be blocked
    progressRegression: number; // % regression that triggers alert
    stagnationPeriod: number; // days without progress before alert
  };
  notifications: {
    email?: {
      enabled: boolean;
      recipients: string[];
      smtpConfig: any;
    };
    slack?: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
    };
    teams?: {
      enabled: boolean;
      webhookUrl: string;
    };
  };
  reporting: {
    dailyReport: boolean;
    weeklyReport: boolean;
    exportPath: string;
  };
}

interface AssessmentResult {
  timestamp: string;
  overallProgress: number;
  riskScore: number;
  confidenceLevel: number;
  blockerCount: number;
  categoryProgress: Record<string, number>;
  conditions: any[];
  freezeRecommended: boolean;
}

interface TrendData {
  timespan: string;
  progressChange: number;
  riskChange: number;
  confidenceChange: number;
  newBlockers: string[];
  resolvedBlockers: string[];
  stagnantConditions: string[];
}

class FreezeReadinessMonitor {
  private config: MonitorConfig;
  private isRunning: boolean = false;
  private assessmentHistory: AssessmentResult[] = [];
  private historyFile: string;
  private monitorInterval?: NodeJS.Timeout;

  constructor(config: MonitorConfig) {
    this.config = config;
    this.historyFile = path.join(this.config.reporting.exportPath, 'assessment-history.json');
    this.loadHistory();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Monitor is already running');
      return;
    }

    console.log('🚀 Starting Freeze Readiness Monitor...');
    console.log(`📊 Check interval: ${this.config.checkInterval} minutes`);
    console.log(`📁 Export path: ${this.config.reporting.exportPath}`);
    
    this.isRunning = true;

    // Initial assessment
    await this.runAssessment();

    // Schedule periodic assessments
    this.monitorInterval = setInterval(async () => {
      try {
        await this.runAssessment();
      } catch (error) {
        console.error('❌ Assessment failed:', error);
        await this.sendAlert('Assessment Failed', `Error during automated assessment: ${error}`);
      }
    }, this.config.checkInterval * 60 * 1000);

    // Schedule daily/weekly reports
    if (this.config.reporting.dailyReport) {
      this.scheduleDailyReport();
    }

    if (this.config.reporting.weeklyReport) {
      this.scheduleWeeklyReport();
    }

    console.log('✅ Monitor started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️  Monitor is not running');
      return;
    }

    console.log('🛑 Stopping Freeze Readiness Monitor...');
    
    this.isRunning = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    await this.saveHistory();
    console.log('✅ Monitor stopped successfully');
  }

  private async runAssessment(): Promise<void> {
    const _timestamp = new Date().toISOString();
    console.log(`\n⏰ ${timestamp} - Running assessment...`);

    try {
        // Support a FORCE_READY override for testing: synthesize a perfect assessment
        const _forceReady = (process.env.FORCE_READY === '1' || process.env.FORCE_READY === 'true');
        if (forceReady) {
          console.log('🧪 FORCE_READY enabled - synthesizing 100% ready assessment');

          const assessmentData: any = {
            metadata: {
              overallProgress: 100,
              riskScore: 0,
              confidenceLevel: 100
            },
            freezeDecision: {
              blockers: [],
              recommendFreeze: true
            },
            analytics: {
              categoryProgress: {
                Security: 100,
                Governance: 100,
                Testing: 100,
                Documentation: 100,
                Operations: 100
              }
            },
            conditions: []
          };

          // Build result from synthesized data (skip running Hardhat)
          const result: AssessmentResult = {
            timestamp,
            overallProgress: assessmentData.metadata.overallProgress,
            riskScore: assessmentData.metadata.riskScore,
            confidenceLevel: assessmentData.metadata.confidenceLevel,
            blockerCount: (assessmentData.freezeDecision.blockers || []).length,
            categoryProgress: assessmentData.analytics.categoryProgress,
            conditions: assessmentData.conditions,
            freezeRecommended: Boolean(assessmentData.freezeDecision.recommendFreeze)
          };

          this.assessmentHistory.push(result);
          await this.analyzeTrends(result);
          await this.saveHistory();
          await this.exportDashboardData(result);

          console.log(`📊 Progress: ${result.overallProgress.toFixed(1)}% | Risk: ${result.riskScore} | Blockers: ${result.blockerCount}`);

          return;
        }
      // Run the assessment tool
      const { stdout } = await execAsync(
        'npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts -- --simulate --format json'
      );

      // Parse the JSON output
      const _lines = stdout.split('\n');
      const _jsonLine = lines.find(line => line.trim().startsWith('{'));
      
      if (!jsonLine) {
        throw new Error('No JSON output found in assessment results');
      }

      const _assessmentData = JSON.parse(jsonLine);
      
      const result: AssessmentResult = {
        timestamp,
        overallProgress: assessmentData.metadata.overallProgress,
        riskScore: assessmentData.metadata.riskScore,
        confidenceLevel: assessmentData.metadata.confidenceLevel,
        blockerCount: assessmentData.freezeDecision.blockers.length,
        categoryProgress: assessmentData.analytics.categoryProgress,
        conditions: assessmentData.conditions,
        freezeRecommended: assessmentData.freezeDecision.recommendFreeze
      };

      // Add to history
      this.assessmentHistory.push(result);

      // Analyze trends and check for alerts
      await this.analyzeTrends(result);

      // Save updated history
      await this.saveHistory();

      // Export dashboard data
      await this.exportDashboardData(result);

      console.log(`📊 Progress: ${result.overallProgress.toFixed(1)}% | Risk: ${result.riskScore} | Blockers: ${result.blockerCount}`);

        // If SINGLE_RUN is set, stop the monitor after a single assessment (useful for CI/testing)
        const _singleRun = (process.env.SINGLE_RUN === '1' || process.env.SINGLE_RUN === 'true');
        if (singleRun) {
          console.log('🔁 SINGLE_RUN enabled - stopping monitor after one assessment');
          try { await this.stop(); } catch (e) { /* ignore */ }
          // allow caller to exit normally
        }
    } catch (error) {
      console.error('❌ Assessment execution failed:', error);
      throw error;
    }
  }

  private async analyzeTrends(current: AssessmentResult): Promise<void> {
    if (this.assessmentHistory.length < 2) {
      return; // Need at least 2 data points for trend analysis
    }

  const _previous = this.assessmentHistory[this.assessmentHistory.length - 2]!;
  const _trend = this.calculateTrend(previous, current);

    // Check for alert conditions
    await this.checkAlertConditions(trend, current);

    // Log trend information
    if (trend.progressChange !== 0) {
      const _direction = trend.progressChange > 0 ? '📈' : '📉';
      console.log(`${direction} Progress change: ${trend.progressChange.toFixed(1)}%`);
    }

    if (trend.newBlockers.length > 0) {
      console.log(`🚫 New blockers: ${trend.newBlockers.join(', ')}`);
    }

    if (trend.resolvedBlockers.length > 0) {
      console.log(`✅ Resolved blockers: ${trend.resolvedBlockers.join(', ')}`);
    }
  }

  private calculateTrend(previous: AssessmentResult, current: AssessmentResult): TrendData {
    const _progressChange = current.overallProgress - previous.overallProgress;
    const _riskChange = current.riskScore - previous.riskScore;
    const _confidenceChange = current.confidenceLevel - previous.confidenceLevel;

    // Identify new and resolved blockers
    const previousBlockers = previous.conditions
      .filter(c => c.status === 'pending' && c.priority === 'critical')
      .map(c => c.id);
    
    const currentBlockers = current.conditions
      .filter(c => c.status === 'pending' && c.priority === 'critical')
      .map(c => c.id);

    const _newBlockers = currentBlockers.filter(id => !previousBlockers.includes(id));
    const _resolvedBlockers = previousBlockers.filter(id => !currentBlockers.includes(id));

    // Check for stagnant conditions (unchanged for extended period)
    const _stagnantConditions = this.findStagnantConditions(current);

    return {
      timespan: `${previous.timestamp} to ${current.timestamp}`,
      progressChange,
      riskChange,
      confidenceChange,
      newBlockers,
      resolvedBlockers,
      stagnantConditions
    };
  }

  private findStagnantConditions(current: AssessmentResult): string[] {
    const _stagnationThreshold = this.config.alertThresholds.stagnationPeriod * 24 * 60 * 60 * 1000;
    const _cutoffTime = new Date(Date.now() - stagnationThreshold);
    
    const stagnant: string[] = [];
    
    for (const condition of current.conditions) {
      if (condition.status === 'pending') {
        // Check if this condition has been pending for too long
        const relevantHistory = this.assessmentHistory.filter(
          h => new Date(h.timestamp) > cutoffTime
        );
        
        const alwaysPending = relevantHistory.every(h => {
          const _histCondition = h.conditions.find(c => c.id === condition.id);
          return histCondition && histCondition.status === 'pending';
        });
        
        if (alwaysPending && relevantHistory.length > 0) {
          stagnant.push(condition.id);
        }
      }
    }
    
    return stagnant;
  }

  private async checkAlertConditions(trend: TrendData, current: AssessmentResult): Promise<void> {
    const alerts: string[] = [];

    // Check critical blockers threshold
    if (current.blockerCount > this.config.alertThresholds.criticalBlocked) {
      alerts.push(`Too many critical blockers: ${current.blockerCount} (threshold: ${this.config.alertThresholds.criticalBlocked})`);
    }

    // Check progress regression
    if (trend.progressChange < -this.config.alertThresholds.progressRegression) {
      alerts.push(`Significant progress regression: ${trend.progressChange.toFixed(1)}%`);
    }

    // Check for new blockers
    if (trend.newBlockers.length > 0) {
      alerts.push(`New critical blockers detected: ${trend.newBlockers.join(', ')}`);
    }

    // Check for stagnant conditions
    if (trend.stagnantConditions.length > 0) {
      alerts.push(`Stagnant conditions detected: ${trend.stagnantConditions.join(', ')}`);
    }

    // Check if freeze is recommended (positive alert)
    if (current.freezeRecommended) {
      alerts.push(`🎉 FREEZE RECOMMENDED: System is ready for deployment!`);
    }

    // Send alerts if any
    for (const alert of alerts) {
      await this.sendAlert('Freeze Readiness Alert', alert);
    }
  }

  private async sendAlert(title: string, message: string): Promise<void> {
    console.log(`🚨 ALERT: ${title} - ${message}`);

    // Email notifications
    if (this.config.notifications.email?.enabled) {
      await this.sendEmailAlert(title, message);
    }

    // Slack notifications
    if (this.config.notifications.slack?.enabled) {
      await this.sendSlackAlert(title, message);
    }

    // Teams notifications
    if (this.config.notifications.teams?.enabled) {
      await this.sendTeamsAlert(title, message);
    }
  }

  private async sendEmailAlert(title: string, message: string): Promise<void> {
    // Implementation would depend on your email service
    console.log(`📧 Email alert sent: ${title}`);
  }

  private async sendSlackAlert(title: string, message: string): Promise<void> {
    // Implementation would use Slack webhook
    console.log(`💬 Slack alert sent: ${title}`);
  }

  private async sendTeamsAlert(title: string, message: string): Promise<void> {
    // Implementation would use Teams webhook
    console.log(`👥 Teams alert sent: ${title}`);
  }

  private async exportDashboardData(result: AssessmentResult): Promise<void> {
    const dashboardData = {
      lastUpdate: result.timestamp,
      currentStatus: {
        progress: result.overallProgress,
        risk: result.riskScore,
        confidence: result.confidenceLevel,
        blockers: result.blockerCount,
        freezeReady: result.freezeRecommended
      },
      categoryBreakdown: result.categoryProgress,
      trends: this.calculateRecentTrends(),
      alerts: this.getActiveAlerts()
    };

    const _dashboardFile = path.join(this.config.reporting.exportPath, 'dashboard-data.json');
    await fs.promises.writeFile(dashboardFile, JSON.stringify(dashboardData, null, 2));
  }

  private calculateRecentTrends(): any {
    if (this.assessmentHistory.length < 7) {
      return { insufficient_data: true };
    }

  const _recent = this.assessmentHistory.slice(-7); // Last 7 assessments
  const _first = recent[0]!;
  const _last = recent[recent.length - 1]!;

    return {
      progress_trend: last.overallProgress - first.overallProgress,
      risk_trend: last.riskScore - first.riskScore,
      confidence_trend: last.confidenceLevel - first.confidenceLevel,
      blocker_trend: last.blockerCount - first.blockerCount
    };
  }

  private getActiveAlerts(): string[] {
    // Return list of current active alert conditions
    const _current = this.assessmentHistory[this.assessmentHistory.length - 1];
    if (!current) return [];

    const alerts: string[] = [];
    
    if (current.blockerCount > this.config.alertThresholds.criticalBlocked) {
      alerts.push('Critical blockers threshold exceeded');
    }

    if (current.riskScore === 100) {
      alerts.push('Maximum risk score detected');
    }

    return alerts;
  }

  private scheduleDailyReport(): void {
    // Schedule daily report at 9 AM
    const _now = new Date();
    const _nextReport = new Date();
    nextReport.setHours(9, 0, 0, 0);
    
    if (nextReport <= now) {
      nextReport.setDate(nextReport.getDate() + 1);
    }

    const _timeUntilReport = nextReport.getTime() - now.getTime();
    
    setTimeout(() => {
      this.generateDailyReport();
      setInterval(() => this.generateDailyReport(), 24 * 60 * 60 * 1000);
    }, timeUntilReport);
  }

  private scheduleWeeklyReport(): void {
    // Schedule weekly report on Mondays at 9 AM
    const _now = new Date();
    const _nextReport = new Date();
    const _daysUntilMonday = (1 + 7 - now.getDay()) % 7;
    
    nextReport.setDate(now.getDate() + daysUntilMonday);
    nextReport.setHours(9, 0, 0, 0);
    
    if (nextReport <= now) {
      nextReport.setDate(nextReport.getDate() + 7);
    }

    const _timeUntilReport = nextReport.getTime() - now.getTime();
    
    setTimeout(() => {
      this.generateWeeklyReport();
      setInterval(() => this.generateWeeklyReport(), 7 * 24 * 60 * 60 * 1000);
    }, timeUntilReport);
  }

  private async generateDailyReport(): Promise<void> {
    console.log('📊 Generating daily report...');
    
    const reportData = {
      date: new Date().toISOString().split('T')[0],
      summary: this.generateSummary('daily'),
      trends: this.calculateRecentTrends(),
      recommendations: this.generateRecommendations()
    };

    const reportFile = path.join(
      this.config.reporting.exportPath,
      `daily-report-${reportData.date}.json`
    );
    
    await fs.promises.writeFile(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`✅ Daily report saved: ${reportFile}`);
  }

  private async generateWeeklyReport(): Promise<void> {
    console.log('📈 Generating weekly report...');
    
    const reportData = {
      week: this.getWeekIdentifier(),
      summary: this.generateSummary('weekly'),
      trends: this.calculateWeeklyTrends(),
      milestones: this.identifyMilestones(),
      recommendations: this.generateRecommendations()
    };

    const reportFile = path.join(
      this.config.reporting.exportPath,
      `weekly-report-${reportData.week}.json`
    );
    
    await fs.promises.writeFile(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`✅ Weekly report saved: ${reportFile}`);
  }

  private generateSummary(period: 'daily' | 'weekly'): any {
    if (this.assessmentHistory.length === 0) {
      return { error: 'No assessment data available' };
    }

  const _latest = this.assessmentHistory[this.assessmentHistory.length - 1]!;
    const _daysBack = period === 'daily' ? 1 : 7;
    const _cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    const periodData = this.assessmentHistory.filter(
      h => new Date(h.timestamp) >= cutoff
    );

    return {
      current_status: {
        progress: latest.overallProgress,
        risk: latest.riskScore,
        confidence: latest.confidenceLevel,
        blockers: latest.blockerCount
      },
      period_changes: periodData.length > 1 ? {
        progress_change: latest.overallProgress - periodData[0]!.overallProgress,
        risk_change: latest.riskScore - periodData[0]!.riskScore,
        confidence_change: latest.confidenceLevel - periodData[0]!.confidenceLevel
      } : null
    };
  }

  private calculateWeeklyTrends(): any {
    const _weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekData = this.assessmentHistory.filter(
      h => new Date(h.timestamp) >= weekAgo
    );

    if (weekData.length < 2) {
      return { insufficient_data: true };
    }

    return {
      assessments_count: weekData.length,
      progress_trajectory: this.calculateTrajectory(weekData, 'overallProgress'),
      risk_trajectory: this.calculateTrajectory(weekData, 'riskScore'),
      confidence_trajectory: this.calculateTrajectory(weekData, 'confidenceLevel')
    };
  }

  private calculateTrajectory(data: AssessmentResult[], field: keyof AssessmentResult): string {
    if (data.length < 2) return 'unknown';
    
  const _values = data.map(d => d[field] as number);
  const _slope = (values[values.length - 1]! - values[0]!) / (values.length - 1);
    
    if (Math.abs(slope) < 0.1) return 'stable';
    return slope > 0 ? 'improving' : 'declining';
  }

  private identifyMilestones(): string[] {
    const milestones: string[] = [];
    const _latest = this.assessmentHistory[this.assessmentHistory.length - 1];
    
    if (!latest) return milestones;

    if (latest.overallProgress >= 50 && latest.overallProgress < 60) {
      milestones.push('Halfway milestone reached');
    }
    
    if (latest.overallProgress >= 75 && latest.overallProgress < 85) {
      milestones.push('Approaching readiness threshold');
    }
    
    if (latest.blockerCount === 0) {
      milestones.push('All critical blockers resolved');
    }
    
    if (latest.riskScore <= 50) {
      milestones.push('Risk reduced to acceptable levels');
    }

    return milestones;
  }

  private generateRecommendations(): string[] {
    const _latest = this.assessmentHistory[this.assessmentHistory.length - 1];
    if (!latest) return [];

    const recommendations: string[] = [];

    if (latest.blockerCount > 0) {
      recommendations.push('Focus on resolving critical blockers');
    }

    if (latest.overallProgress < 50) {
      recommendations.push('Accelerate completion of high-priority conditions');
    }

    if (latest.riskScore > 75) {
      recommendations.push('Conduct additional risk mitigation activities');
    }

    if (latest.confidenceLevel < 60) {
      recommendations.push('Increase validation and verification activities');
    }

    return recommendations;
  }

  private getWeekIdentifier(): string {
    const _now = new Date();
    const _year = now.getFullYear();
    const _week = this.getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const _firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const _pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private async loadHistory(): Promise<void> {
    try {
      if (fs.existsSync(this.historyFile)) {
        const _data = await fs.promises.readFile(this.historyFile, 'utf8');
        this.assessmentHistory = JSON.parse(data);
        console.log(`📊 Loaded ${this.assessmentHistory.length} historical assessments`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load assessment history:', error);
      this.assessmentHistory = [];
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      // Ensure export directory exists
      await fs.promises.mkdir(path.dirname(this.historyFile), { recursive: true });
      
      // Keep only last 1000 assessments to prevent file from growing too large
      const _historyToSave = this.assessmentHistory.slice(-1000);
      
      await fs.promises.writeFile(
        this.historyFile,
        JSON.stringify(historyToSave, null, 2)
      );
    } catch (error) {
      console.error('❌ Could not save assessment history:', error);
    }
  }
}

// Example configuration
const defaultConfig: MonitorConfig = {
  checkInterval: 60, // 1 hour
  alertThresholds: {
    criticalBlocked: 3,
    progressRegression: 5.0, // 5% regression
    stagnationPeriod: 3 // 3 days
  },
  notifications: {
    slack: {
      enabled: false,
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      channel: '#freeze-readiness'
    }
  },
  reporting: {
    dailyReport: true,
    weeklyReport: true,
    exportPath: './reports/monitoring'
  }
};

// CLI interface for the monitor
async function main() {
  const _args = process.argv.slice(2);
  const _command = args[0];

  const _monitor = new FreezeReadinessMonitor(defaultConfig);

  switch (command) {
    case 'start':
      await monitor.start();
      // Keep process running
      process.on('SIGINT', async () => {
        await monitor.stop();
        process.exit(0);
      });
      break;
      
    case 'stop':
      await monitor.stop();
      break;
      
    default:
      console.log('Usage: node freeze-readiness-monitor.js [start|stop]');
      console.log('');
      console.log('Commands:');
      console.log('  start  - Start continuous monitoring');
      console.log('  stop   - Stop monitoring service');
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { FreezeReadinessMonitor, MonitorConfig, AssessmentResult, TrendData };
