export type ToolCallRow = { call: string; ms: number; ok: boolean; message?: string };
export type AgentMessage =
  | { kind: 'system'; agent: string; text: string }
  | { kind: 'user'; text: string; via: 'text' | 'voice'; at: string }
  | { kind: 'agent'; agent: string; text: string; at: string; calls?: ToolCallRow[] }
  | { kind: 'confirm'; agent: string; text: string; confirmLabel: string; dismissLabel: string };

export interface AgentPanelProps {
  messages: AgentMessage[];
  status: 'ready' | 'listening' | 'offline';
  script?: string[];
  onSend?: (text: string) => void;      // absent → input disabled, placeholder "Agent not connected yet"
  onRun?: (lines: string[]) => void;    // absent → Run disabled
  onMic?: () => void;                   // absent → mic disabled
  onConfirm?: () => void;
  onDismiss?: () => void;
}
