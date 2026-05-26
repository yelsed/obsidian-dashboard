import { Notice, type App } from "obsidian";
import { copyTextToClipboardWithFallback } from "./clipboard";

const CLAUDE_CODE_PLUGIN_CANDIDATE_IDS = ["obsidian-claude-code", "claude-code"];

const CLAUDE_CODE_OPEN_COMMAND_CANDIDATE_IDS = [
  "obsidian-claude-code:open-claude-terminal",
  "obsidian-claude-code:new-claude-terminal",
  "obsidian-claude-code:focus-claude-terminal",
];

export type ClaudeTerminalLaunchOutcome =
  | "ran-in-terminal"
  | "copied-to-clipboard"
  | "unavailable";

export type ClaudeTerminalLaunchRequest = {
  workingDirectoryAbsolutePath: string;
  resumeSessionId?: string;
  initialPromptText?: string;
  fallbackShellCommandLine: string;
};

type ClaudeCodePluginInstanceWithSessionLauncher = {
  openClaudeSessionInFolder?: (
    workingDirectoryAbsolutePath: string,
    resumeSessionId?: string,
    initialPromptText?: string,
  ) => Promise<unknown>;
};

type ObsidianApplicationWithCommunityPlugins = App & {
  plugins?: {
    plugins?: Record<string, unknown>;
  };
  commands?: {
    executeCommandById?: (commandId: string) => boolean;
  };
};

export async function launchInObsidianClaudeTerminal(
  obsidianApplication: App,
  request: ClaudeTerminalLaunchRequest,
): Promise<ClaudeTerminalLaunchOutcome> {
  const claudeCodePluginInstance = findClaudeCodePluginInstance(obsidianApplication);

  if (claudeCodePluginInstance !== null) {
    const sessionLauncher = (claudeCodePluginInstance as ClaudeCodePluginInstanceWithSessionLauncher)
      .openClaudeSessionInFolder;
    if (typeof sessionLauncher === "function") {
      try {
        await sessionLauncher.call(
          claudeCodePluginInstance,
          request.workingDirectoryAbsolutePath,
          request.resumeSessionId,
          request.initialPromptText,
        );
        new Notice(
          request.resumeSessionId
            ? "Resuming session in the Claude Code terminal"
            : "Started Claude Code in the project folder",
        );
        return "ran-in-terminal";
      } catch {
        /* patched method missing or threw; fall back to opening the terminal and pasting */
      }
    }

    if (openClaudeCodeTerminalView(obsidianApplication)) {
      const wasCopied = await copyTextToClipboardWithFallback(request.fallbackShellCommandLine);
      new Notice(
        wasCopied
          ? "Claude terminal opened — press Cmd+V then Enter to run"
          : "Claude terminal opened — could not copy the command",
      );
      return "copied-to-clipboard";
    }
  }

  const wasCopied = await copyTextToClipboardWithFallback(request.fallbackShellCommandLine);
  new Notice(
    wasCopied
      ? "Command copied — install obsidian-claude-code to run it in-app"
      : "Could not copy the command",
  );
  return "unavailable";
}

export function openClaudeCodeTerminalView(obsidianApplication: App): boolean {
  const commandsApi = (obsidianApplication as ObsidianApplicationWithCommunityPlugins).commands;
  if (!commandsApi || typeof commandsApi.executeCommandById !== "function") {
    return false;
  }
  for (const candidateCommandId of CLAUDE_CODE_OPEN_COMMAND_CANDIDATE_IDS) {
    if (commandsApi.executeCommandById(candidateCommandId)) {
      return true;
    }
  }
  return false;
}

function findClaudeCodePluginInstance(obsidianApplication: App): object | null {
  const communityPlugins = (obsidianApplication as ObsidianApplicationWithCommunityPlugins)
    .plugins?.plugins;
  if (!communityPlugins) {
    return null;
  }
  for (const candidatePluginId of CLAUDE_CODE_PLUGIN_CANDIDATE_IDS) {
    const pluginInstance = communityPlugins[candidatePluginId];
    if (pluginInstance !== null && typeof pluginInstance === "object") {
      return pluginInstance;
    }
  }
  return null;
}
