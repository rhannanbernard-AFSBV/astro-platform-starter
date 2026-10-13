import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStrongSecret } from './jwtSecret.js';

describe('isStrongSecret', () => {
  it('rejects placeholders and short secrets', () => {
    assert.equal(isStrongSecret(''), false);
    assert.equal(isStrongSecret('change-me-in-production'), false);
    assert.equal(isStrongSecret('omniclean-dev-secret-change-me'), false);
    assert.equal(isStrongSecret('short'), false);
  });

  it('accepts long random secrets', () => {
    assert.equal(
      isStrongSecret('xk9fQ2mL8pR4vN7sT1wY6zA3bC5dE0gH2jK4mP6qS8uV0xZ'),
      true
    );
  });
});
