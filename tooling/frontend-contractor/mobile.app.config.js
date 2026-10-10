// CONTRACTOR-ONLY app config. This file is never synced back to the owner monorepo.
// Production EAS OTA updates, Firebase project and official bundle IDs are deliberately disabled.
module.exports = ({ config }) => {
  const mobilePlugins = (config.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== '@react-native-firebase/app' && name !== '@react-native-firebase/crashlytics';
  });
  const ios = { ...config.ios };
  const android = { ...config.android };
  const extra = { ...config.extra };
  delete ios.googleServicesFile;
  delete android.googleServicesFile;
  delete extra.eas;
  return {
    ...config,
    name: 'ChemistTasker (Contractor)',
    slug: 'chemisttasker-contractor',
    ios: { ...ios, bundleIdentifier: 'com.chemisttasker.contractor' },
    android: { ...android, package: 'com.chemisttasker.contractor' },
    plugins: mobilePlugins,
    updates: { enabled: false, checkAutomatically: 'NEVER' },
    extra,
  };
};
