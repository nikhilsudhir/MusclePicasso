const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Support .glb binary assets
config.resolver.assetExts.push('glb', 'gltf', 'bin')

module.exports = config
