import type { Report } from '../../api/types';
import { cm3, sideLabel } from '../../routes/summary';
import type { AgentMessage } from './types';

/** Placeholder log until Tom's agents (#64/#65) feed the panel. Built only from report.json. */
export function demoMessages(r: Report, page: 'mri' | '3d'): AgentMessage[] {
  if (!r.tumorDetected) return [{ kind: 'system', agent: 'Vision agent', text: 'No tumor detected' }];
  const v = cm3(r.volumesCm3.whole);
  const msgs: AgentMessage[] = [{ kind: 'system', agent: 'Vision agent', text: `Segmentation done: ${v}, ${sideLabel(r.side)}` }];
  if (page === 'mri') msgs.push({ kind: 'confirm', agent: 'Spatial UI', text: `Place the ${v} tumor on the 3D brain?`, confirmLabel: 'Place in 3D', dismissLabel: 'Not now' });
  return msgs;
}
