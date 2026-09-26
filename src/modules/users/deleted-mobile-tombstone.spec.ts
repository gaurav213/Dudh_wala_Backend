import { deletedMobileTombstone } from './users.service';

describe('deletedMobileTombstone', () => {
  it('fits users.mobile_number varchar(20) and stays unique per id', () => {
    const id = '2c5bd307-741e-413d-88c9-8fc8ad107767';
    const stamp = deletedMobileTombstone(id);
    expect(stamp.length).toBeLessThanOrEqual(20);
    expect(stamp).toMatch(/^d[a-f0-9]+$/);
    expect(deletedMobileTombstone(id)).toBe(stamp);
    expect(deletedMobileTombstone('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).not.toBe(
      stamp,
    );
  });
});
