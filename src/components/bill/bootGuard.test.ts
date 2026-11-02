import { describe, expect, it } from 'vitest';
import { evaluateBootGuard } from './bootGuard';

describe('bootGuard', () => {
    it('allows a boot decision object with mode or blocked message', () => {
        const result = evaluateBootGuard();
        if (result.ok) {
            expect(['server', 'local-demo']).toContain(result.mode);
        } else {
            expect(result.reason).toBe('missing_api_url');
            expect(result.message).toMatch(/PUBLIC_POS_API_URL/);
        }
    });
});
