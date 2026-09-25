import { resolveEffectiveStartDate } from '../service-requests/service-request-validation.util';

/** Self-check: managed create uses same start-date clamp as accept. */
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  resolveEffectiveStartDate('2026-09-01', '2026-09-06') === '2026-09-06',
  'past start bumps to today',
);
assert(
  resolveEffectiveStartDate('2026-09-10', '2026-09-06') === '2026-09-10',
  'future start kept',
);

console.log('managed-customer start-date check ok');
