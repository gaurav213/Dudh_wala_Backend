import { ConflictException } from '@nestjs/common';

export interface OpenRatePeriod {
  id: string;
  ratePerLitre: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface RateChangePlan {
  closedPreviousId: string | null;
  closedEffectiveTo: string | null;
  newPeriod: {
    ratePerLitre: string;
    effectiveFrom: string;
    effectiveTo: null;
  };
}

/**
 * Pure planner for a milk rate change (unit-tested). Given the currently
 * open rate period (if any) and the requested new rate, decides how to
 * close the previous period and describes the new one. Rejects changes
 * that would create an overlapping open period.
 */
export function planRateChange(
  openPeriod: OpenRatePeriod | null,
  newRatePerLitre: string,
  effectiveFrom: string,
): RateChangePlan {
  if (openPeriod && effectiveFrom <= openPeriod.effectiveFrom) {
    throw new ConflictException(
      'effectiveFrom must be after the current open rate period start date',
    );
  }

  return {
    closedPreviousId: openPeriod?.id ?? null,
    closedEffectiveTo: openPeriod ? effectiveFrom : null,
    newPeriod: {
      ratePerLitre: newRatePerLitre,
      effectiveFrom,
      effectiveTo: null,
    },
  };
}
