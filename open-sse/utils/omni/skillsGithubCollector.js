// ADAPTED STUB — deep app infra (OmniRoute src/lib/skills/githubCollector.ts).
export const INSTALL_TARGETS = ["global", "project", "user"];
export async function searchGitHubSkills(_query) { return []; }
export async function scanText(_text) { return []; }
export async function resolveInstallPath(_target, _skillName) { return null; }
export function validateInstallConfig(_config) { return { valid: true }; }

import { z } from "zod";

// Zod schemas for the MCP github-skill tools (verbatim from OmniRoute).
export const GitHubSkillsSearchSchema = z.object({
  query: z.string().optional().describe("Optional search text to filter results"),
  minStars: z.number().min(0).max(100000).default(1).describe("Minimum GitHub stars"),
  maxResults: z.number().min(1).max(500).default(50).describe("Max repos to return"),
  minScore: z.number().min(0).max(1).default(0).describe("Minimum relevance score filter"),
});

export const GitHubSkillsScanSchema = z.object({
  repoName: z.string().describe("Full repo name (e.g. 'user/repo')"),
  content: z.string().describe("SKILL.md or README content to scan"),
});

export const GitHubSkillsInstallSchema = z.object({
  repoName: z.string().describe("Full repo name to install"),
  targets: z.array(z.enum(INSTALL_TARGETS)).default(["hermes"]).describe("Where to install the skill"),
  description: z.string().default("").describe("Repo description for category inference"),
});
