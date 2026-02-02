# @relay/ui

Cross-platform UI component library for Relay applications.

## Overview

This package provides shared design tokens, components, and icons for use across all Relay client platforms:

- **Extension** (Chrome/Firefox/Edge) - Preact + Tailwind CSS
- **Web App** - React + Tailwind CSS  
- **Mobile** - React Native + NativeWind
- **Desktop** - Electron + Tailwind CSS

## Package Structure

```
ui/
├── tokens/          # Design tokens (colors, spacing, typography)
├── icons/           # SVG icon components
├── components/      # Shared UI components (future)
└── package.json
```

## Design Tokens

All brand colors, spacing, typography, and other design tokens are defined in `tokens/` for consistency across platforms.

### Brand Colors

- **Relay Purple** (`#8B5CF6`) - Primary brand color
- **Relay Cyan** (`#22D3EE`) - Accent color
- **Relay Emerald** (`#10B981`) - Success/active states
- **Relay Navy** (`#0B1020`) - Dark backgrounds

### Usage

```typescript
import { colors, spacing, typography } from '@relay/ui/tokens';
```

## Icons

Icon components are provided as both web (SVG) and React Native compatible formats:

```typescript
import { RelayLogo, InboxIcon, EdgeIcon } from '@relay/ui/icons';
```

## Development

```bash
npm install
npm run dev   # Watch mode for development
npm run build # Build for production
```

## Cross-Platform Strategy

- **Web/Extension**: Use Tailwind utility classes directly
- **Mobile**: Use NativeWind with identical className API
- **Components**: Shared logic, platform-specific rendering when needed
