import { roundMoney } from '../../../common/utils/decimal.util';
import { Decimal } from 'decimal.js';

/** Split per-customer nets (milk − payments) so one advance never reduces another's due. */
export function splitFarmBillRemainings(
  nets: Array<string | number>,
): { toCollect: string; advanceBalance: string } {
  let due = new Decimal(0);
  let advance = new Decimal(0);
  for (const raw of nets) {
    const n = new Decimal(raw || 0);
    if (n.gt(0)) due = due.plus(n);
    else if (n.lt(0)) advance = advance.plus(n.abs());
  }
  return {
    toCollect: roundMoney(due),
    advanceBalance: roundMoney(advance),
  };
}
