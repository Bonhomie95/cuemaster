const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
// Three r186's CJS shim calls Node-only process.emitWarning. R3F's native
// entry uses require('three'), so resolve both entry styles to one ESM instance.
const threeModule = path.join(
  path.dirname(require.resolve("three")),
  "three.module.js",
);
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === "three") return { type: "sourceFile", filePath: threeModule };
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
