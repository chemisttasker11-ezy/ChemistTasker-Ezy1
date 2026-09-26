const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const sharedCoreRoot = path.resolve(projectRoot, '..', 'shared-core');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedCoreRoot];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@chemisttasker/shared-core': sharedCoreRoot,
};

module.exports = config;
