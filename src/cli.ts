#!/usr/bin/env node
/**
 * claw-ctx CLI
 *
 * Command-line interface for model profile management
 *
 * v5.16.0: Initial implementation
 */

import * as fs from "fs";
import * as path from "path";

// Import from compiled JS (ESM)
import {
  modelProfileRegistry,
  BUILTIN_MODEL_PROFILES,
  type ModelProfile,
} from "./model-profile.js";
import {
  modelAwareOptimizer,
  DEFAULT_STRATEGY_CONFIGS,
} from "./model-aware-optimizer.js";

interface ParsedArgs {
  command: string;
  subCommand: string;
  args: string[];
  options: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const options: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : "true";
      if (value !== "true") i++;
      options[key] = value;
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      options[key] = "true";
    } else {
      args.push(arg);
    }
  }

  return {
    command: args[0] || "help",
    subCommand: args[1] || "",
    args: args.slice(2),
    options,
  };
}

function printHelp(): void {
  console.log(`
claw-ctx CLI - Model Profile Management

Usage:
  claw-ctx <command> [subcommand] [options]

Commands:
  model       Model profile management
  help        Show this help message

Model Subcommands:
  list              List all available model profiles
  show <id>         Show detailed profile for a model
  strategy <id>     Show optimization strategy for a model
  providers         List all providers
  builtin           List builtin profiles only

Options:
  --workspace <dir>   Workspace directory for custom configs
  --json              Output in JSON format

Examples:
  claw-ctx model list
  claw-ctx model show deepseek-v3
  claw-ctx model strategy gpt-4o
  claw-ctx model list --workspace /path/to/project
  claw-ctx model providers
`);
}

function formatStrategy(strategy: string): string {
  const colors: Record<string, string> = {
    "static-prefix": "\x1b[32m", // green
    "dynamic-load": "\x1b[33m",  // yellow
    "hybrid": "\x1b[36m",        // cyan
  };
  return `${colors[strategy] || ""}${strategy}\x1b[0m`;
}

function cmdModelList(options: Record<string, string>): void {
  // Load workspace configs if specified
  if (options.workspace) {
    const loaded = modelProfileRegistry.loadWorkspaceConfigs(options.workspace);
    if (loaded > 0) {
      console.log(`Loaded ${loaded} custom profile(s) from workspace\n`);
    }
  }

  const profiles = modelProfileRegistry.getAllIds().map(id => modelProfileRegistry.get(id)!);

  if (options.json) {
    console.log(JSON.stringify(profiles, null, 2));
    return;
  }

  console.log(`\nAvailable Model Profiles (${profiles.length}):\n`);
  console.log("  ID                      Name                    Provider      Strategy");
  console.log("  ".padEnd(90, "-"));

  for (const p of profiles) {
    const custom = modelProfileRegistry.isCustom(p.id) ? " [custom]" : "";
    const id = p.id.padEnd(23);
    const name = p.name.padEnd(23);
    const provider = p.provider.padEnd(13);
    console.log(`  ${id}${name}${provider} ${formatStrategy(p.optimization.strategy)}${custom}`);
  }

  console.log("");
}

function cmdModelShow(modelId: string, options: Record<string, string>): void {
  // Load workspace configs if specified
  if (options.workspace) {
    modelProfileRegistry.loadWorkspaceConfigs(options.workspace);
  }

  const profile = modelProfileRegistry.resolve(modelId);
  if (!profile) {
    console.error(`Model not found: ${modelId}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  const hint = modelAwareOptimizer.getOptimizationHint(profile.id);

  console.log(`\n${profile.name} (${profile.id})`);
  console.log("".padEnd(50, "="));
  console.log(`Provider:           ${profile.provider}`);
  console.log(`Strategy:           ${formatStrategy(hint.strategy)}`);
  console.log(`\nContext Window:`);
  console.log(`  Max Tokens:       ${profile.context.maxTokens.toLocaleString()}`);
  console.log(`  Effective Ratio:  ${Math.round(profile.context.effectiveWindowRatio * 100)}%`);
  console.log(`  Effective Tokens: ${hint.maxContextTokens.toLocaleString()}`);
  console.log(`  Prefers Summary:  ${profile.context.prefersSummary ? "Yes" : "No"}`);
  console.log(`\nCache:`);
  console.log(`  Supported:        ${profile.cache.supported ? "Yes" : "No"}`);
  console.log(`  Static Prefix:    ${profile.cache.staticPrefixBonus ? "Bonus" : "No bonus"}`);
  console.log(`\nOptimization:`);
  console.log(`  Compression:      ${profile.optimization.compressionThreshold.toLocaleString()} tokens`);
  console.log(`  Preload Priority: ${profile.optimization.preloadPriority.join(" > ")}`);
  console.log(`  Budget Allocation:`);

  const alloc = modelAwareOptimizer.calculateBudgetAllocation(profile.id, 100000);
  console.log(`    Stable:         ${alloc.stable.toLocaleString()} (${Math.round(alloc.stable / 100000 * 100)}%)`);
  console.log(`    Dynamic:        ${alloc.dynamic.toLocaleString()} (${Math.round(alloc.dynamic / 100000 * 100)}%)`);
  console.log(`    Reserve:        ${alloc.reserve.toLocaleString()} (${Math.round(alloc.reserve / 100000 * 100)}%)`);

  if (modelProfileRegistry.isCustom(profile.id)) {
    console.log(`\n  [Custom Profile]`);
  }
  console.log("");
}

function cmdModelStrategy(modelId: string, options: Record<string, string>): void {
  if (options.workspace) {
    modelProfileRegistry.loadWorkspaceConfigs(options.workspace);
  }

  const hint = modelAwareOptimizer.getOptimizationHint(modelId);
  const config = DEFAULT_STRATEGY_CONFIGS[hint.strategy];

  if (options.json) {
    console.log(JSON.stringify({ modelId, hint, config }, null, 2));
    return;
  }

  console.log(`\nOptimization Strategy for "${modelId}"\n`);
  console.log(`Strategy:           ${formatStrategy(hint.strategy)}`);
  console.log(`\nContext Settings:`);
  console.log(`  Cache Static:     ${hint.cacheStaticPrefix ? "Yes" : "No"}`);
  console.log(`  Prefers Summary:  ${hint.preferSummary ? "Yes" : "No"}`);
  console.log(`  Compression:      ${hint.compressionThreshold.toLocaleString()} tokens`);
  console.log(`\nBudget Allocation (100k budget):`);
  console.log(`  Stable Ratio:     ${Math.round(hint.stablePrefixRatio * 100)}%`);
  console.log(`  Dynamic Loading:  ${hint.dynamicLoadingPreferred ? "Preferred" : "Secondary"}`);
  console.log(`\nStrategy Config:`);
  console.log(`  Batch Load:       ${config.batchStaticLoad ? "Yes" : "No"}`);
  console.log(`  Predictive:       ${config.predictivePreload ? "Yes" : "No"}`);
  console.log(`  Max Preload:      ${config.maxPreloadItems} items`);
  console.log("");
}

function cmdModelProviders(options: Record<string, string>): void {
  if (options.workspace) {
    modelProfileRegistry.loadWorkspaceConfigs(options.workspace);
  }

  const profiles = BUILTIN_MODEL_PROFILES;
  const providers = new Map<string, number>();

  for (const p of profiles) {
    providers.set(p.provider, (providers.get(p.provider) || 0) + 1);
  }

  if (options.json) {
    console.log(JSON.stringify(Object.fromEntries(providers), null, 2));
    return;
  }

  console.log(`\nModel Providers:\n`);
  console.log("  Provider         Models    Strategy Preference");
  console.log("  ".padEnd(50, "-"));

  for (const [provider, count] of providers) {
    const sample = profiles.find(p => p.provider === provider)!;
    const strategies = profiles.filter(p => p.provider === provider).map(p => p.optimization.strategy);
    const uniqueStrategies = [...new Set(strategies)];
    console.log(`  ${provider.padEnd(16)} ${String(count).padEnd(9)} ${uniqueStrategies.map(formatStrategy).join(", ")}`);
  }
  console.log("");
}

function cmdModelBuiltin(options: Record<string, string>): void {
  const profiles = BUILTIN_MODEL_PROFILES;

  if (options.json) {
    console.log(JSON.stringify(profiles, null, 2));
    return;
  }

  console.log(`\nBuiltin Model Profiles (${profiles.length}):\n`);

  // Group by provider
  const byProvider = new Map<string, ModelProfile[]>();
  for (const p of profiles) {
    const list = byProvider.get(p.provider) || [];
    list.push(p);
    byProvider.set(p.provider, list);
  }

  for (const [provider, models] of byProvider) {
    console.log(`  ${provider}:`);
    for (const m of models) {
      console.log(`    - ${m.id.padEnd(20)} (${formatStrategy(m.optimization.strategy)})`);
    }
  }
  console.log("");
}

function main(): void {
  const { command, subCommand, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || (command === "model" && subCommand === "help")) {
    printHelp();
    return;
  }

  if (command === "model") {
    switch (subCommand) {
      case "list":
        cmdModelList(options);
        break;
      case "show":
        if (!options.args[0]) {
          console.error("Error: model ID required");
          console.error("Usage: claw-ctx model show <model-id>");
          process.exit(1);
        }
        cmdModelShow(options.args[0], options);
        break;
      case "strategy":
        if (!options.args[0]) {
          console.error("Error: model ID required");
          console.error("Usage: claw-ctx model strategy <model-id>");
          process.exit(1);
        }
        cmdModelStrategy(options.args[0], options);
        break;
      case "providers":
        cmdModelProviders(options);
        break;
      case "builtin":
        cmdModelBuiltin(options);
        break;
      default:
        console.error(`Unknown subcommand: model ${subCommand}`);
        printHelp();
        process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main();
