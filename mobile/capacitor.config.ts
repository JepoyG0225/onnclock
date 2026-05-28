/**
 * Capacitor config for OnClock employee mobile app.
 *
 * Loads the portal directly from production. Updates to the portal ship via
 * Vercel — no App Store re-review needed for web changes. The native shell
 * provides geolocation, camera, push notifications, and persistent session.
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.onclock.portal',
  appName: 'OnClock',
  webDir: 'www',
  server: {
    // Where the WebView loads on launch.
    // For production: replace with your real portal subdomain.
    // For local dev: point at `http://<your-mac-ip>:3000/portal` and add it to
    //   `allowNavigation`. Use HTTPS in production.
    url: 'https://portal.onclockph.com/portal',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow the WebView to navigate to these hosts. Anything else opens in Safari.
    allowNavigation: [
      'onclockph.com',
      '*.onclockph.com',
      'portal.onclockph.com',
      // Add other domains the portal calls (Supabase, third-party login, etc.)
    ],
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#1A2D42', // matches portal header for splash continuity
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1A2D42',
      iosSpinnerStyle: 'large',
      showSpinner: true,
    },
    Geolocation: {
      // No special config — usage strings live in Info.plist (set below)
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
}

export default config
