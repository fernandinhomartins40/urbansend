/**
 * Testes Jest para validação de migrations
 * Executado automaticamente com npm test
 */

const MigrationValidator = require('./migration-validator');

describe('Migration Validation', () => {
    let validator;

    beforeEach(() => {
        validator = new MigrationValidator();
    });

    test('should pass naming convention validation', async () => {
        await validator.testNamingConvention();
        expect(validator.errors.length).toBe(0);
    });

    test('should pass alphabetical order validation', async () => {
        await validator.testAlphabeticalOrder();
        expect(validator.errors.length).toBe(0);
    });

    test('should have no duplicate prefixes', async () => {
        await validator.testDuplicates();
        expect(validator.errors.length).toBe(0);
    });

    test('should have required structure', async () => {
        await validator.testRequiredStructure();
        expect(validator.errors.length).toBe(0);
    });

    test('should pass schema consistency', async () => {
        await validator.testSchemaConsistency();
        expect(validator.errors.length).toBe(0);
    });

    test('should validate all migrations successfully', async () => {
        const success = await validator.validateAll();
        expect(success).toBe(true);
    });
});