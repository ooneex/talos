# @talosjs/payment

Payment and pricing type definitions with currency handling, product categorization, and billing metadata for e-commerce integrations.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Polar Integration** - Full Polar SDK integration for products, checkouts, customers, discounts, and analytics

✅ **Checkout Flow** - Create and retrieve checkout sessions with customer and discount support

✅ **Product Management** - Create, update, and archive products with pricing, benefits, and custom fields

✅ **Customer Management** - Create, update, list, and delete customers with billing address and metadata

✅ **Discount System** - Percentage and fixed discounts with duration, redemption limits, and product scoping

✅ **Subscription Support** - Plans, credits, and recurring billing with trial periods

✅ **Analytics** - Revenue, order, and subscription analytics with configurable time intervals

✅ **Customer Portal** - Create customer portal sessions for self-service account management

✅ **Type-Safe** - Comprehensive TypeScript types for all payment entities and API responses

## Installation

```bash
bun add @talosjs/payment
```

## Usage

### Creating a Checkout

```typescript
import { PolarCheckout } from '@talosjs/payment';

// Requires POLAR_ACCESS_TOKEN environment variable
const checkout = new PolarCheckout();

const session = await checkout.create({
  products: ['product-id-1'],
  customerEmail: 'user@example.com',
  successUrl: 'https://example.com/success',
  allowDiscountCodes: true,
});

console.log(session.url); // Redirect user to this URL
```

### Managing Products

```typescript
import { PolarProduct } from '@talosjs/payment';

const products = new PolarProduct();

// Create a product
const product = await products.create({
  name: 'Pro Plan',
  description: 'Full access to all features',
  recurringInterval: 'monthly',
  prices: [
    { type: 'fixed', priceCurrency: 'usd', priceAmount: 2900 },
  ],
});

// Update a product
await products.update('product-id', {
  name: 'Pro Plan (Updated)',
});

// Archive a product
await products.remove('product-id');
```

### Customer Management

```typescript
import { PolarCustomer } from '@talosjs/payment';

const customers = new PolarCustomer();

// Create a customer
const customer = await customers.create({
  email: 'user@example.com',
  name: 'John Doe',
  metadata: { plan: 'pro' },
});

// List customers
const result = await customers.list({
  query: 'john',
  limit: 20,
});
```

### Managing Discounts

```typescript
import { PolarDiscount } from '@talosjs/payment';

const discounts = new PolarDiscount();

// Create a percentage discount
const discount = await discounts.create({
  name: '20% Off',
  code: 'SAVE20',
  type: 'percentage',
  amount: 2000, // basis points (20%)
  duration: 'once',
});
```

### Revenue Analytics

```typescript
import { PolarAnalytics } from '@talosjs/payment';

const analytics = new PolarAnalytics();

const data = await analytics.get({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  interval: 'month',
});

for (const period of data.periods) {
  console.log(`${period.timestamp}: $${period.revenue / 100}`);
}
```

## API Reference

### Classes

#### `PolarCheckout`

Create and retrieve Polar checkout sessions.

**Methods:**
- `create(data: CheckoutCreateType): Promise<CheckoutType>` - Create a checkout session
- `get(id: string): Promise<CheckoutType>` - Retrieve a checkout by ID

#### `PolarProduct`

Manage products via the Polar API.

**Methods:**
- `create(data: IProduct): Promise<Omit<IProduct, 'id'>>` - Create a product
- `update(id: string, data: Partial<IProduct>): Promise<Omit<IProduct, 'id'>>` - Update a product
- `remove(id: string): Promise<void>` - Archive a product

#### `PolarCustomer`

Manage customers via the Polar API.

**Methods:**
- `create(data: CustomerCreateType): Promise<CustomerType>` - Create a customer
- `update(id: string, data: CustomerUpdateType): Promise<CustomerType>` - Update a customer
- `get(id: string): Promise<CustomerType>` - Get a customer by ID
- `list(options?: CustomerListOptionsType): Promise<CustomerListResultType>` - List customers
- `remove(id: string): Promise<void>` - Delete a customer

#### `PolarCustomerPortal`

Create customer portal sessions for self-service management.

#### `PolarDiscount`

Create and manage discounts.

#### `PolarAnalytics`

Retrieve revenue and order analytics.

### Key Types

#### `IProduct`

Product interface with name, description, prices, benefits, recurring interval, and metadata.

#### `CheckoutCreateType`

Checkout creation options including products, customer info, discount, and success URL.

#### `IDiscount`

Discount interface with type (percentage/fixed), duration, amount, and redemption limits.

#### `ISubscription`

Subscription interface with plans, credits, discounts, and billing dates.

### Enums

| Enum | Values |
|------|--------|
| `EPriceType` | `FIXED`, `CUSTOM`, `FREE` |
| `EDiscountType` | `PERCENTAGE`, `FIXED` |
| `EDiscountDuration` | `ONCE`, `REPEATING`, `FOREVER` |
| `ESubscriptionPeriod` | `MONTHLY`, `YEARLY`, `WEEKLY`, `DAILY` |
| `EBenefitType` | `CREDITS`, `LICENSE_KEYS`, `FILE_DOWNLOADS`, `GITHUB_REPOSITORY_ACCESS`, `DISCORD_ACCESS`, `CUSTOM` |
| `ECheckoutStatus` | `OPEN`, `EXPIRED`, `CONFIRMED`, `SUCCEEDED`, `FAILED` |
| `EAnalyticsInterval` | `YEAR`, `MONTH`, `WEEK`, `DAY`, `HOUR` |

## Environment Variables

- `POLAR_ACCESS_TOKEN` - Polar API access token (required)
- `POLAR_ENVIRONMENT` - `"sandbox"` or `"production"` (default: `"production"`)

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
