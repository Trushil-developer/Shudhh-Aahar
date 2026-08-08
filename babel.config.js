// Loads .env.<SHUDDHAAHAR_ENV>[.local] (the .local file, if present, overrides
// the checked-in base file — same convention the .env.* files already use)
// into process.env, then inlines process.env.X references at build time so
// src/config/environment.ts's process.env reads actually resolve to real
// values in the bundle instead of always being undefined.
require('dotenv-flow').config({
  node_env: process.env.SHUDDHAAHAR_ENV || 'development',
});

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-environment-variables'],
};
