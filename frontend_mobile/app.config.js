const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

const buildProfile = process.env.EAS_BUILD_PROFILE || '';
const envFileName = ['production', 'production-apk'].includes(buildProfile)
  ? 'mobile.prod.env'
  : 'mobile.dev.env';

loadEnvFile(path.resolve(__dirname, '..', 'env', envFileName));

module.exports = ({ config }) => {
  const baseConfig = config || appJson.expo || {};

  const androidMapsApiKey =
    process.env.EXPO_PUBLIC_ANDROID_PLACES ||
    process.env.EXPO_PUBLIC_PLACES_KEY ||
    process.env.EXPO_PUBLIC_MAPS_API_KEY ||
    '';

  const iosMapsApiKey =
    process.env.EXPO_PUBLIC_IOS_PLACES ||
    process.env.EXPO_PUBLIC_PLACES_KEY ||
    process.env.EXPO_PUBLIC_MAPS_API_KEY ||
    '';

  return {
    ...baseConfig,
    android: {
      ...(baseConfig.android || {}),
      config: {
        ...((baseConfig.android && baseConfig.android.config) || {}),
        googleMaps: {
          ...((((baseConfig.android || {}).config || {}).googleMaps) || {}),
          apiKey: androidMapsApiKey,
        },
      },
    },
    ios: {
      ...(baseConfig.ios || {}),
      config: {
        ...((baseConfig.ios && baseConfig.ios.config) || {}),
        googleMapsApiKey: iosMapsApiKey,
      },
    },
  };
};
