import { ConflictException } from '@nestjs/common';

export interface OpenRatePeriod {
  id: string;
  ratePerLitre: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface RateChangePlan {
  /** Same calendar day as open period → update that row in place (market correction). */
  mode: 'amend' | 'open_new';
  closedPreviousId: string | null;
  closedEffectiveTo: string | null;
  amendOpenId: string | null;
  newPeriod: {
    ratePerLitre: string;
    effectiveFrom: string;
    effectiveTo: null;
  };
}

/**
 * Pure planner for a milk rate change (unit-tested). Same-day changes amend
 * the open period so farmers can correct market rate more than once per day.
 */
export function planRateChange(
  openPeriod: OpenRatePeriod | null,
  newRatePerLitre: string,
  effectiveFrom: string,
): RateChangePlan {
  if (openPeriod && effectiveFrom < openPeriod.effectiveFrom) {
    throw new ConflictException(
      'effectiveFrom must be on or after the current open rate period start date',
    );
  }

  if (openPeriod && effectiveFrom === openPeriod.effectiveFrom) {
    return {
      mode: 'amend',
      closedPreviousId: null,
      closedEffectiveTo: null,
      amendOpenId: openPeriod.id,
      newPeriod: {
        ratePerLitre: newRatePerLitre,
        effectiveFrom,
        effectiveTo: null,
      },
    };
  }

  return {
    mode: 'open_new',
    closedPreviousId: openPeriod?.id ?? null,
    closedEffectiveTo: openPeriod ? effectiveFrom : null,
    amendOpenId: null,
    newPeriod: {
      ratePerLitre: newRatePerLitre,
      effectiveFrom,
      effectiveTo: null,
    },
  };
}
