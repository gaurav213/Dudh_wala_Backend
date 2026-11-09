import {
  farmProfileCompletionPercent,
  isFarmProfileComplete,
} from './farm-onboarding.util';

describe('isFarmProfileComplete', () => {
  it('is complete without email when business name and description exist', () => {
    expect(
      isFarmProfileComplete({
        businessName: 'Haral Dairy',
        description: 'Fresh cow milk',
      }),
    ).toBe(true);
  });

  it('is incomplete when description is missing', () => {
    expect(
      isFarmProfileComplete({
        businessName: 'Haral Dairy',
        description: '  ',
      }),
    ).toBe(false);
  });
});

describe('farmProfileCompletionPercent', () => {
  it('is 100 when profile checklist fields are filled (ignores missing map pin)', () => {
    expect(
      farmProfileCompletionPercent({
        businessName: 'test farm name',
        description: 'A dairy',
      }),
    ).toBe(100);
  });

  it('is 50 when only one of business name / description is set', () => {
    expect(
      farmProfileCompletionPercent({
        businessName: 'test farm name',
        description: null,
      }),
    ).toBe(50);
  });
});
