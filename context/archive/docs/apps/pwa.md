# IronScout PWA Setup

This document explains the Progressive Web App (PWA) configuration for IronScout.

## Approach

We use **native browser APIs** without any third-party PWA libraries. This means:
- No deprecated dependencies
- Full control over caching behavior
- Simpler maintenance
- Works with any Next.js version

## What's Included

### Core PWA Files
- `public/manifest.json` - Web app manifest with app metadata, icons, shortcuts
- `public/sw.js` - Custom service worker (network-first with offline fallback)
- `public/offline.html` - Offline fallback page
- `public/favicon.svg` - Vector favicon
- `public/icons/` - App icons in various sizes

### Configuration
- `app/layout.tsx` - PWA meta tags, manifest link, Apple-specific tags
- `app/globals.css` - Mobile/PWA-specific CSS utilities (safe areas, touch feedback)
- `lib/service-worker.tsx` - Service worker registration hook

### Components
- `components/pwa/install-prompt.tsx` - Custom install prompt for all platforms

## Features

1. **Installable** - Users can add to home screen on iOS, Android, and desktop
2. **Offline Support** - Shows offline page when disconnected, caches visited pages
3. **Push-Ready** - Service worker is configured for push notifications
4. **Safe Areas** - Proper support for notched devices (iPhone X+)
5. **No Dependencies** - Zero third-party PWA packages

## Service Worker Strategy

The service worker uses a **Network-First** strategy:

1. Try to fetch from network
2. If successful, cache the response
3. If network fails, serve from cache
4. If not in cache, show offline page (for navigation) or error

This ensures users always get fresh content when online, but can still use the app offline.

## Required Assets

Before production, create these assets:

### App Icons (PNG)
Place in `public/icons/`:
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

**Tip**: Use https://realfavicongenerator.net/ to generate all sizes from a single source.

### Splash Screens (Optional, for iOS)
Place in `public/splash/`:
- apple-splash-2048-2732.png (iPad Pro 12.9")
- apple-splash-1170-2532.png (iPhone 14 Pro)
- apple-splash-1125-2436.png (iPhone X/XS/11 Pro)

**Tip**: Use https://appsco.pe/developer/splash-screens to generate all sizes.

## Development vs Production

- **Development**: Service worker is NOT registered (to avoid caching issues)
- **Production**: Service worker registers automatically

To test PWA features:
```bash
pnpm build
pnpm start
# Open http://localhost:3000 and check DevTools > Application > Service Workers
```

## Testing Checklist

- [ ] Install prompt appears on mobile browsers
- [ ] iOS "Add to Home Screen" instructions show correctly  
- [ ] App opens in standalone mode after install
- [ ] Offline page shows when disconnected
- [ ] App icons display correctly on home screen
- [ ] Safe areas work on notched devices
- [ ] Service worker caches pages after visiting

## Lighthouse PWA Checklist

Run Lighthouse audit in Chrome DevTools:

- [ ] Installable
- [ ] Has valid manifest
- [ ] Service worker registered
- [ ] Works offline
- [ ] HTTPS (required for service workers)
- [ ] Viewport configured correctly
- [ ] Apple touch icon present

## Customizing the Service Worker

Edit `public/sw.js` to:

- **Add precached assets**: Update `PRECACHE_ASSETS` array
- **Change cache strategy**: Modify the fetch handler
- **Add push notification handling**: The handlers are already in place
- **Implement background sync**: Use the `sync` event handler

## Updating the Service Worker

When you update `sw.js`:

1. The browser detects the change
2. New service worker installs in background
3. Old service worker continues until all tabs close
4. New service worker activates on next visit

To force immediate update, the SW includes `skipWaiting()` on install.

## Troubleshooting

**Service worker not registering:**
- Check you're on HTTPS (or localhost)
- Check browser console for errors
- Verify `sw.js` is accessible at `/sw.js`

**Caching issues in development:**
- Service worker only registers in production
- Clear Application > Storage in DevTools
- Use incognito window for testing

**Install prompt not showing:**
- Must be served over HTTPS
- Must have valid manifest.json
- Must have registered service worker
- User must have engaged with site (not first visit)
