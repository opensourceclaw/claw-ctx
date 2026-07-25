/**
 * Tests for custom config loading
 * claw-ctx v5.16.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModelProfileRegistry, BUILTIN_MODEL_PROFILES, type ModelProfile } from '../src/model-profile.js';

describe('ModelProfileRegistry - Custom Configs', () => {
  let registry: ModelProfileRegistry;
  let tempDir: string;

  beforeEach(() => {
    registry = new ModelProfileRegistry();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-ctx-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadCustomConfigs()', () => {
    it('should load custom profiles from JSON file', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'custom-model-1',
            name: 'Custom Model 1',
            provider: 'CustomProvider',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 200000, effectiveWindowRatio: 0.9, prefersSummary: false },
            optimization: { strategy: 'static-prefix', preloadPriority: ['docs'], compressionThreshold: 150000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const loaded = registry.loadCustomConfigs(configPath);
      expect(loaded).toBe(1);
      expect(registry.has('custom-model-1')).toBe(true);
      expect(registry.isCustom('custom-model-1')).toBe(true);
    });

    it('should load multiple custom profiles', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'custom-a',
            name: 'Custom A',
            provider: 'Custom',
            cache: { staticPrefixBonus: false, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['code'], compressionThreshold: 80000 },
          },
          {
            id: 'custom-b',
            name: 'Custom B',
            provider: 'Custom',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 150000, effectiveWindowRatio: 0.85, prefersSummary: true },
            optimization: { strategy: 'static-prefix', preloadPriority: ['docs'], compressionThreshold: 120000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const loaded = registry.loadCustomConfigs(configPath);
      expect(loaded).toBe(2);
    });

    it('should override builtin profile with custom', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'deepseek-v3', // Override builtin
            name: 'DeepSeek V3 Customized',
            provider: 'DeepSeek',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 256000, effectiveWindowRatio: 0.95, prefersSummary: false },
            optimization: { strategy: 'static-prefix', preloadPriority: ['tests'], compressionThreshold: 200000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      registry.loadCustomConfigs(configPath);
      const profile = registry.get('deepseek-v3');
      expect(profile?.name).toBe('DeepSeek V3 Customized');
      expect(profile?.context.maxTokens).toBe(256000);
      expect(registry.isCustom('deepseek-v3')).toBe(true);
    });

    it('should return 0 for non-existent file', () => {
      const loaded = registry.loadCustomConfigs('/non/existent/path/models.json');
      expect(loaded).toBe(0);
    });

    it('should return 0 for invalid JSON', () => {
      const configPath = path.join(tempDir, 'models.json');
      fs.writeFileSync(configPath, 'not valid json');

      const loaded = registry.loadCustomConfigs(configPath);
      expect(loaded).toBe(0);
    });

    it('should return 0 for missing models array', () => {
      const configPath = path.join(tempDir, 'models.json');
      fs.writeFileSync(configPath, JSON.stringify({ profiles: [] }));

      const loaded = registry.loadCustomConfigs(configPath);
      expect(loaded).toBe(0);
    });

    it('should skip invalid profiles', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          // Valid
          {
            id: 'valid-model',
            name: 'Valid Model',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
          // Invalid - missing id
          {
            name: 'Invalid Model',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
          // Invalid - invalid strategy
          {
            id: 'invalid-strategy',
            name: 'Invalid Strategy',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'invalid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const loaded = registry.loadCustomConfigs(configPath);
      expect(loaded).toBe(1); // Only the valid one
    });

    it('should load from directory (looking for models.json)', () => {
      const config = {
        models: [
          {
            id: 'dir-loaded',
            name: 'Directory Loaded',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(path.join(tempDir, 'models.json'), JSON.stringify(config));

      const loaded = registry.loadCustomConfigs(tempDir);
      expect(loaded).toBe(1);
      expect(registry.has('dir-loaded')).toBe(true);
    });
  });

  describe('loadWorkspaceConfigs()', () => {
    it('should load from .claw-ctx/models.json', () => {
      const clawCtxDir = path.join(tempDir, '.claw-ctx');
      fs.mkdirSync(clawCtxDir, { recursive: true });

      const config = {
        models: [
          {
            id: 'workspace-model',
            name: 'Workspace Model',
            provider: 'Workspace',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(path.join(clawCtxDir, 'models.json'), JSON.stringify(config));

      const loaded = registry.loadWorkspaceConfigs(tempDir);
      expect(loaded).toBe(1);
      expect(registry.has('workspace-model')).toBe(true);
    });
  });

  describe('getCustomIds()', () => {
    it('should return empty array before loading custom configs', () => {
      expect(registry.getCustomIds()).toEqual([]);
    });

    it('should return custom profile IDs after loading', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'custom-1',
            name: 'Custom 1',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      registry.loadCustomConfigs(configPath);

      expect(registry.getCustomIds()).toEqual(['custom-1']);
    });
  });

  describe('getBuiltinIds()', () => {
    it('should return all builtin profile IDs', () => {
      const builtinIds = registry.getBuiltinIds();
      expect(builtinIds.length).toBe(35);
      expect(builtinIds).toContain('deepseek-v3');
      expect(builtinIds).toContain('gpt-4o');
    });
  });

  describe('isCustom()', () => {
    it('should return false for builtin profiles', () => {
      expect(registry.isCustom('deepseek-v3')).toBe(false);
      expect(registry.isCustom('gpt-4o')).toBe(false);
    });

    it('should return true for custom profiles', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'my-custom',
            name: 'My Custom',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      registry.loadCustomConfigs(configPath);

      expect(registry.isCustom('my-custom')).toBe(true);
    });
  });

  describe('clearCustom()', () => {
    it('should clear all custom profiles', () => {
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'to-clear',
            name: 'To Clear',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      registry.loadCustomConfigs(configPath);

      expect(registry.has('to-clear')).toBe(true);
      registry.clearCustom();
      expect(registry.has('to-clear')).toBe(false);
      expect(registry.getCustomIds()).toEqual([]);
    });

    it('should restore builtin profiles after clear', () => {
      // Override a builtin
      const configPath = path.join(tempDir, 'models.json');
      const config = {
        models: [
          {
            id: 'deepseek-v3',
            name: 'Overridden',
            provider: 'Test',
            cache: { staticPrefixBonus: true, supported: true },
            context: { maxTokens: 999999, effectiveWindowRatio: 0.8, prefersSummary: false },
            optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      registry.loadCustomConfigs(configPath);

      expect(registry.get('deepseek-v3')?.context.maxTokens).toBe(999999);

      registry.clearCustom();

      // Should restore original builtin
      expect(registry.get('deepseek-v3')?.context.maxTokens).toBe(128000);
      expect(registry.isCustom('deepseek-v3')).toBe(false);
    });
  });
});
