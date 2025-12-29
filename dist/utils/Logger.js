"use strict";
/**
 * Structured logging utility using Winston
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston = __importStar(require("winston"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chalk_1 = __importDefault(require("chalk"));
class Logger {
    constructor(component, logLevel = 'info') {
        this.component = component;
        // Ensure logs directory exists
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        // Create Winston logger
        this.logger = winston.createLogger({
            level: logLevel,
            format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
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
                format: winston.format.combine(winston.format.colorize(), winston.format.simple(), winston.format.printf(({ level, message, component, timestamp }) => {
                    return `${chalk_1.default.gray(timestamp)} ${level} ${chalk_1.default.cyan(`[${component}]`)} ${message}`;
                })),
            }));
        }
    }
    debug(message, meta) {
        this.logger.debug(message, meta);
    }
    info(message, meta) {
        this.logger.info(message, meta);
    }
    warn(message, meta) {
        this.logger.warn(message, meta);
    }
    error(message, error) {
        const meta = error ? { error: error.message || error, stack: error.stack } : undefined;
        this.logger.error(message, meta);
    }
    success(message, meta) {
        // Success is logged as info with special formatting
        this.logger.info(`✅ ${message}`, meta);
    }
    failure(message, error) {
        // Failure is logged as error with special formatting
        this.logger.error(`❌ ${message}`, error);
    }
    // Convenience methods for specific operations
    startOperation(operation) {
        this.info(`🚀 Starting: ${operation}`);
    }
    completeOperation(operation, duration) {
        const durationStr = duration ? ` (${duration}ms)` : '';
        this.success(`Completed: ${operation}${durationStr}`);
    }
    failOperation(operation, error) {
        this.failure(`Failed: ${operation}`, error);
    }
    // Layer-specific logging
    layerVerify(layerName, result) {
        if (result.skip) {
            this.info(`⏭️  Skipping layer '${layerName}': ${result.reason}`);
        }
        else {
            this.info(`🔍 Verifying layer '${layerName}'...`);
        }
    }
    layerDeploy(layerName) {
        this.info(`📦 Deploying layer '${layerName}'...`);
    }
    layerDeployed(layerName, duration) {
        const durationStr = duration ? ` (${duration}ms)` : '';
        this.success(`Layer '${layerName}' deployed successfully${durationStr}`);
    }
    layerDestroyed(layerName) {
        this.info(`🗑️  Layer '${layerName}' destroyed`);
    }
    // Command execution logging
    commandStart(command, cwd) {
        const cwdStr = cwd ? ` (in ${cwd})` : '';
        this.debug(`$ ${command}${cwdStr}`);
    }
    commandComplete(command, exitCode, duration) {
        const status = exitCode === 0 ? '✅' : '❌';
        this.debug(`${status} Command completed: ${command} (${duration}ms, exit code: ${exitCode})`);
    }
    // Health check logging
    healthCheck(url, healthy, responseTime) {
        const status = healthy ? '✅' : '❌';
        const timeStr = responseTime ? ` (${responseTime}ms)` : '';
        this.debug(`${status} Health check: ${url}${timeStr}`);
    }
    // Set log level dynamically
    setLevel(level) {
        this.logger.level = level;
        this.debug(`Log level changed to: ${level}`);
    }
    // Create child logger with additional context
    child(additionalComponent) {
        return new Logger(`${this.component}:${additionalComponent}`, this.logger.level);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map