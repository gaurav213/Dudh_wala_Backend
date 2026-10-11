import { isFarmProfileComplete } from './farm-onboarding.util';

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
