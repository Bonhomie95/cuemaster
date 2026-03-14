const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@colyseus/httpie') {
    return {
      filePath: require.resolve('@colyseus/httpie/browser'),
      type: 'sourceFile',
    };
  }

  if (moduleName === 'ws') {
    return {
      filePath: path.resolve(__dirname, 'ws-shim.js'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
