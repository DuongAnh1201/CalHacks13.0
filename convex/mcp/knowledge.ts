import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { anatomy, atlas, MISSING_REPORT, NO_TUMOR, NOTICE, reportFor, type KnowledgeData } from "./data";
import { knowledgeSchemas } from "./definitions";
import { buildTumorCard } from "../lib/tumorSummary";

const blocked = /\b(diagnos\w*|prognos\w*|survival|malignant|benign|healthy|treatment)\b/i;
/** File text is data, not instructions. Apply the wording guard to every reply. */
function guarded(value: unknown): unknown {
  if (typeof value === 'string') return blocked.test(value) ? "This content is unavailable in the educational viewer." : value;
  if (Array.isArray(value)) return value.map(guarded);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, guarded(item)]));
  return value;
}
function result(value: Record<string, unknown>) {
  const safe = guarded({ ...value, notice: NOTICE }) as Record<string, unknown>;
  return { content: [{ type: 'text' as const, text: JSON.stringify(safe) }], structuredContent: safe };
}
const normalize = (text: string) => text.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
function findStructures(name: string) {
  let query = normalize(name);
  const left = /\b(left|lh)\b/.test(query), right = /\b(right|rh)\b/.test(query);
  query = query.replace(/\b(left|right|lh|rh)\b/g, '').trim();
  if (!query) return [];
  return atlas.structures.filter(s => (!left || s.side === 'left') && (!right || s.side === 'right') &&
    [s.name, s.id.replace(/^(lh_|rh_)/, ''), s.group].some(value => normalize(value).includes(query)));
}

/** Extension seam: other modules expose registerAnnotations/Messages/Summaries/Exports(server, deps). */
export function registerKnowledge(server: McpServer, data: KnowledgeData) {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool('explain_structure', { description: 'Read template-atlas anatomy. General information, not from a patient scan.', inputSchema: knowledgeSchemas.explain_structure, annotations }, async ({ name, depth }) => {
    const matches = findStructures(name).map(s => {
      const key = s.id.replace(/^(lh_|rh_)/, '') as keyof typeof anatomy;
      const text = anatomy[key];
      return { ...s, description: text?.description ?? null, functions: text?.functions ?? [], ...(depth === 'detailed' ? { whenDamaged: text?.whenDamaged ?? null } : {}), source: 'atlas://structures' };
    });
    return result({ message: matches.length ? 'General information, not from this scan.' : 'No matching atlas structure was found.', structures: matches });
  });
  server.registerTool('get_report', { description: 'Read actual report.json scan facts and model metadata. No job or atlas page means no patient report.', inputSchema: knowledgeSchemas.get_report, annotations }, async args => {
    const { report, message } = await reportFor(data, args);
    return result({ report, message, source: report ? `report://${report.jobId}` : null });
  });
  server.registerTool('summarize_tumor', { description: 'Read-only tumor summary card built by code from report.json (no model): side, lesion count, volume and outline certainty per region, the segmentation source, and the 3D layer names. Returns "No tumor detected in this scan" when there is none. Prefer this for "summarize the tumor" requests and show its text unchanged.', inputSchema: knowledgeSchemas.summarize_tumor, annotations }, async args => {
    const { report, message } = await reportFor(data, args);
    if (!report) return result({ message, card: null, source: null });
    return result({ source: `report://${report.jobId}`, message: report.tumorDetected ? null : NO_TUMOR, card: buildTumorCard(report) });
  });
  server.registerTool('get_tumor_metrics', { description: 'Read exact report volumes, side, lesion count, source, expertDice and outline certainty. sizeCm is bbox extent in mm divided by 10, not a tissue interpretation.', inputSchema: knowledgeSchemas.get_tumor_metrics, annotations }, async args => {
    const { report, message } = await reportFor(data, args);
    if (!report) return result({ message, metrics: null });
    const metrics = {
      tumorDetected: report.tumorDetected, volumesCm3: report.volumesCm3, side: report.side,
      lesionCount: report.lesionCount, centroidMm: report.centroidMm, bboxMm: report.bboxMm,
      sizeCm: report.bboxMm ? report.bboxMm.max.map((max, i) => (max - report.bboxMm!.min[i]) / 10) : null,
      segmentationSource: report.segmentationSource, expertDice: report.expertDice ?? null,
      certainty: report.certainty ?? null,
    };
    return result({ source: `report://${report.jobId}`, message: report.tumorDetected ? null : NO_TUMOR,
      certaintyNote: report.certainty && Object.values(report.certainty).every(v => v !== null) ? 'Uncalibrated model certainty for the outlined regions.' : 'Model outline certainty is not available for one or more regions.',
      metrics: args.fields ? Object.fromEntries(args.fields.map(field => [field, metrics[field]])) : metrics });
  });
  server.registerTool('explain_finding', { description: 'Explain the existing segmentation using only the report facts and a fixed educational template.', inputSchema: knowledgeSchemas.explain_finding, annotations }, async args => {
    const { report, message } = await reportFor(data, args);
    if (!report) return result({ message });
    const v = report.volumesCm3;
    const explanation = report.tumorDetected ? `${report.segmentationSource === 'expert' ? 'Expert segmentation' : 'The model'} outlined ${report.lesionCount} region(s), with a whole outlined volume of ${v.whole} cm³; core ${v.core} cm³; enhancing ${v.enhancing} cm³. Side: ${report.side ?? 'not available'}.` : NO_TUMOR;
    return result({ message: explanation, source: `report://${report.jobId}` });
  });
  server.registerTool('search', { description: 'Search atlas name/group and report field paths/values. Chat search is not registered yet.', inputSchema: knowledgeSchemas.search, annotations }, async args => {
    const sources = args.sources ?? ['atlas', 'report'];
    const matches: unknown[] = [];
    if (sources.includes('atlas')) for (const structure of findStructures(args.query)) matches.push({ source: 'atlas://structures', structure });
    let message: string | null = null;
    if (sources.includes('report')) {
      const found = await reportFor(data, args);
      message = found.message;
      const visit = (value: unknown, path: string) => {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
        } else if (normalize(`${path} ${JSON.stringify(value)}`).includes(normalize(args.query))) {
          matches.push({ source: `report://${found.report!.jobId}`, path, value });
        }
      };
      if (found.report) visit(found.report, '');
    }
    return result({ matches: matches.slice(0, 50), message });
  });
  server.registerResource('atlas_structures', 'atlas://structures', { mimeType: 'application/json', description: 'Template atlas structures and educational anatomy, not patient data.' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(guarded({ ...atlas, anatomy, notice: NOTICE })) }] }));
  server.registerResource('report', new ResourceTemplate('report://{jobId}', { list: undefined }), { mimeType: 'application/json', description: 'Read an actual report by job ID; unavailable reports are explicit.' }, async (uri, variables) => {
    const jobId = String(variables.jobId);
    const report = await data.readReport(jobId);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(guarded(report ?? { message: MISSING_REPORT })) }] };
  });
}
