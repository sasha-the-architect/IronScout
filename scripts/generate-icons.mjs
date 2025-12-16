#!/usr/bin/env node
/**
 * Generate PNG icons from SVG source files for all IronScout apps
 *
 * Usage:
 *   node scripts/generate-icons.mjs           # Generate all icons
 *   node scripts/generate-icons.mjs --web     # Web app only
 *   node scripts/generate-icons.mjs --admin   # Admin portal only
 *   node scripts/generate-icons.mjs --dealer  # Dealer portal only
 *
 * Source SVGs should be placed in apps/{app}/public/:
 *   - logo-dark.svg   (icon for dark backgrounds / PWA)
 *   - logo-light.svg  (icon for light backgrounds)
 *
 * Generated files:
 *   - icons/icon-{size}x{size}.png (PWA icons)
 *   - favicon.png (32x32 favicon)
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Configuration
const CONFIG = {
  web: {
    name: 'Web App',
    publicDir: join(rootDir, 'apps', 'web', 'public'),
    svgSource: 'logo-dark.svg',
    backgroundColor: '#121418', // Deep Ops Black
    sizes: [16, 32, 72, 96, 128, 144, 152, 192, 384, 512],
    generateFavicon: true,
  },
  admin: {
    name: 'Admin Portal',
    publicDir: join(rootDir, 'apps', 'admin', 'public'),
    svgSource: 'logo-dark.svg',
    backgroundColor: '#121418',
    sizes: [16, 32, 192, 512],
    generateFavicon: true,
  },
  dealer: {
    name: 'Dealer Portal',
    publicDir: join(rootDir, 'apps', 'dealer', 'public'),
    svgSource: 'logo-dark.svg',
    backgroundColor: '#121418',
    sizes: [16, 32, 192, 512],
    generateFavicon: true,
  },
};

// Color palette reference (from globals.css)
const COLORS = {
  // Light mode
  light: {
    background: '#F8F9FA',    // Off-White Fog
    foreground: '#343A40',    // Gunmetal
    primary: '#4B5F44',       // Modern Olive Drab
    secondary: '#005691',     // Reliant Blue
    accent: '#F15A29',        // Signal Orange
  },
  // Dark mode
  dark: {
    background: '#121418',    // Deep Ops Black
    foreground: '#DCE3E8',    // Vapor Grey
    primary: '#00C2CB',       // Tactical Cyan
    secondary: '#2C333A',     // Slate Armor
    accent: '#00C2CB',        // Tactical Cyan
  },
};

async function generateIconsForApp(appKey, config) {
  const { name, publicDir, svgSource, backgroundColor, sizes, generateFavicon } = config;
  const iconsDir = join(publicDir, 'icons');

  // Check if source SVG exists
  const svgPath = join(publicDir, svgSource);
  if (!existsSync(svgPath)) {
    console.log(`  ⚠️  Skipping ${name}: ${svgSource} not found at ${svgPath}`);
    return false;
  }

  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  console.log(`\n📦 ${name}`);
  console.log(`   Source: ${svgSource}`);
  console.log(`   Background: ${backgroundColor}`);

  const svgBuffer = readFileSync(svgPath);

  // Generate PWA icons
  for (const size of sizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: backgroundColor,
      })
      .flatten({ background: backgroundColor })
      .png()
      .toFile(outputPath);

    console.log(`   ✓ icon-${size}x${size}.png`);
  }

  // Generate favicon.png
  if (generateFavicon) {
    const faviconPath = join(publicDir, 'favicon.png');
    await sharp(svgBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: backgroundColor,
      })
      .flatten({ background: backgroundColor })
      .png()
      .toFile(faviconPath);

    console.log(`   ✓ favicon.png`);
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);

  // Determine which apps to process
  let appsToProcess = Object.keys(CONFIG);

  if (args.includes('--web')) {
    appsToProcess = ['web'];
  } else if (args.includes('--admin')) {
    appsToProcess = ['admin'];
  } else if (args.includes('--dealer')) {
    appsToProcess = ['dealer'];
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
IronScout Icon Generator

Usage:
  node scripts/generate-icons.mjs           # Generate all icons
  node scripts/generate-icons.mjs --web     # Web app only
  node scripts/generate-icons.mjs --admin   # Admin portal only
  node scripts/generate-icons.mjs --dealer  # Dealer portal only

Source SVGs should be placed in apps/{app}/public/:
  - logo-dark.svg   (used for PWA icons)
  - logo-light.svg  (optional, for light backgrounds)

Color Palette:
  Light Mode:
    Background: ${COLORS.light.background} (Off-White Fog)
    Primary:    ${COLORS.light.primary} (Modern Olive Drab)
    Secondary:  ${COLORS.light.secondary} (Reliant Blue)
    Accent:     ${COLORS.light.accent} (Signal Orange)

  Dark Mode:
    Background: ${COLORS.dark.background} (Deep Ops Black)
    Primary:    ${COLORS.dark.primary} (Tactical Cyan)
    Secondary:  ${COLORS.dark.secondary} (Slate Armor)
`);
    process.exit(0);
  }

  console.log('🎨 IronScout Icon Generator');
  console.log('═══════════════════════════');

  let successCount = 0;
  let skipCount = 0;

  for (const appKey of appsToProcess) {
    const config = CONFIG[appKey];
    const success = await generateIconsForApp(appKey, config);
    if (success) {
      successCount++;
    } else {
      skipCount++;
    }
  }

  console.log('\n═══════════════════════════');
  if (successCount > 0) {
    console.log(`✅ Generated icons for ${successCount} app(s)`);
  }
  if (skipCount > 0) {
    console.log(`⚠️  Skipped ${skipCount} app(s) (missing source SVG)`);
  }

  console.log('\n📝 To update icons:');
  console.log('   1. Edit the SVG files in apps/{app}/public/');
  console.log('   2. Run: node scripts/generate-icons.mjs');
  console.log('   3. Commit the generated PNG files');
}

main().catch(console.error);
