import type { ConfigContext, ExpoConfig } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'EMS Food (Dev)' : 'EMS Food',
  slug: 'ems-food',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'emsfood',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: IS_DEV ? 'com.emscompany.emsfood.dev' : 'com.emscompany.emsfood',
    supportsTablet: true,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        'EMS Food uses your photo library to upload restaurant, menu and food photos.',
      NSCameraUsageDescription: 'EMS Food uses the camera to photograph restaurant menus for import.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: IS_DEV ? 'com.emscompany.emsfood.dev' : 'com.emscompany.emsfood',
    adaptiveIcon: {
      backgroundColor: '#0B1736',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Provide google-services.json (Firebase) for Android push notifications. See docs/deployment.md.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
    name: 'EMS Food Admin',
    themeColor: '#0B1736',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B1736',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
      },
    ],
    'expo-secure-store',
    'expo-localization',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#185ADB',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'EMS Food uses your photo library to upload restaurant, menu and food photos.',
        cameraPermission: 'EMS Food uses the camera to photograph restaurant menus for import.',
      },
    ],
    'expo-font',
    'expo-sharing',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
