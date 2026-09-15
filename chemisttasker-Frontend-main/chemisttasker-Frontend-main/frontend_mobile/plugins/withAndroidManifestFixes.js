const { withAndroidManifest } = require('@expo/config-plugins');

const TARGET_ACTIVITY =
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

function ensureToolsNamespace(manifest) {
  if (!manifest.$) {
    manifest.$ = {};
  }
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function getApplication(manifest) {
  if (!manifest.application || !manifest.application[0]) {
    return null;
  }
  return manifest.application[0];
}

function findOrCreateActivity(application, name) {
  if (!application.activity) {
    application.activity = [];
  }
  let activity = application.activity.find((item) => item?.$?.['android:name'] === name);
  if (!activity) {
    activity = { $: { 'android:name': name } };
    application.activity.push(activity);
  }
  if (!activity.$) {
    activity.$ = { 'android:name': name };
  }
  return activity;
}

function addToolsRemove(activity, value) {
  const existing = activity.$['tools:remove'] || '';
  const tokens = existing
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!tokens.includes(value)) {
    tokens.push(value);
  }
  activity.$['tools:remove'] = tokens.join(',');
}

module.exports = function withAndroidManifestFixes(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest) {
      return config;
    }

    ensureToolsNamespace(manifest);

    const application = getApplication(manifest);
    if (!application) {
      return config;
    }

    const activity = findOrCreateActivity(application, TARGET_ACTIVITY);
    delete activity.$['android:screenOrientation'];
    addToolsRemove(activity, 'android:screenOrientation');

    return config;
  });
};
