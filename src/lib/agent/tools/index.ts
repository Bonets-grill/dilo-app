import type { UserSkill } from "@/lib/supabase/types";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  uiCard?: {
    type: "message_sent" | "reminder_created" | "expense_tracked" | "list_updated" | "info";
    text: string;
    icon?: string;
  };
}

export type ToolExecuteFn = (
  params: Record<string, unknown>,
  userId: string
) => Promise<ToolResult>;

interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecuteFn;
  skillId: string | "basic"; // 'basic' = always available
}

// Tool registry
const registry: Map<string, RegisteredTool> = new Map();

export function registerTool(
  skillId: string | "basic",
  definition: ToolDefinition,
  execute: ToolExecuteFn
) {
  registry.set(definition.name, { definition, execute, skillId });
}

export function getAvailableTools(
  userSkills: UserSkill[]
): ToolDefinition[] {
  const activeSkillIds = new Set(
    userSkills.filter((s) => s.status === "active").map((s) => s.skill_id)
  );

  // Always include basic + skills the user has
  return Array.from(registry.values())
    .filter(
      (tool) => tool.skillId === "basic" || activeSkillIds.has(tool.skillId)
    )
    .map((tool) => tool.definition);
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map((t) => t.definition);
}

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  userId: string
): Promise<ToolResult> {
  const tool = registry.get(toolName);
  if (!tool) {
    return { success: false, error: `Tool '${toolName}' not found` };
  }
  try {
    return await tool.execute(params, userId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}

export function getToolSkillId(toolName: string): string | undefined {
  return registry.get(toolName)?.skillId;
}

export function isToolAvailable(
  toolName: string,
  userSkills: UserSkill[]
): boolean {
  const tool = registry.get(toolName);
  if (!tool) return false;
  if (tool.skillId === "basic") return true;
  return userSkills.some(
    (s) => s.skill_id === tool.skillId && s.status === "active"
  );
}

// ── Register all tools ──
// Basic tools (always free)
import "./basic.tool";
