// ESLint configuration for Claude Code Remote
// Using flat config format (ESLint 9+)

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'build/**',
            'coverage/**',
            '.serena/**',
            'src/data/**'
        ]
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Node.js globals
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            // Errors
            'no-undef': 'error',
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-constant-condition': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',

            // Warnings
            'no-console': 'off', // Allow console in Node.js project
            'prefer-const': 'warn',
            'no-var': 'warn',

            // Style (off for now)
            'semi': 'off',
            'quotes': 'off',
            'indent': 'off'
        }
    }
];
