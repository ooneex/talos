# Hooks, compound components & global state

## Hooks

Extract reusable stateful logic into custom hooks (`useXxx`) instead of duplicating it or using HOCs/render props.

```typescript
import { useEffect, useState } from "react";

const useWindowWidth = (): number => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = (): void => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
};

// usage
const isMobile = useWindowWidth() < 768;
```

## Compound components

Build flexible components as related parts sharing state via context, not one prop-heavy monolith.

```tsx
import { createContext, useContext, useState } from "react";

type TabsContextType = {
  active: string;
  setActive: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | null>(null);

const Tabs = ({ children, defaultValue }: ITabsProps) => {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      {children}
    </TabsContext.Provider>
  );
};

const Tab = ({ value, children }: ITabProps) => {
  const ctx = useContext(TabsContext);
  return <button onClick={() => ctx?.setActive(value)}>{children}</button>;
};

const TabPanel = ({ value, children }: ITabPanelProps) => {
  const ctx = useContext(TabsContext);
  return ctx?.active === value ? <div>{children}</div> : null;
};

Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// usage
<Tabs defaultValue="overview">
  <Tabs.Tab value="overview">Overview</Tabs.Tab>
  <Tabs.Panel value="overview">Overview content</Tabs.Panel>
</Tabs>;
```

## Global state — Zustand

Keep stores small and colocated; use selectors to avoid re-renders. https://zustand.docs.pmnd.rs/learn/getting-started/introduction

```typescript
import { create } from "zustand";

type CounterStoreType = {
  count: number;
  increment: () => void;
};

const useCounterStore = create<CounterStoreType>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

// select only what you need
const count = useCounterStore((state) => state.count);
```
