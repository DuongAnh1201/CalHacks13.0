import { z } from "zod";
import type { ToolRegistry } from "./guard";
const target = z.string().trim().min(1).max(200);
export const viewerSchemas = {
  zoom_view: z
    .object({
      action: z.enum(["in", "out", "set", "fit"]),
      percent: z.number().min(50).max(400).optional(),
    })
    .strict()
    .refine(
      (a) => a.action !== "set" || a.percent !== undefined,
      "set requires percent",
    ),
  rotate_view: z
    .object({
      preset: z
        .enum(["front", "back", "left", "right", "top", "bottom"])
        .optional(),
      yaw_deg: z.number().min(-360).max(360).optional(),
      pitch_deg: z.number().min(-180).max(180).optional(),
    })
    .strict()
    .refine(
      (a) =>
        a.preset !== undefined
          ? a.yaw_deg === undefined && a.pitch_deg === undefined
          : a.yaw_deg !== undefined || a.pitch_deg !== undefined,
      "choose a preset or relative angles",
    ),
  spin_view: z
    .object({ on: z.boolean(), speed: z.number().min(-90).max(90).optional() })
    .strict(),
  set_mode: z
    .object({ mode: z.enum(["solid", "xray", "exploded", "cutaway"]) })
    .strict(),
  set_opacity: z
    .object({
      target: z.enum(["cortex", "brain"]),
      percent: z.number().min(0).max(100),
    })
    .strict(),
  set_explode: z.object({ percent: z.number().min(0).max(100) }).strict(),
  isolate: z.object({ target, on: z.boolean() }).strict(),
  focus_region: z.object({ region: target }).strict(),
  toggle_visibility: z
    .object({ targets: z.array(target).min(1).max(100), visible: z.boolean() })
    .strict(),
  reset_view: z.object({}).strict(),
  undo: z.object({}).strict(),
};
export const viewerDescriptions: Record<keyof typeof viewerSchemas, string> = {
  zoom_view: "Send a zoom command (100 percent is home distance).",
  rotate_view: "Send a camera preset or relative rotation.",
  spin_view: "Send continuous camera spin on/off.",
  set_mode: "Send a viewer mode change.",
  set_opacity: "Send cortex/brain opacity (percent).",
  set_explode: "Send hemisphere explosion (percent).",
  isolate: "Send target isolation on/off.",
  focus_region: "Send focus on a structure, group or tumor.",
  toggle_visibility: "Send visibility of named targets.",
  reset_view: "Send reset to the home view.",
  undo: "Send undo of the last viewer action.",
};
export const toolRegistry: ToolRegistry = {
  ...Object.fromEntries(
    Object.keys(viewerSchemas).map((name) => [
      name,
      { pages: ["learn", "3d"] as const },
    ]),
  ),
  // MRI is the 2D MPR page; only its supported viewer commands are offered.
  zoom_view: { pages: ["learn", "mri", "3d"] },
  reset_view: { pages: ["learn", "mri", "3d"] },
  undo: { pages: ["learn", "mri", "3d"] },
  focus_region: { pages: ["learn", "mri", "3d"] },
  toggle_visibility: { pages: ["learn", "mri", "3d"] },
  explain_structure: { pages: ["learn"] },
  explain_finding: { pages: ["mri", "3d"] },
  get_tumor_metrics: { pages: ["mri", "3d"] },
  get_report: { pages: ["mri", "3d"] },
  search: { pages: ["learn", "mri", "3d"] },
  export_document: { pages: ["learn", "mri", "3d"] },
};
