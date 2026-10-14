/** Run a stepped action (see GameCore.advanceSteps) straight through and return what it returns. */
export function runSteps<T>(g: Generator<unknown, T, void>): T {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
