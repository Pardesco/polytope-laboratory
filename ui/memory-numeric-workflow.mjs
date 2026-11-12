import { NumericEntry } from './numeric-entry.mjs';
import { captureContentHistoryPublication } from './element-content-history.mjs';

export class MemoryNumericWorkflow {
  constructor(context, getTarget) {
    this.context = context;
    this.entry = new NumericEntry({ ...context, getTarget });
  }
  run(text, publish) {
    const verifyContent = captureContentHistoryPublication(this.context);
    return this.entry.run({ relativeScale: { text, min: 1e-9, max: 1e9 } }, (values, verify, options) =>
      publish(
        values,
        () => {
          verify();
          verifyContent();
        },
        options
      )
    );
  }
  cancel() {
    this.entry.cancel();
  }
  destroy() {
    this.entry.destroy();
  }
}

const unit = (state) => state.view.coordinateUnit ?? state.model.metadata?.coordinateUnits ?? 'model';
export async function prepareMemoryAddition(
  run,
  current,
  stored,
  label,
  {
    relativeScale = 1,
    blend = false,
    fillRule = 'nonzero',
    colorPolicy = 'require-equal',
    signal,
    verifyPublication,
  } = {}
) {
  const verify = () => {
    if (signal?.aborted) throw Object.assign(Error('Model addition canceled.'), { name: 'AbortError' });
    verifyPublication?.();
  };
  verify();
  if (
    blend &&
    [current, stored].some((s) => s.model.dimension !== 3 || (s.model.embeddingDimension ?? s.model.dimension) !== 3)
  )
    throw Error('Memory Blend requires two intrinsic 3D models. Use Add to retain separate 2D or 4D components.');
  const seed = structuredClone(current);
  delete seed.operationNode;
  let document = { id: crypto.randomUUID(), cursor: 0, states: [seed] };
  const parameters = {
    other: structuredClone(stored.model),
    relative_scale: relativeScale,
    source_unit: unit(stored),
    target_unit: unit(current),
  };
  document = await run('recipe-run', { document, operation: 'compound-add', parameters, label }, null, label, {
    signal,
  });
  verify();
  if (blend) {
    document = await run(
      'recipe-run',
      { document, operation: 'merge-compound', parameters: { fill_rule: fillRule, color_policy: colorPolicy }, label },
      null,
      label,
      { signal }
    );
    verify();
  }
  return document;
}
