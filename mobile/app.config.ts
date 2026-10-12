import type { ConfigContext, ExpoConfig } from 'expo/config';

// Set by EAS Build from the profile name in eas.json ("development" | "preview" | "production")
const profile = process.env.EAS_BUILD_PROFILE ?? 'development';
const isProduction = profile === 'production';

const BRAND_GREEN = '#1FA34A';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'MealMind',
  slug: 'mealmind',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mealmind',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.mealmind.app',
  },
  android: {
    package: 'com.mealmind.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: BRAND_GREEN,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // Only what the app actually uses; Play Console asks you to justify every permission
    permissions: ['CAMERA', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: BRAND_GREEN, image: './assets/images/splash-icon.png', imageWidth: 200 }],
    'expo-secure-store',
    '@react-native-community/datetimepicker',
    [
      'expo-image-picker',
      {
        cameraPermission: 'MealMind uses the camera to scan your fridge and grocery receipts.',
        photosPermission: 'MealMind needs your photos to scan fridge pictures and receipts.',
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: BRAND_GREEN }],
    [
      'expo-build-properties',
      {
        // Dev/preview builds talk to the API on your LAN over plain HTTP; production requires HTTPS
        android: { usesCleartextTraffic: !isProduction },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    eas: { projectId: '4d7dfd11-97e1-4bf1-8847-82c35a63b8ad' },
  },
});
