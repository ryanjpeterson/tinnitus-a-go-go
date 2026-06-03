#!/usr/bin/env node
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const iconsDir = path.join(publicDir, "icons");

// SVG source with larger viewBox for better quality
const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0B0B0C"/>
  <g transform="translate(131.2, 83.2) scale(6.144)">
    <path fill="#f87171" stroke="#fff" stroke-miterlimit="10" stroke-width="2" d="M11.2,1.2l1.4.5,1.4-.5,1.4.9,1.9-.5,2.4.5,2.4-.5c1.7,1,3.9,1.8,6.5,2.4l5.2-1.4c.4,0,.8.1,1.2.1.9,0,1.7-.2,2.6-.6.5.7,1.3,1.3,2.3,1.9l-.9,3.8c-1.1-.4-2.1-.7-3.1-.7-1.8,0-3.6.7-5.3,2-.4,0-.9-.1-1.3-.1-1.5,0-2.9.5-4.3,1.6,0,3.3-1.3,6.2-3.8,8.9.9,1.3,1.5,2.9,1.8,4.7-.7,1.8-1,3.8-1,6s.2,3.4.5,5.2c-1.1,1.9-1.6,3.9-1.6,6.1s.2,2.8.7,4.3c-3.3.7-5.4,2.6-6.1,5.6-1.3,0-2.7-.4-4.3-.9.4-1.5.6-3.2.6-5s-.2-3.7-.6-5.8c.6-1,.8-2.1.8-3.1s-.1-1.4-.4-2l.9-1.9-2.3-2.9c.3-1.2.4-2.4.4-3.7,0-2.3-.4-4.7-1.3-7.2,0-.4.1-.9.1-1.4s0-.9-.1-1.4v-5.2c-1.7-1-3.8-1.7-6.2-2.3l-1.4-.5c-.5-1.1-.7-2.2-.7-3.4s.2-2.4.7-3.7h9.4v.2Z"/>
  </g>
</svg>`;

const sizes = [
  // PWA manifest icons
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  // iOS touch icons
  { name: "apple-touch-icon-152.png", size: 152 },
  { name: "apple-touch-icon-167.png", size: 167 },
  { name: "apple-touch-icon-180.png", size: 180 },
];

// iOS splash screens (centered logo on dark background)
const splashScreens = [
  { name: "splash-1170x2532.png", width: 1170, height: 2532 },
  { name: "splash-1284x2778.png", width: 1284, height: 2778 },
  { name: "splash-1179x2556.png", width: 1179, height: 2556 },
];

async function generateIcons() {
  console.log("Generating PWA icons...");

  const svgBuffer = Buffer.from(svgSource);

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, name));
    console.log(`  ✓ ${name}`);
  }

  console.log("\nGenerating iOS splash screens...");

  for (const { name, width, height } of splashScreens) {
    const logoSize = Math.min(width, height) * 0.25;
    const logo = await sharp(svgBuffer)
      .resize(Math.round(logoSize), Math.round(logoSize))
      .png()
      .toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 11, g: 11, b: 12, alpha: 1 },
      },
    })
      .composite([
        {
          input: logo,
          top: Math.round((height - logoSize) / 2),
          left: Math.round((width - logoSize) / 2),
        },
      ])
      .png()
      .toFile(path.join(iconsDir, name));
    console.log(`  ✓ ${name}`);
  }

  console.log("\nDone!");
}

generateIcons().catch(console.error);
