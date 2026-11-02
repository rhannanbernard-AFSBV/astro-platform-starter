import { describe, expect, it } from 'vitest';
import { applyEnrichment, localEnrichMenuItem } from './menuAi';

describe('menu AI enrich', () => {
    it('writes wine pairings to Jamaican meals', () => {
        const enrich = localEnrichMenuItem({
            name: 'Cloudy Bay Sauvignon Blanc',
            category: 'Wine',
            description: '',
            origin: 'Marlborough, New Zealand',
            vintageYear: 2023,
        });
        expect(enrich.pairingNotes.toLowerCase()).toMatch(/jerk|ackee|festival|oxtail|curry/);
        expect(enrich.prepGuide.length).toBeGreaterThan(40);
        expect(enrich.ingredients).toContain('Marlborough');
        expect(enrich.source).toBe('local');
    });

    it('fills food ingredients without wiping an existing description', () => {
        const enrich = localEnrichMenuItem({
            name: 'Jerk Chicken',
            category: 'Mains',
            description: 'Pimento wood smoke',
            origin: null,
            vintageYear: null,
        });
        const item = applyEnrichment(
            {
                id: '1',
                name: 'Jerk Chicken',
                description: 'Pimento wood smoke',
                category: 'Mains',
                priceCents: 2450,
                image: '',
                modifierGroups: [],
            },
            enrich,
        );
        expect(item.description).toBe('Pimento wood smoke');
        expect(item.ingredients?.toLowerCase()).toContain('scotch bonnet');
        expect(item.prepGuide).toBeTruthy();
    });
});
