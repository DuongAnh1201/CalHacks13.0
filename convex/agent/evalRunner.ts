import { runLoop, type LoopDeps, type LoopInput, type Step } from "./loop";
import type { Page } from "./guard";
/** Adapter for #125 score(cases, runner). A fake client is a wiring smoke, not an accuracy eval. */
export function createEvalRunner(
  dependencies: (
    input: LoopInput,
  ) => Omit<LoopDeps, "step" | "handoff" | "active">,
  availableTools?: (page: `/${Page}`) => readonly string[],
) {
  let sequence = 0;
  return async (
    text: string,
    page: `/${Page}`,
    context: { jobId?: string },
  ) => {
    const input: LoopInput = {
      runId: `eval-${++sequence}`,
      text,
      page: page.slice(1) as Page,
      jobId: context.jobId,
      availableTools: availableTools ? [...availableTools(page)] : undefined,
    };
    const steps: Step[] = [];
    const result = await runLoop(input, {
      ...dependencies(input),
      active: async () => true,
      step: async (step) => {
        steps.push(step);
      },
      handoff: async () => {},
    });
    return { steps, reply: result?.reply ?? "" };
  };
}
