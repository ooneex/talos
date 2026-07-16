# Server state, virtualization, rate-limiting & shortcuts

## Server state — TanStack Query

Wrap each query/mutation in a custom hook. https://tanstack.com/query/latest

```typescript
import { useQuery } from "@tanstack/react-query";

const useUsers = () =>
  useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<UserType[]> => {
      const response = await fetch("/api/users");
      return response.json();
    },
  });

// usage
const { data, isLoading, error } = useUsers();
```

## Long lists — TanStack Virtual

Render only visible rows. https://tanstack.com/virtual/latest

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 40,
});

virtualizer.getVirtualItems().map((item) => rows[item.index]);
```

Beyond virtualization, protect perceived speed with: reserved space for images/embeds (`aspect-ratio` or explicit dimensions) so nothing shifts on load; `IntersectionObserver` (unobserve after first fire) instead of scroll-event listeners for reveal/lazy-load triggers; batching DOM reads before writes when measuring layout manually, to avoid repeated synchronous reflow.

## Debounce / throttle / queue / batch — TanStack Pacer

Rate-limit expensive work (search input, scroll handlers, API calls). https://tanstack.com/pacer/latest

```typescript
import { useDebouncedValue } from "@tanstack/react-pacer";

const [search, setSearch] = useState("");
const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
// updates 300ms after the user stops typing
```

## Keyboard shortcuts — TanStack Hotkeys

https://tanstack.com/hotkeys/latest

```typescript
import { useHotkeys } from "@tanstack/react-hotkeys";

useHotkeys("mod+k", () => openCommandPalette());
useHotkeys("mod+s", (event) => {
  event.preventDefault();
  save();
});
```
