/**
 * Structured logging utility using Winston
 */

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private logger: winston.Logger;
  private component: string;

  constructor(component: string, logLevel: LogLevel = 'info') {
    this.component = component;

    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create Winston logger
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { component },
      transports: [
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(logsDir, 'orchestrator.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        // Error file transport
        new winston.transports.File({
          filename: path.join(logsDir, 'orchestrator-error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 3,
        }),
      ],
    });

    // Add console transport for development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(({ level, message, component, timestamp }) => {
            return `${chalk.gray(timestamp)} ${level} ${chalk.cyan(`[${component}]`)} ${message}`;
          })
        ),
      }));
    }
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error | any): void {
    const meta = error ? { error: error.message || error, stack: error.stack } : undefined;
    this.logger.error(message, meta);
  }

  success(message: string, meta?: any): void {
    // Success is logged as info with special formatting
    this.logger.info(`✅ ${message}`, meta);
  }

  failure(message: string, error?: Error | any): void {
    // Failure is logged as error with special formatting
    this.logger.error(`❌ ${message}`, error);
  }

  // Convenience methods for specific operations
  startOperation(operation: string): void {
    this.info(`🚀 Starting: ${operation}`);
  }

  completeOperation(operation: string, duration?: number): void {
    const durationStr = duration ? ` (${duration}ms)` : '';
    this.success(`Completed: ${operation}${durationStr}`);
  }

  failOperation(operation: string, error?: Error | any): void {
    this.failure(`Failed: ${operation}`, error);
  }

  // Layer-specific logging
  layerVerify(layerName: string, result: { skip: boolean; reason?: string }): void {
    if (result.skip) {
      this.info(`⏭️  Skipping layer '${layerName}': ${result.reason}`);
    } else {
      this.info(`🔍 Verifying layer '${layerName}'...`);
    }
  }

  layerDeploy(layerName: string): void {
    this.info(`📦 Deploying layer '${layerName}'...`);
  }

  layerDeployed(layerName: string, duration?: number): void {
    const durationStr = duration ? ` (${duration}ms)` : '';
    this.success(`Layer '${layerName}' deployed successfully${durationStr}`);
  }

  layerDestroyed(layerName: string): void {
    this.info(`🗑️  Layer '${layerName}' destroyed`);
  }

  // Command execution logging
  commandStart(command: string, cwd?: string): void {
    const cwdStr = cwd ? ` (in ${cwd})` : '';
    this.debug(`$ ${command}${cwdStr}`);
  }

  commandComplete(command: string, exitCode: number, duration: number): void {
    const status = exitCode === 0 ? '✅' : '❌';
    this.debug(`${status} Command completed: ${command} (${duration}ms, exit code: ${exitCode})`);
  }

  // Health check logging
  healthCheck(url: string, healthy: boolean, responseTime?: number): void {
    const status = healthy ? '✅' : '❌';
    const timeStr = responseTime ? ` (${responseTime}ms)` : '';
    this.debug(`${status} Health check: ${url}${timeStr}`);
  }

  // Set log level dynamically
  setLevel(level: LogLevel): void {
    this.logger.level = level;
    this.debug(`Log level changed to: ${level}`);
  }

  // Create child logger with additional context
  child(additionalComponent: string): Logger {
    return new Logger(`${this.component}:${additionalComponent}`, this.logger.level as LogLevel);
  }
}
