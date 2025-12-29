"use strict";
/**
 * Command execution utility with live output streaming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandExecutor = void 0;
const execa_1 = require("execa");
const Logger_1 = require("./Logger");
class CommandExecutor {
    constructor(logger) {
        this.logger = logger || new Logger_1.Logger('CommandExecutor');
    }
    /**
     * Execute a command and return the result
     */
    async execute(command, args = [], options = {}) {
        const { cwd = process.cwd(), env = process.env, timeout = 300000, // 5 minutes default
        streamOutput = true, silent = false, } = options;
        const startTime = Date.now();
        const fullCommand = [command, ...args].join(' ');
        this.logger.commandStart(fullCommand, cwd);
        try {
            const execaOptions = {
                cwd,
                env,
                timeout,
                stripFinalNewline: false,
            };
            if (streamOutput && !silent) {
                execaOptions.stdout = 'inherit';
                execaOptions.stderr = 'inherit';
            }
            const result = await (0, execa_1.execa)(command, args, execaOptions);
            const duration = Date.now() - startTime;
            this.logger.commandComplete(fullCommand, result.exitCode, duration);
            return {
                success: result.exitCode === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                duration,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            // Log the failure
            this.logger.commandComplete(fullCommand, error.exitCode || 1, duration);
            // Extract error details
            const stdout = error.stdout || '';
            const stderr = error.stderr || error.message || 'Unknown error';
            if (!silent) {
                this.logger.error(`Command failed: ${fullCommand}`, {
                    exitCode: error.exitCode,
                    stdout: stdout.substring(0, 500), // Limit output in logs
                    stderr: stderr.substring(0, 500),
                });
            }
            return {
                success: false,
                stdout,
                stderr,
                exitCode: error.exitCode || 1,
                duration,
            };
        }
    }
    /**
     * Execute a command in the background (fire and forget)
     */
    async executeBackground(command, args = [], options = {}) {
        const { cwd = process.cwd(), env = process.env, streamOutput = false, } = options;
        const fullCommand = [command, ...args].join(' ');
        this.logger.debug(`Starting background command: ${fullCommand}`);
        const execaOptions = {
            cwd,
            env,
            detached: true,
        };
        if (streamOutput) {
            execaOptions.stdout = 'inherit';
            execaOptions.stderr = 'inherit';
        }
        const childProcess = (0, execa_1.execa)(command, args, execaOptions);
        // Handle process completion
        childProcess.then((result) => {
            this.logger.debug(`Background command completed: ${fullCommand} (exit code: ${result.exitCode})`);
        }).catch((error) => {
            this.logger.error(`Background command failed: ${fullCommand}`, error);
        });
        return childProcess;
    }
    /**
     * Execute a shell command (supports pipes, redirects, etc.)
     */
    async executeShell(shellCommand, options = {}) {
        return this.execute('sh', ['-c', shellCommand], options);
    }
    /**
     * Execute multiple commands sequentially
     */
    async executeMultiple(commands, options = {}) {
        const { stopOnFailure = true } = options;
        const results = [];
        for (const cmd of commands) {
            const result = await this.execute(cmd.command, cmd.args || [], cmd.options || {});
            results.push(result);
            if (!result.success && stopOnFailure) {
                this.logger.error(`Stopping execution due to failed command: ${cmd.command}`);
                break;
            }
        }
        return results;
    }
    /**
     * Check if a command exists on the system
     */
    async commandExists(command) {
        try {
            const result = await this.execute('which', [command], { silent: true });
            return result.success;
        }
        catch {
            return false;
        }
    }
    /**
     * Get the current working directory (for context)
     */
    getCwd() {
        return process.cwd();
    }
    /**
     * Change working directory for subsequent commands
     */
    setCwd(cwd) {
        process.chdir(cwd);
        this.logger.debug(`Changed working directory to: ${cwd}`);
    }
}
exports.CommandExecutor = CommandExecutor;
//# sourceMappingURL=CommandExecutor.js.map