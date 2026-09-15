# ChemistTasker Shared Core

Shared TypeScript package containing API client, types, and domain logic for ChemistTasker web and mobile apps.

## Installation

```bash
npm install @chemisttasker/shared-core
```

## Setup

Configure the API client before use:

```typescript
import { configureApi } from '@chemisttasker/shared-core';

configureApi({
  baseURL: process.env.API_URL,
  getToken: async () => {
    // Platform-specific token retrieval
    return yourTokenStore.getToken();
  },
});
```

### Environment Variables

- **Web**: `VITE_API_URL`
- **Mobile**: `EXPO_PUBLIC_API_URL`

## Package Structure

```
src/
├── api.ts          - API endpoint functions
├── types.ts        - TypeScript interfaces
├── domain.ts       - Business logic helpers
└── constants/      - Constant values
    ├── endpoints.ts
    ├── roles.ts
    ├── capabilities.ts
    └── colors.ts
```

## Usage

```typescript
// Import types
import type { Pharmacy, Shift } from '@chemisttasker/shared-core/types';

// Import API functions
import { getPharmacies, createShift } from '@chemisttasker/shared-core';

// Import domain helpers
import { formatPharmacyAddress, calculateShiftPay } from '@chemisttasker/shared-core/domain';

// Import constants
import { ROSTER_COLORS, ORG_ROLES } from '@chemisttasker/shared-core/constants';

// Use in your code
const pharmacies = await getPharmacies();
const address = formatPharmacyAddress(pharmacies[0]);
```

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Watch mode
npm run dev

# Run tests
npm test
```
