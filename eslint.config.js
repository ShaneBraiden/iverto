// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Build output, generated native projects, and the local-only folders
    // that .gitignore already keeps out of the repo (the k6 suite is not app code).
    ignores: ['dist/*', 'android/*', 'ios/*', 'Dev/*', 'Test/*', 'load-test/*'],
  },
]);
