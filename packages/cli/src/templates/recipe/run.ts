// Replays recipe steps in Bun.WebView for `talos recipe:run`.
//
// The CLI embeds this file, writes it to a temporary directory together with a
// JSON plan, and runs `bun run.ts plan.json`. Every run gets a fresh browser
// view — headless, or with `--headed` a new tab in the open window of the
// user's own browser, reached over its DevTools endpoint; its steps run in
// order and the first failure stops the run. Progress goes to stdout as one
// JSON event per line, which the CLI renders.

type Step =
  | { action: "navigate"; url: string }
  | { action: "click"; selector: string }
  | { action: "fill"; selector: string; value: string }
  | { action: "press"; key: string }
  | { action: "scroll"; selector: string }
  | { action: "wait"; duration: number };

type Plan = {
  baseUrl: string | null;
  timeout: number;
  width: number;
  height: number;
  screenshotDir: string;
  browser: { name: string; url: string } | null;
  runs: { id: string; steps: Step[] }[];
};

type RunnerEvent =
  | { type: "run"; run: number }
  | {
      type: "step";
      run: number;
      step: number;
      status: "passed" | "failed";
      duration: number;
      error?: string;
      screenshot?: string;
    }
  | { type: "fatal"; run?: number; error: string };

const emit = (event: RunnerEvent): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const resolveUrl = (url: string, baseUrl: string | null): string => {
  if (URL.canParse(url)) {
    return url;
  }
  if (baseUrl === null) {
    throw new Error(`"${url}" is not an absolute URL; pass --base-url (or set E2E_BASE_URL) to resolve it`);
  }
  if (!URL.canParse(baseUrl)) {
    throw new Error(`The base URL "${baseUrl}" is not an absolute URL`);
  }
  return new URL(url, baseUrl).href;
};

// How long a click or key press has to start a navigation before the next
// step goes ahead.
const NAVIGATION_GRACE = 50;
const POLL_INTERVAL = 50;
// Extra time a browser call gets past the step's own timeout before it is
// considered stuck.
const STALL_MARGIN = 2000;

const withTimeout = async <T>(promise: Promise<T>, timeout: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
};

const remaining = (deadline: number): number => Math.max(1, Math.round(deadline - performance.now()));

// A selector call still waiting when the page it runs in is replaced never
// settles, and the view accepts no further calls, so every call is bounded.
const guard = <T>(promise: Promise<T>, deadline: number, what: string): Promise<T> =>
  withTimeout(
    promise,
    remaining(deadline) + STALL_MARGIN,
    `${what} stopped responding — the page probably navigated during the step`,
  );

// Counts the navigations the view finishes, whoever started them.
type Tracker = { navigations: number };

const track = (view: Bun.WebView): Tracker => {
  const tracker: Tracker = { navigations: 0 };
  view.onNavigated = () => {
    tracker.navigations += 1;
  };
  view.onNavigationFailed = () => {
    tracker.navigations += 1;
  };
  return tracker;
};

// Installs a Navigation API listener in the current document (once) and tells
// where the document is going, if it is being left: a cross-document
// navigation started and was neither intercepted nor cancelled. History and
// hash changes stay on the same document, and so does an <a download>; pages
// without the API (data: URLs) never report leaving.
const DESTINATION = `(() => {
  if (typeof navigation === "undefined") {
    return null;
  }
  let watch = window.__talosRecipe;
  if (watch === undefined) {
    watch = { leaving: false, destination: null };
    window.__talosRecipe = watch;
    navigation.addEventListener("navigate", (event) => {
      if (event.destination.sameDocument || (event.downloadRequest ?? null) !== null) {
        return;
      }
      watch.leaving = true;
      watch.destination = event.destination.url;
      setTimeout(() => {
        if (event.defaultPrevented) {
          watch.leaving = false;
        }
      });
    });
    const settled = () => {
      watch.leaving = false;
    };
    navigation.addEventListener("navigatesuccess", settled);
    navigation.addEventListener("navigateerror", settled);
  }
  return watch.leaving ? watch.destination : null;
})()`;

// Waits out a navigation the page started — a link, a form, a script — so the
// next call runs against the page it leads to.
const ready = async (view: Bun.WebView, tracker: Tracker, deadline: number): Promise<void> => {
  const before = tracker.navigations;
  const destination = await guard(view.evaluate<string | null>(DESTINATION), deadline, "The page");
  if (destination === null) {
    return;
  }
  while (tracker.navigations === before) {
    if (performance.now() >= deadline) {
      // WebKit reports no end to a navigation that leaves the page in place.
      throw new Error(
        `timeout waiting for ${destination} to load (a 204 response or a file download never replaces the page)`,
      );
    }
    await Bun.sleep(POLL_INTERVAL / 2);
  }
};

// Leaves time for an interaction to start a navigation, then waits it out.
const settle = async (view: Bun.WebView, tracker: Tracker, timeout: number): Promise<void> => {
  await Bun.sleep(NAVIGATION_GRACE);
  await ready(view, tracker, performance.now() + timeout);
};

// Waits for `selector` to match in the current page. Polling here rather than
// in `click`/`scrollTo` keeps those calls short, so a page that navigates away
// is noticed between polls instead of stranding a pending call.
const locate = async (view: Bun.WebView, tracker: Tracker, selector: string, deadline: number): Promise<void> => {
  const present = `document.querySelector(${JSON.stringify(selector)}) !== null`;
  for (;;) {
    await ready(view, tracker, deadline);
    if (await guard(view.evaluate<boolean>(present), deadline, `'${selector}'`)) {
      return;
    }
    if (performance.now() >= deadline) {
      throw new Error(`timeout waiting for '${selector}' to appear`);
    }
    await Bun.sleep(POLL_INTERVAL);
  }
};

// Brings the element into view first: `view.click` only acts on what is on screen.
const click = async (view: Bun.WebView, tracker: Tracker, selector: string, deadline: number): Promise<void> => {
  await locate(view, tracker, selector, deadline);
  await guard(view.scrollTo(selector, { timeout: remaining(deadline), block: "nearest" }), deadline, `'${selector}'`);
  await guard(view.click(selector, { timeout: remaining(deadline) }), deadline, `'${selector}'`);
};

// Selecting the focused field's content lets `type` replace it rather than
// insert at the caret the click left behind. It only moves the selection; the
// input itself stays a trusted `type`/`press`.
const SELECT_FOCUSED = `(() => {
  const element = document.activeElement;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.select();
    return true;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  }
  return false;
})()`;

const perform = async (view: Bun.WebView, tracker: Tracker, step: Step, plan: Plan): Promise<void> => {
  const deadline = performance.now() + plan.timeout;
  switch (step.action) {
    case "navigate": {
      const url = resolveUrl(step.url, plan.baseUrl);
      await withTimeout(view.navigate(url), plan.timeout, `timeout loading ${url}`);
      // WebKit resolves a refused connection on a blank page instead of rejecting.
      if (view.url === "about:blank" && url !== "about:blank") {
        throw new Error(`Could not load ${url} — is the app running?`);
      }
      return;
    }
    case "click":
      await click(view, tracker, step.selector, deadline);
      await settle(view, tracker, plan.timeout);
      return;
    case "fill":
      await click(view, tracker, step.selector, deadline);
      if (!(await guard(view.evaluate<boolean>(SELECT_FOCUSED), deadline, `'${step.selector}'`))) {
        throw new Error(`'${step.selector}' is not a text field`);
      }
      await guard(step.value === "" ? view.press("Backspace") : view.type(step.value), deadline, `'${step.selector}'`);
      return;
    case "press":
      await ready(view, tracker, deadline);
      await guard(view.press(step.key), deadline, `The "${step.key}" key`);
      await settle(view, tracker, plan.timeout);
      return;
    case "scroll":
      await locate(view, tracker, step.selector, deadline);
      await guard(view.scrollTo(step.selector, { timeout: remaining(deadline) }), deadline, `'${step.selector}'`);
      return;
    case "wait":
      await Bun.sleep(step.duration);
      return;
  }
};

const screenshot = async (view: Bun.WebView, plan: Plan, id: string): Promise<string | undefined> => {
  try {
    const path = `${plan.screenshotDir}/${id}.png`;
    await Bun.write(path, await withTimeout(view.screenshot(), STALL_MARGIN, "screenshot timed out"));
    return path;
  } catch {
    return undefined;
  }
};

const WINDOW_ONLY_PARAMS = new Set(["newWindow", "width", "height"]);

const asTab = (message: string): string => {
  if (!message.includes('"Target.createTarget"')) {
    return message;
  }
  const command = JSON.parse(message) as { method?: string; params?: Record<string, unknown> };
  if (command.method !== "Target.createTarget") {
    return message;
  }
  const params = Object.fromEntries(
    Object.entries(command.params ?? {}).filter(([name]) => !WINDOW_ONLY_PARAMS.has(name)),
  );
  return JSON.stringify({ ...command, params });
};

type Relay = { browser: WebSocket; opened: Promise<void> };

// Bun.WebView opens every Chrome view with `Target.createTarget { newWindow:
// true, width, height }`. Its DevTools traffic goes through this local relay,
// which drops those fields, so each recipe opens as a new tab of the window the
// user already has open instead of a window of its own.
const relayAsTabs = (browserUrl: string): string => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, server) =>
      server.upgrade(request, { data: {} as Relay })
        ? undefined
        : new Response("Expected a DevTools WebSocket", { status: 426 }),
    websocket: {
      data: {} as Relay,
      // DevTools stays silent through long waits, and screenshots are large.
      idleTimeout: 0,
      backpressureLimit: 1024 ** 3,
      open: (client) => {
        const browser = new WebSocket(browserUrl);
        client.data.browser = browser;
        client.data.opened = new Promise((resolve) => browser.addEventListener("open", () => resolve()));
        browser.addEventListener("message", (event) => client.send(event.data));
        browser.addEventListener("close", () => client.close());
      },
      message: (client, message) => {
        const { browser, opened } = client.data;
        const relayed = asTab(String(message));
        void opened.then(() => browser.send(relayed));
      },
      close: (client) => {
        const { browser, opened } = client.data;
        void opened.then(() => browser.close());
      },
    },
  });
  server.unref();
  return `ws://127.0.0.1:${server.port}${new URL(browserUrl).pathname}`;
};

// `devtools` is the user's browser, reached through `relayAsTabs`: its views
// are tabs of its own profile, so a login the user already has carries over.
// Only the tabs the runner opened are ever closed — the browser, the user's
// tabs, cookies and storage stay as they were.
const openView = (plan: Plan, devtools: string | null): Bun.WebView => {
  const { width, height } = plan;
  if (devtools !== null) {
    return new Bun.WebView({ backend: { type: "chrome", url: devtools }, width, height });
  }
  const backend: Bun.WebView.Backend = process.platform === "darwin" ? "webkit" : { type: "chrome", url: false };
  return new Bun.WebView({ backend, width, height, dataStore: "ephemeral" });
};

const replay = async (plan: Plan, index: number, run: Plan["runs"][number], view: Bun.WebView): Promise<void> => {
  const tracker = track(view);

  for (const [position, step] of run.steps.entries()) {
    const started = performance.now();
    try {
      await perform(view, tracker, step, plan);
      emit({
        type: "step",
        run: index,
        step: position,
        status: "passed",
        duration: Math.round(performance.now() - started),
      });
    } catch (error) {
      const duration = Math.round(performance.now() - started);
      const path = await screenshot(view, plan, run.id);
      emit({
        type: "step",
        run: index,
        step: position,
        status: "failed",
        duration,
        error: messageOf(error),
        ...(path === undefined ? {} : { screenshot: path }),
      });
      return;
    }
  }
};

const main = async (): Promise<void> => {
  const planPath = process.argv[2];
  if (planPath === undefined) {
    emit({ type: "fatal", error: "Missing the plan file argument" });
    return;
  }

  let plan: Plan;
  try {
    plan = (await Bun.file(planPath).json()) as Plan;
  } catch (error) {
    emit({ type: "fatal", error: `Could not read the plan: ${messageOf(error)}` });
    return;
  }

  // A view closes only once the next one exists: closing the last view drops
  // the DevTools connection, and a browser whose remote debugging was turned
  // on at chrome://inspect asks the user to allow every new connection.
  const devtools = plan.browser === null ? null : relayAsTabs(plan.browser.url);
  let previous: Bun.WebView | undefined;
  try {
    for (const [index, run] of plan.runs.entries()) {
      emit({ type: "run", run: index });
      try {
        const view = openView(plan, devtools);
        previous?.close();
        previous = view;
        await replay(plan, index, run, view);
      } catch (error) {
        // The view itself failed (no browser, crashed renderer): the CLI marks
        // what this run had left as not run and moves on to the next one.
        emit({ type: "fatal", run: index, error: messageOf(error) });
      }
    }
  } finally {
    previous?.close();
  }
};

await main();
