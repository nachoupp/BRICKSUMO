import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'no-restricted-globals': [
                'error',
                {
                    name: 'localStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
                {
                    name: 'sessionStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
                {
                    name: 'indexedDB',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
            ],
            'no-restricted-properties': [
                'error',
                {
                    object: 'window',
                    property: 'localStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
                {
                    object: 'window',
                    property: 'sessionStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
                {
                    object: 'globalThis',
                    property: 'localStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
                {
                    object: 'globalThis',
                    property: 'sessionStorage',
                    message: 'BRICKSUMO no usa almacenamiento local del navegador.',
                },
            ],
            'no-console': 'off',
        },
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },
);
