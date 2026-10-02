class OrderedMap {
  keys: string[] = [];
  values: Record<string, unknown> = {};

  add(key: string, value: unknown): void {
    if (!(key in this.values)) {
      this.keys.push(key);
    }
    this.values[key] = value;
  }
}

function turnstileToStr(value: unknown): string {
  if (value === null || value === undefined) {
    return "undefined";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    const special: Record<string, string> = {
      "window.Math": "[object Math]",
      "window.Reflect": "[object Reflect]",
      "window.performance": "[object Performance]",
      "window.localStorage": "[object Storage]",
      "window.Object": "function Object() { [native code] }",
      "window.Reflect.set": "function set() { [native code] }",
      "window.performance.now": "function () { [native code] }",
      "window.Object.create": "function create() { [native code] }",
      "window.Object.keys": "function keys() { [native code] }",
      "window.Math.random": "function random() { [native code] }",
    };
    return special[value] || value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(",");
  }
  return String(value);
}

function xorString(text: string, key: string): string {
  if (!key) return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function solveTurnstileToken(dx: string, p: string): string | null {
  let tokenList: unknown[][];
  try {
    const decoded = Buffer.from(dx, "base64").toString("utf-8");
    const unxored = xorString(decoded, p);
    tokenList = JSON.parse(unxored);
  } catch {
    return null;
  }

  const processMap = new Map<unknown, unknown>();
  const startTime = Date.now();
  let result = "";

  const func1 = (e: number, t: number) => {
    processMap.set(e, xorString(turnstileToStr(processMap.get(e)), turnstileToStr(processMap.get(t))));
  };

  const func2 = (e: number, t: unknown) => {
    processMap.set(e, t);
  };

  const func3 = (e: string) => {
    result = Buffer.from(e).toString("base64");
  };

  const func5 = (e: number, t: number) => {
    const current = processMap.get(e);
    const incoming = processMap.get(t);
    if (Array.isArray(current)) {
      processMap.set(e, [...current, incoming]);
      return;
    }
    if (
      typeof current === "string" ||
      typeof current === "number" ||
      typeof incoming === "string" ||
      typeof incoming === "number"
    ) {
      processMap.set(e, turnstileToStr(current) + turnstileToStr(incoming));
      return;
    }
    processMap.set(e, "NaN");
  };

  const func6 = (e: number, t: number, n: number) => {
    const tv = processMap.get(t);
    const nv = processMap.get(n);
    if (typeof tv === "string" && typeof nv === "string") {
      const val = `${tv}.${nv}`;
      processMap.set(e, val === "window.document.location" ? "https://chatgpt.com/" : val);
    }
  };

  const func7 = (e: number, ...args: number[]) => {
    const target = processMap.get(e);
    const values = args.map((arg) => processMap.get(arg));
    if (target === "window.Reflect.set") {
      const [obj, keyName, val] = values;
      if (obj instanceof OrderedMap) {
        obj.add(String(keyName), val);
      } else if (obj && typeof obj === "object") {
        (obj as Record<string, unknown>)[String(keyName)] = val;
      }
    } else if (typeof target === "function") {
      (target as (...a: unknown[]) => unknown)(...values);
    }
  };

  const func8 = (e: number, t: number) => {
    processMap.set(e, processMap.get(t));
  };

  const func14 = (e: number, t: number) => {
    processMap.set(e, JSON.parse(processMap.get(t) as string));
  };

  const func15 = (e: number, t: number) => {
    processMap.set(e, JSON.stringify(processMap.get(t)));
  };

  const func17 = (e: number, t: number, ...args: number[]) => {
    const callArgs = args.map((arg) => processMap.get(arg));
    const target = processMap.get(t);
    if (target === "window.performance.now") {
      processMap.set(e, performance.now());
    } else if (target === "window.Object.create") {
      processMap.set(e, new OrderedMap());
    } else if (target === "window.Object.keys") {
      if (callArgs.length > 0 && callArgs[0] === "window.localStorage") {
        processMap.set(e, [
          "STATSIG_LOCAL_STORAGE_INTERNAL_STORE_V4",
          "STATSIG_LOCAL_STORAGE_STABLE_ID",
          "client-correlated-secret",
          "oai/apps/capExpiresAt",
          "oai-did",
          "STATSIG_LOCAL_STORAGE_LOGGING_REQUEST",
          "UiState.isNavigationCollapsed.1",
        ]);
      }
    } else if (target === "window.Math.random") {
      processMap.set(e, Math.random());
    } else if (typeof target === "function") {
      processMap.set(e, (target as (...a: unknown[]) => unknown)(...callArgs));
    }
  };

  const func18 = (e: number) => {
    processMap.set(e, Buffer.from(turnstileToStr(processMap.get(e)), "base64").toString("utf-8"));
  };

  const func19 = (e: number) => {
    processMap.set(e, Buffer.from(turnstileToStr(processMap.get(e))).toString("base64"));
  };

  const func20 = (e: number, t: number, n: number, ...args: number[]) => {
    if (processMap.get(e) === processMap.get(t)) {
      const target = processMap.get(n);
      if (typeof target === "function") {
        (target as (...a: unknown[]) => unknown)(...args.map((a) => processMap.get(a)));
      }
    }
  };

  const func21 = () => {};

  const func23 = (e: number, t: number, ...args: unknown[]) => {
    const fn = processMap.get(t);
    if (processMap.get(e) !== undefined && typeof fn === "function") {
      (fn as (...a: unknown[]) => unknown)(...args);
    }
  };

  const func24 = (e: number, t: number, n: number) => {
    const tv = processMap.get(t);
    const nv = processMap.get(n);
    if (typeof tv === "string" && typeof nv === "string") {
      processMap.set(e, `${tv}.${nv}`);
    }
  };

  processMap.set(1, func1);
  processMap.set(2, func2);
  processMap.set(3, func3);
  processMap.set(5, func5);
  processMap.set(6, func6);
  processMap.set(7, func7);
  processMap.set(8, func8);
  processMap.set(9, tokenList);
  processMap.set(10, "window");
  processMap.set(14, func14);
  processMap.set(15, func15);
  processMap.set(16, p);
  processMap.set(17, func17);
  processMap.set(18, func18);
  processMap.set(19, func19);
  processMap.set(20, func20);
  processMap.set(21, func21);
  processMap.set(23, func23);
  processMap.set(24, func24);

  for (const token of tokenList) {
    try {
      const fn = processMap.get(token[0]);
      if (typeof fn === "function") {
        (fn as (...a: unknown[]) => unknown)(...(token.slice(1) as number[]));
      }
    } catch {
      continue;
    }
  }

  return result || null;
}
