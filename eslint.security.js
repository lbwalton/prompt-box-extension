module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script'
  },
  plugins: [
    'security',
    'no-unsanitized'
  ],
  rules: {
    // Security plugin rules
    'security/detect-eval-with-expression': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-unsafe-regex': 'error',

    // No unsanitized DOM manipulation
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',

    // Built-in rules for security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error'
  },
  // Custom settings for no-unsanitized plugin
  settings: {
    'no-unsanitized': {
      taggedTemplates: {
        // Allow our escapeHTML function as a sanitizer
        escape: {
          properties: ['escapeHTML']
        }
      }
    }
  }
};
