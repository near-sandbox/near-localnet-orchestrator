/**
 * Command execution utility with live output streaming
 */
import { ExecaChildProcess } from 'execa';
import { Logger } from './Logger';
import { CommandResult } from '../types';
export interface CommandOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    streamOutput?: boolean;
    silent?: boolean;
}
export declare class CommandExecutor {
    private logger;
    constructor(logger?: Logger);
    /**
     * Execute a command and return the result
     */
    execute(command: string, args?: string[], options?: CommandOptions): Promise<CommandResult>;
    /**
     * Execute a command in the background (fire and forget)
     */
    executeBackground(command: string, args?: string[], options?: CommandOptions): Promise<ExecaChildProcess>;
    /**
     * Execute a shell command (supports pipes, redirects, etc.)
     */
    executeShell(shellCommand: string, options?: CommandOptions): Promise<CommandResult>;
    /**
     * Execute multiple commands sequentially
     */
    executeMultiple(commands: Array<{
        command: string;
        args?: string[];
        options?: CommandOptions;
    }>, options?: {
        stopOnFailure?: boolean;
    }): Promise<CommandResult[]>;
    /**
     * Check if a command exists on the system
     */
    commandExists(command: string): Promise<boolean>;
    /**
     * Get the current working directory (for context)
     */
    getCwd(): string;
    /**
     * Change working directory for subsequent commands
     */
    setCwd(cwd: string): void;
}
//# sourceMappingURL=CommandExecutor.d.ts.map