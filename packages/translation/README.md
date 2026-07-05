# @talosjs/translation

Internationalization framework with locale management, translation key resolution, and pluralization support for multi-language applications.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multi-Language Support** - 31 supported locales including Arabic, Chinese, French, Spanish, and more

✅ **Type-Safe Locales** - `LocaleType` union type and `LocaleInfoType` with region data

✅ **Locale Constants** - Readonly `locales` array of all supported locale codes

✅ **Error Handling** - Custom `TranslationException` for missing or invalid translations

✅ **Cross-Platform** - Works in Browser, Node.js, Bun, and Deno

## Installation

```bash
bun add @talosjs/translation
```

## Usage

### Basic Usage

```typescript
import { trans } from '@talosjs/translation';

// Using dictionary with string keys
const dictionary = {
  greeting: {
    en: 'Hello, World!',
    fr: 'Bonjour, le monde!',
    es: 'Hola, mundo!'
  }
};

// Get English translation (default)
const english = trans('greeting', { dict: dictionary });
console.log(english); // "Hello, World!"

// Get French translation
const french = trans('greeting', {
  lang: 'fr',
  dict: dictionary
});
console.log(french); // "Bonjour, le monde!"

// Using direct translation objects
const directTranslation = {
  en: 'Welcome',
  fr: 'Bienvenue',
  es: 'Bienvenido'
};

const welcome = trans(directTranslation, { lang: 'fr' });
console.log(welcome); // "Bienvenue"
```

### Parameter Interpolation

```typescript
import { trans } from '@talosjs/translation';

const dictionary = {
  welcome: {
    en: 'Welcome, {{ name }}!',
    fr: 'Bienvenue, {{ name }}!',
    es: '¡Bienvenido, {{ name }}!'
  },
  userInfo: {
    en: 'User {{ name }} has {{ count }} points',
    fr: 'L\'utilisateur {{ name }} a {{ count }} points'
  }
};

// Single parameter
const greeting = trans('welcome', {
  lang: 'en',
  dict: dictionary,
  params: { name: 'John' }
});
console.log(greeting); // "Welcome, John!"

// Multiple parameters
const info = trans('userInfo', {
  lang: 'en',
  dict: dictionary,
  params: { name: 'Alice', count: 150 }
});
console.log(info); // "User Alice has 150 points"

// Different parameter types
const stats = trans('stats', {
  dict: {
    stats: {
      en: 'Active: {{ active }}, Score: {{ score }}, ID: {{ id }}'
    }
  },
  params: {
    active: true,
    score: 95.5,
    id: 12345
  }
});
console.log(stats); // "Active: true, Score: 95.5, ID: 12345"
```

### Pluralization

```typescript
import { trans } from '@talosjs/translation';

const dictionary = {
  item: {
    en: '{{ count }} item',
    fr: '{{ count }} élément'
  },
  item_plural: {
    en: '{{ count }} items',
    fr: '{{ count }} éléments'
  },
  message: {
    en: '{{ count }} message',
    fr: '{{ count }} message'
  },
  message_plural: {
    en: '{{ count }} messages',
    fr: '{{ count }} messages'
  },
  message_zero: {
    en: 'No messages',
    fr: 'Aucun message'
  }
};

// Singular form (count = 1)
const singular = trans('item', {
  lang: 'en',
  dict: dictionary,
  count: 1
});
console.log(singular); // "1 item"

// Plural form (count > 1)
const plural = trans('item', {
  lang: 'en',
  dict: dictionary,
  count: 5
});
console.log(plural); // "5 items"

// Zero form (count = 0, when available)
const zero = trans('message', {
  lang: 'en',
  dict: dictionary,
  count: 0
});
console.log(zero); // "No messages"

// Zero form fallback to plural (when zero form not available)
const zeroFallback = trans('item', {
  lang: 'en',
  dict: dictionary,
  count: 0
});
console.log(zeroFallback); // "0 items"
```

### Nested Keys

```typescript
import { trans } from '@talosjs/translation';

const dictionary = {
  user: {
    profile: {
      name: {
        en: 'Full Name',
        fr: 'Nom complet',
        es: 'Nombre completo'
      },
      email: {
        en: 'Email Address',
        fr: 'Adresse e-mail'
      }
    }
  },
  app: {
    navigation: {
      home: {
        en: 'Home',
        fr: 'Accueil'
      },
      about: {
        en: 'About',
        fr: 'À propos'
      }
    }
  }
};

// Access nested keys with dot notation
const profileName = trans('user.profile.name', {
  lang: 'fr',
  dict: dictionary
});
console.log(profileName); // "Nom complet"

const homeNav = trans('app.navigation.home', {
  lang: 'en',
  dict: dictionary
});
console.log(homeNav); // "Home"
```

### Advanced Usage

```typescript
import { trans, locales, TranslationException } from '@talosjs/translation';

// Check supported locales
console.log(locales); // ['ar', 'bg', 'cs', 'da', 'de', 'el', 'en', ...]

// Error handling
try {
  const result = trans('nonexistent.key', {
    dict: {},
    lang: 'en'
  });
} catch (error) {
  if (error instanceof TranslationException) {
    console.log('Translation not found:', error.message);
  }
}

// Complex real-world example
const appDictionary = {
  notifications: {
    unread: {
      en: 'You have {{ count }} unread notification',
      fr: 'Vous avez {{ count }} notification non lue'
    },
    unread_plural: {
      en: 'You have {{ count }} unread notifications',
      fr: 'Vous avez {{ count }} notifications non lues'
    },
    unread_zero: {
      en: 'No unread notifications',
      fr: 'Aucune notification non lue'
    }
  },
  validation: {
    required: {
      en: 'The {{ field }} field is required',
      fr: 'Le champ {{ field }} est requis'
    },
    minLength: {
      en: 'The {{ field }} must be at least {{ min }} characters',
      fr: 'Le {{ field }} doit contenir au moins {{ min }} caractères'
    }
  }
};

// Notification with pluralization
const notification = trans('notifications.unread', {
  lang: 'en',
  dict: appDictionary,
  count: 3
});
console.log(notification); // "You have 3 unread notifications"

// Form validation with parameters
const validation = trans('validation.minLength', {
  lang: 'fr',
  dict: appDictionary,
  params: { field: 'mot de passe', min: 8 }
});
console.log(validation); // "Le mot de passe doit contenir au moins 8 caractères"
```

## API Reference

### `trans<T extends string>(key, options?): T`

The main translation function that handles all translation scenarios.

**Parameters:**
- `key`: `string | Record<LocaleType, string>` - Translation key (dot notation supported) or direct translation object
- `options?`: `Object` - Translation options
  - `lang?`: `LocaleType` - Target language (defaults to 'en')
  - `params?`: `Record<string, boolean | number | bigint | string>` - Parameters for interpolation
  - `dict?`: `Record<string, unknown>` - Translation dictionary (required when using string keys)
  - `count?`: `number` - Count for pluralization

**Returns:** Translated string

**Example:**
```typescript
// String key with dictionary
trans('greeting', { lang: 'fr', dict: dictionary });

// Direct translation object
trans({ en: 'Hello', fr: 'Bonjour' }, { lang: 'fr' });

// With parameters
trans('welcome', {
  dict: dictionary,
  params: { name: 'John' }
});

// With pluralization
trans('item', {
  dict: dictionary,
  count: 5
});
```

### Types

#### `LocaleType`
TypeScript type representing all supported locale codes.

**Supported locales:**
```typescript
type LocaleType = 'ar' | 'bg' | 'cs' | 'da' | 'de' | 'el' | 'en' | 'eo' | 'es' | 'et' | 'eu' | 'fi' | 'fr' | 'hu' | 'hy' | 'it' | 'ja' | 'ko' | 'lt' | 'nl' | 'no' | 'pl' | 'pt' | 'ro' | 'ru' | 'sk' | 'sv' | 'th' | 'uk' | 'zh' | 'zh-tw';
```

#### `LocaleInfoType`
Type for locale information including region data.

```typescript
type LocaleInfoType = {
  code: LocaleType;
  region: string | null;
};
```

### Constants

#### `locales`
Array of all supported locale codes.

```typescript
const locales: readonly LocaleType[];
```

### Exceptions

#### `TranslationException`
Custom exception thrown when translations are not found or invalid.

**Properties:**
- Extends base `Exception` class
- HTTP status: 404 (Not Found)
- Includes translation key and context information

**Example:**
```typescript
try {
  trans('missing.key', { dict: {} });
} catch (error) {
  if (error instanceof TranslationException) {
    console.log(error.message); // "Translation key 'missing.key' not found"
  }
}
```

## Translation Dictionary Structure

### Basic Structure
```typescript
const dictionary = {
  keyName: {
    en: 'English translation',
    fr: 'French translation',
    es: 'Spanish translation'
    // ... other locales
  }
};
```

### Nested Structure
```typescript
const dictionary = {
  section: {
    subsection: {
      keyName: {
        en: 'English translation',
        fr: 'French translation'
      }
    }
  }
};
```

### Pluralization Structure
```typescript
const dictionary = {
  // Singular form (count = 1)
  item: {
    en: '{{ count }} item',
    fr: '{{ count }} élément'
  },
  // Plural form (count != 1, except 0 if zero form exists)
  item_plural: {
    en: '{{ count }} items',
    fr: '{{ count }} éléments'
  },
  // Zero form (count = 0, optional)
  item_zero: {
    en: 'No items',
    fr: 'Aucun élément'
  }
};
```

## Pluralization Rules

1. **count = 1**: Uses the base key (singular form)
2. **count = 0**: Uses `key_zero` if available, otherwise falls back to `key_plural`
3. **count > 1 or count < 0**: Uses `key_plural`
4. **Fallback**: If plural forms don't exist, falls back to singular form

## Fallback Strategy

1. **Language fallback**: If requested language not available, falls back to English ('en')
2. **Key fallback**: If translation key not found, returns the key itself
3. **Pluralization fallback**: If plural forms don't exist, uses singular form
4. **Empty translation**: Throws `TranslationException` for empty translations

## Best Practices

### 1. Organize Dictionary Structure
```typescript
// Good: Organized by feature/section
const dictionary = {
  auth: {
    login: { en: 'Log In', fr: 'Se connecter' },
    logout: { en: 'Log Out', fr: 'Se déconnecter' }
  },
  navigation: {
    home: { en: 'Home', fr: 'Accueil' },
    about: { en: 'About', fr: 'À propos' }
  }
};
```

### 2. Use Consistent Parameter Names
```typescript
// Good: Consistent naming
const dictionary = {
  welcome: { en: 'Welcome, {{ username }}!' },
  goodbye: { en: 'Goodbye, {{ username }}!' }
};
```

### 3. Handle Pluralization Properly
```typescript
// Good: Complete pluralization support
const dictionary = {
  notification: { en: '{{ count }} notification' },
  notification_plural: { en: '{{ count }} notifications' },
  notification_zero: { en: 'No notifications' }
};
```

### 4. Provide Fallbacks
```typescript
// Good: Always include English translations
const dictionary = {
  greeting: {
    en: 'Hello',
    fr: 'Bonjour',
    es: 'Hola'
    // en is always available as fallback
  }
};
```

## Error Handling

The package throws `TranslationException` in the following cases:

- Translation key not found in dictionary
- Nested key path doesn't exist
- Translation value is empty
- String key used without dictionary

```typescript
try {
  const result = trans('missing.key', { dict: dictionary });
} catch (error) {
  if (error instanceof TranslationException) {
    // Handle translation error
    console.warn('Translation missing:', error.message);
    // Provide fallback or default value
    return 'Fallback text';
  }
}
```

## Performance Considerations

- **Dictionary Caching**: Cache translation dictionaries to avoid repeated parsing
- **Lazy Loading**: Load only required translations for better performance
- **Nested Key Optimization**: Avoid deeply nested structures when possible
- **Parameter Validation**: Validate parameters before passing to avoid runtime errors

## Real-world Examples

### E-commerce Application
```typescript
const ecommerceDict = {
  product: {
    price: {
      en: 'Price: ${{ amount }}',
      fr: 'Prix : {{ amount }} $'
    },
    availability: {
      en: '{{ count }} in stock',
      fr: '{{ count }} en stock'
    },
    availability_zero: {
      en: 'Out of stock',
      fr: 'Rupture de stock'
    }
  },
  cart: {
    item: {
      en: '{{ count }} item',
      fr: '{{ count }} article'
    },
    item_plural: {
      en: '{{ count }} items',
      fr: '{{ count }} articles'
    },
    total: {
      en: 'Total: ${{ amount }}',
      fr: 'Total : {{ amount }} $'
    }
  }
};

// Usage
const price = trans('product.price', {
  dict: ecommerceDict,
  lang: 'en',
  params: { amount: '29.99' }
});

const cartItems = trans('cart.item', {
  dict: ecommerceDict,
  lang: 'fr',
  count: 3
});
```

### User Dashboard
```typescript
const dashboardDict = {
  dashboard: {
    welcome: {
      en: 'Welcome back, {{ username }}!',
      fr: 'Bon retour, {{ username }} !'
    },
    stats: {
      unread: {
        en: 'You have {{ count }} unread message',
        fr: 'Vous avez {{ count }} message non lu'
      },
      unread_plural: {
        en: 'You have {{ count }} unread messages',
        fr: 'Vous avez {{ count }} messages non lus'
      },
      unread_zero: {
        en: 'No unread messages',
        fr: 'Aucun message non lu'
      }
    }
  }
};

// Usage
const welcome = trans('dashboard.welcome', {
  dict: dashboardDict,
  lang: 'fr',
  params: { username: 'Marie' }
});

const messages = trans('dashboard.stats.unread', {
  dict: dashboardDict,
  lang: 'en',
  count: 0
});
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR
- Add new locales to the supported list when needed

---

Made with ❤️ by the Talos team
