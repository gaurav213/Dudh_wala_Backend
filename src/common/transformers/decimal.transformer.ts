import { ValueTransformer } from 'typeorm';

export const decimalTransformer: ValueTransformer = {
  to: (value?: string | number | null) => {
    if (value === null || value === undefined) return value;
    return String(value);
  },
  from: (value?: string | number | null) => {
    if (value === null || value === undefined) return value;
    return String(value);
  },
};
