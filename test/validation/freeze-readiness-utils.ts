import fs from 'fs';
import path from 'path';
/**
 * Freeze Readiness Utilities and Helper Functions
 * 
 * Shared utilities for the freeze readiness assessment ecosystem
 * including data validation, report formatting, and common operations.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReportMetadata {
  version: string;
  generatedAt: string;
  network: string;
  toolVersion: string;
}

export interface ConditionSummary {
  id: string;
  category: string;
  status: 'pending' | 'partial' | 'complete';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export class FreezeReadinessUtils {
  /**
   * Validates assessment data structure
   */
  static validateAssessmentData(data: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check required top-level properties
    const _requiredProps = ['metadata', 'conditions', 'freezeDecision', 'analytics'];
    for (const prop of requiredProps) {
      if (!data[prop]) {
        result.errors.push(`Missing required property: ${prop}`);
        result.isValid = false;
      }
    }

    // Validate metadata
    if (data.metadata) {
      const _requiredMetadata = ['generatedAt', 'network', 'overallProgress', 'riskScore'];
      for (const prop of requiredMetadata) {
        if (data.metadata[prop] === undefined) {
          result.errors.push(`Missing metadata property: ${prop}`);
          result.isValid = false;
        }
      }

      // Validate progress values
      if (typeof data.metadata.overallProgress === 'number') {
        if (data.metadata.overallProgress < 0 || data.metadata.overallProgress > 100) {
          result.errors.push('Overall progress must be between 0 and 100');
          result.isValid = false;
        }
      }

      if (typeof data.metadata.riskScore === 'number') {
        if (data.metadata.riskScore < 0 || data.metadata.riskScore > 100) {
          result.errors.push('Risk score must be between 0 and 100');
          result.isValid = false;
        }
      }
    }

    // Validate conditions
    if (Array.isArray(data.conditions)) {
      const _conditionIds = new Set();
      const _validStatuses = ['pending', 'partial', 'complete'];
      const _validPriorities = ['critical', 'high', 'medium', 'low'];
      const _validCategories = ['Security', 'Governance', 'Testing', 'Documentation', 'Operations'];

      data.conditions.forEach((condition: any, index: number) => {
        // Check required properties
        const _requiredConditionProps = ['id', 'category', 'description', 'status', 'priority'];
        for (const prop of requiredConditionProps) {
          if (!condition[prop]) {
            result.errors.push(`Condition ${index}: Missing property ${prop}`);
            result.isValid = false;
          }
        }

        // Check for duplicate IDs
        if (condition.id) {
          if (conditionIds.has(condition.id)) {
            result.errors.push(`Duplicate condition ID: ${condition.id}`);
            result.isValid = false;
          }
          conditionIds.add(condition.id);
        }

        // Validate enum values
        if (condition.status && !validStatuses.includes(condition.status)) {
          result.errors.push(`Invalid status for condition ${condition.id}: ${condition.status}`);
          result.isValid = false;
        }

        if (condition.priority && !validPriorities.includes(condition.priority)) {
          result.errors.push(`Invalid priority for condition ${condition.id}: ${condition.priority}`);
          result.isValid = false;
        }

        if (condition.category && !validCategories.includes(condition.category)) {
          result.warnings.push(`Unexpected category for condition ${condition.id}: ${condition.category}`);
        }
      });
    } else if (data.conditions !== undefined) {
      result.errors.push('Conditions must be an array');
      result.isValid = false;
    }

    // Validate freeze decision
    if (data.freezeDecision) {
      if (typeof data.freezeDecision.recommendFreeze !== 'boolean') {
        result.errors.push('freezeDecision.recommendFreeze must be a boolean');
        result.isValid = false;
      }

      if (!Array.isArray(data.freezeDecision.blockers)) {
        result.errors.push('freezeDecision.blockers must be an array');
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Formats assessment data for console display
   */
  static formatConsoleReport(data: any): string {
    const lines: string[] = [];
    
    lines.push('🔒 FREEZE READINESS SUMMARY');
    lines.push('═'.repeat(50));
    lines.push(`📅 Generated: ${new Date(data.metadata.generatedAt).toLocaleString()}`);
    lines.push(`🌐 Network: ${data.metadata.network}`);
    lines.push(`📊 Progress: ${data.metadata.overallProgress.toFixed(1)}%`);
    lines.push(`🛡️  Risk Score: ${data.metadata.riskScore}`);
    lines.push(`🎯 Confidence: ${data.metadata.confidenceLevel}%`);
    lines.push('');

    // Status
    const _status = data.freezeDecision.recommendFreeze ? '✅ READY' : '❌ NOT READY';
    lines.push(`🔒 Freeze Status: ${status}`);
    lines.push('');

    // Category breakdown
    lines.push('📋 CATEGORY PROGRESS:');
    lines.push('─'.repeat(30));
    Object.entries(data.analytics.categoryProgress).forEach(([category, progress]: [string, any]) => {
      const _bar = this.createProgressBar(progress, 20);
      lines.push(`${category.padEnd(15)} │${bar}│ ${progress.toFixed(1)}%`);
    });
    lines.push('');

    // Blockers
    if (data.freezeDecision.blockers.length > 0) {
      lines.push('🚫 CRITICAL BLOCKERS:');
      lines.push('─'.repeat(30));
      data.freezeDecision.blockers.forEach((blocker: string, index: number) => {
        lines.push(`${index + 1}. ${blocker}`);
      });
      lines.push('');
    }

    // Recommendations
    if (data.freezeDecision.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      lines.push('─'.repeat(30));
      data.freezeDecision.recommendations.forEach((rec: string, index: number) => {
        lines.push(`${index + 1}. ${rec}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Creates a text-based progress bar
   */
  private static createProgressBar(percentage: number, width: number = 20): string {
    const _filled = Math.round((percentage / 100) * width);
    const _empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Generates markdown report from assessment data
   */
  static generateMarkdownReport(data: any): string {
    const lines: string[] = [];
    
    lines.push('# 🔒 PayRox Freeze Readiness Assessment Report');
    lines.push('');
    lines.push(`**Generated:** ${new Date(data.metadata.generatedAt).toLocaleString()}`);
    lines.push(`**Network:** ${data.metadata.network}`);
    lines.push(`**Tool Version:** ${data.metadata.assessmentVersion}`);
    lines.push('');

    // Executive Summary
    lines.push('## 📊 Executive Summary');
    lines.push('');
    lines.push(`- **Overall Progress:** ${data.metadata.overallProgress.toFixed(1)}%`);
    lines.push(`- **Risk Score:** ${data.metadata.riskScore}/100`);
    lines.push(`- **Confidence Level:** ${data.metadata.confidenceLevel}%`);
    lines.push(`- **Critical Blockers:** ${data.freezeDecision.blockers.length}`);
    lines.push(`- **Freeze Recommendation:** ${data.freezeDecision.recommendFreeze ? '✅ READY' : '❌ NOT READY'}`);
    lines.push('');

    // Category Progress
    lines.push('## 📋 Progress by Category');
    lines.push('');
    lines.push('| Category | Progress | Status |');
    lines.push('|----------|----------|--------|');
    
    Object.entries(data.analytics.categoryProgress).forEach(([category, progress]: [string, any]) => {
      const _status = progress >= 80 ? '✅ Good' : progress >= 50 ? '⚠️ Fair' : '❌ Poor';
      lines.push(`| ${category} | ${progress.toFixed(1)}% | ${status} |`);
    });
    lines.push('');

    // Blockers
    if (data.freezeDecision.blockers.length > 0) {
      lines.push('## 🚫 Critical Blockers');
      lines.push('');
      data.freezeDecision.blockers.forEach((blocker: string) => {
        lines.push(`- ❌ ${blocker}`);
      });
      lines.push('');
    }

    // Recommendations
    if (data.freezeDecision.recommendations.length > 0) {
      lines.push('## 💡 Recommendations');
      lines.push('');
      data.freezeDecision.recommendations.forEach((rec: string) => {
        lines.push(`- 💡 ${rec}`);
      });
      lines.push('');
    }

    // Detailed Conditions
    lines.push('## 📝 Detailed Conditions');
    lines.push('');
    
    const _categoryGroups = this.groupConditionsByCategory(data.conditions);
    Object.entries(categoryGroups).forEach(([category, conditions]: [string, any]) => {
      lines.push(`### ${category}`);
      lines.push('');
      
      conditions.forEach((condition: any) => {
        const statusIcon = condition.status === 'complete' ? '✅' : 
                          condition.status === 'partial' ? '⚠️' : '❌';
        const priorityIcon = condition.priority === 'critical' ? '🔴' : 
                            condition.priority === 'high' ? '🟠' : 
                            condition.priority === 'medium' ? '🟡' : '⚪';
        
        lines.push(`#### ${statusIcon} ${condition.id} ${priorityIcon}`);
        lines.push(`**${condition.description}**`);
        lines.push('');
        lines.push('**Criteria:**');
        condition.criteria.forEach((criterion: string) => {
          lines.push(`- ${criterion}`);
        });
        lines.push('');
      });
    });

    return lines.join('\n');
  }

  /**
   * Groups conditions by category
   */
  private static groupConditionsByCategory(conditions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    conditions.forEach(condition => {
      if (!groups[condition.category]) {
        groups[condition.category] = [];
      }
      groups[condition.category]!.push(condition);
    });
    
    return groups;
  }

  /**
   * Calculates summary statistics from assessment data
   */
  static calculateSummaryStats(data: any): any {
    const _conditions = data.conditions || [];
    const _total = conditions.length;
    
    const statusCounts = {
      complete: conditions.filter((c: any) => c.status === 'complete').length,
      partial: conditions.filter((c: any) => c.status === 'partial').length,
      pending: conditions.filter((c: any) => c.status === 'pending').length
    };

    const priorityCounts = {
      critical: conditions.filter((c: any) => c.priority === 'critical').length,
      high: conditions.filter((c: any) => c.priority === 'high').length,
      medium: conditions.filter((c: any) => c.priority === 'medium').length,
      low: conditions.filter((c: any) => c.priority === 'low').length
    };

    const criticalComplete = conditions.filter((c: any) => 
      c.priority === 'critical' && c.status === 'complete'
    ).length;

    const highComplete = conditions.filter((c: any) => 
      c.priority === 'high' && c.status === 'complete'
    ).length;

    return {
      total,
      statusCounts,
      priorityCounts,
      completionRates: {
        overall: total > 0 ? (statusCounts.complete / total) * 100 : 0,
        critical: priorityCounts.critical > 0 ? (criticalComplete / priorityCounts.critical) * 100 : 100,
        high: priorityCounts.high > 0 ? (highComplete / priorityCounts.high) * 100 : 100
      },
      blockers: data.freezeDecision?.blockers?.length || 0,
      readinessScore: data.metadata?.overallProgress || 0
    };
  }

  /**
   * Exports assessment data to various formats
   */
  static async exportAssessment(data: any, format: string, outputPath: string): Promise<string> {
    let content: string;
    let filename: string;

    switch (format.toLowerCase()) {
      case 'json':
        content = JSON.stringify(data, null, 2);
        filename = 'freeze-assessment.json';
        break;
        
      case 'markdown':
      case 'md':
        content = this.generateMarkdownReport(data);
        filename = 'freeze-assessment.md';
        break;
        
      case 'txt':
      case 'text':
        content = this.formatConsoleReport(data);
        filename = 'freeze-assessment.txt';
        break;
        
      case 'csv':
        content = this.generateCSVReport(data);
        filename = 'freeze-assessment.csv';
        break;
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const _fullPath = path.join(outputPath, filename);
    
    // Ensure directory exists
    await fs.promises.mkdir(outputPath, { recursive: true });
    
    // Write file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    
    return fullPath;
  }

  /**
   * Generates CSV report from assessment data
   */
  private static generateCSVReport(data: any): string {
    const lines: string[] = [];
    
    // Header
    lines.push('Category,ID,Description,Status,Priority,Responsible,Last Checked');
    
    // Conditions
    data.conditions.forEach((condition: any) => {
      const csvLine = [
        condition.category,
        condition.id,
        `"${condition.description.replace(/"/g, '""')}"`,
        condition.status,
        condition.priority,
        condition.responsible || '',
        condition.lastChecked || ''
      ].join(',');
      
      lines.push(csvLine);
    });
    
    return lines.join('\n');
  }

  /**
   * Compares two assessment results to identify changes
   */
  static compareAssessments(previous: any, current: any): any {
    const comparison: any = {
      timestamp: new Date().toISOString(),
      progressChange: current.metadata.overallProgress - previous.metadata.overallProgress,
      riskChange: current.metadata.riskScore - previous.metadata.riskScore,
      confidenceChange: current.metadata.confidenceLevel - previous.metadata.confidenceLevel,
      newBlockers: [],
      resolvedBlockers: [],
      statusChanges: [],
      categoryChanges: {}
    };

    // Compare blockers
    const _prevBlockers = new Set(previous.freezeDecision.blockers);
    const _currBlockers = new Set(current.freezeDecision.blockers);
    
    comparison.newBlockers = [...currBlockers].filter((b: any) => !prevBlockers.has(b));
    comparison.resolvedBlockers = [...prevBlockers].filter((b: any) => !currBlockers.has(b));

    // Compare condition statuses
    const _prevConditions = new Map(previous.conditions.map((c: any) => [c.id, c]));
    const _currConditions = new Map(current.conditions.map((c: any) => [c.id, c]));

    for (const [id, currCondition] of currConditions) {
      const _prevCondition = prevConditions.get(id);
      if (prevCondition && (prevCondition as any).status !== (currCondition as any).status) {
        comparison.statusChanges.push({
          id,
          description: (currCondition as any).description,
          from: (prevCondition as any).status,
          to: (currCondition as any).status
        });
      }
    }

    // Compare category progress
    Object.keys(current.analytics.categoryProgress).forEach(category => {
      const _prevProgress = previous.analytics.categoryProgress[category] || 0;
      const _currProgress = current.analytics.categoryProgress[category] || 0;
      const _change = currProgress - prevProgress;
      
      if (Math.abs(change) > 0.1) { // Only include significant changes
        comparison.categoryChanges[category] = {
          from: prevProgress,
          to: currProgress,
          change
        };
      }
    });

    return comparison;
  }

  /**
   * Validates file paths and creates directories as needed
   */
  static async ensureDirectoryExists(filePath: string): Promise<void> {
    const _dir = path.dirname(filePath);
    try {
      await fs.promises.access(dir);
    } catch {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Safely reads and parses JSON files
   */
  static async safeReadJSON(filePath: string): Promise<any> {
    try {
      const _content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to read JSON file ${filePath}: ${error}`);
    }
  }

  /**
   * Gets the current timestamp in ISO format
   */
  static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Formats duration in milliseconds to human readable format
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Generates a unique identifier for assessment runs
   */
  static generateAssessmentId(): string {
    const _timestamp = Date.now();
    const _random = Math.random().toString(36).substr(2, 9);
    return `assessment-${timestamp}-${random}`;
  }
}

export default FreezeReadinessUtils;
