/**
 * Example: OpenClaw Proactive Compaction Integration
 * Demonstrates ProactiveCompactionController usage in OpenClaw.
 */
import { ProactiveCompactionController, getModelConfigs } from "../src/index.js";

// Step 1: Create controller with proactive thresholds
const controller = new ProactiveCompactionController(undefined, {
  proactiveRatio: 0.75,
  minTokens: 50000,
  cooldownMs: 300000,
  maxCompactionsPerSession: 5,
  useModelThresholds: true,
});

// Step 2: Check compaction after each turn
async function checkCompaction(sessionId: string, modelId: string, currentTokens: number) {
  const recommendation = controller.shouldCompact(sessionId, modelId, currentTokens);
  if (recommendation.shouldCompact) {
    console.log(`Compaction needed: ${recommendation.reason}`);
    console.log(`  Threshold: ${recommendation.threshold}, Current: ${recommendation.currentTokens}`);
    // Call OpenClaw's compaction here
    // await openclaw.compact(sessionId);
    controller.recordCompaction(sessionId, currentTokens, Math.floor(currentTokens * 0.6));
  }
}

// Step 3: Sync model configs
const configs = getModelConfigs();
console.log(`Loaded ${Object.keys(configs).length} model configs`);
console.log("GLM-5 threshold:", configs["glm-5"]?.compressionThreshold);

// Demo
await checkCompaction("session-1", "glm-5", 113000); // Should trigger at 150k threshold
