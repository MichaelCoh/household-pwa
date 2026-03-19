#!/bin/bash
# Run this to generate placeholder icons
# In production, replace with real icons

# Create simple SVG icon
cat > /tmp/icon.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#5B6AF0"/>
  <text x="256" y="340" font-size="280" text-anchor="middle" fill="white">🏠</text>
</svg>
EOF

echo "Replace public/icon-192.png and public/icon-512.png with real icons"
echo "You can use https://realfavicongenerator.net/ to generate them"
