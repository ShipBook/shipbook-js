const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const projectRoot = __dirname;
const monorepoRoot = path.resolve(__dirname, '../..');

// Watch the monorepo packages for changes
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/core'),
  path.resolve(monorepoRoot, 'packages/react-native'),
];

// Enable symlink resolution
config.resolver.unstable_enableSymlinks = true;

// Resolve node_modules from project root and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve @shipbook packages to monorepo
config.resolver.extraNodeModules = {
  '@shipbook/core': path.resolve(monorepoRoot, 'packages/core'),
  '@shipbook/react-native': path.resolve(monorepoRoot, 'packages/react-native'),
};

module.exports = config;
