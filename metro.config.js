const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// expo-sqlite web ke liye wasm file chahiye
config.resolver.assetExts.push('wasm');
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  },
};
module.exports = config;
