/**
 * Cloudflare Worker configuration.
 * Set EXPO_PUBLIC_WORKER_NOTIFICATION_URL in your .env file to the deployed
 * worker URL (e.g. https://notifications.your-subdomain.workers.dev).
 */
export const WORKER_NOTIFICATION_URL = process.env
  .EXPO_PUBLIC_WORKER_NOTIFICATION_URL as string;

/**
 * OTP Worker configuration.
 * Set EXPO_PUBLIC_OTP_WORKER_URL in your .env file to the deployed
 * worker URL (e.g. https://otp-worker.your-subdomain.workers.dev).
 */
export const OTP_WORKER_URL = process.env.EXPO_PUBLIC_OTP_WORKER_URL as string;
