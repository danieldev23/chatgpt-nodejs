import { createHash, randomUUID } from "node:crypto";

const DEFAULT_POW_SCRIPT = "https://chatgpt.com/backend-api/sentinel/sdk.js";
const CORES = [8, 16, 24, 32];
const SCREEN_RESOLUTIONS = [
  [1920, 1080],
  [1440, 900],
  [2560, 1440],
  [3840, 2160],
];
const DOCUMENT_KEYS = ["__reactContainer$fzelfjyxej8", "_reactListening5dehydibo78", "location"];
const WINDOW_KEYS = [
  "0", "window", "self", "document", "name", "location", "customElements",
  "history", "navigation", "innerWidth", "innerHeight", "scrollX", "scrollY",
  "visualViewport", "screenX", "screenY", "outerWidth", "outerHeight",
  "devicePixelRatio", "screen", "chrome", "navigator", "onresize",
  "performance", "crypto", "indexedDB", "sessionStorage", "localStorage",
  "scheduler", "alert", "atob", "btoa", "fetch", "matchMedia", "postMessage",
  "queueMicrotask", "requestAnimationFrame", "setInterval", "setTimeout",
  "caches", "__NEXT_DATA__", "__BUILD_MANIFEST", "__NEXT_PRELOADREADY",
];
const NAVIGATOR_KEYS = [
  "registerProtocolHandler−function registerProtocolHandler() { [native code] }",
  "storage−[object StorageManager]",
  "locks−[object LockManager]",
  "appCodeName−Mozilla",
  "permissions−[object Permissions]",
  "share−function share() { [native code] }",
  "webdriver−false",
  "managed−[object NavigatorManagedData]",
  "canShare−function canShare() { [native code] }",
  "vendor−Google Inc.",
  "mediaDevices−[object MediaDevices]",
  "vibrate−function vibrate() { [native code] }",
  "storageBuckets−[object StorageBucketManager]",
  "mediaCapabilities−[object MediaCapabilities]",
  "cookieEnabled−true",
  "virtualKeyboard−[object VirtualKeyboard]",
  "product−Gecko",
  "presentation−[object Presentation]",
  "onLine−true",
  "mimeTypes−[object MimeTypeArray]",
  "credentials−[object CredentialsContainer]",
  "serviceWorker−[object ServiceWorkerContainer]",
  "keyboard−[object Keyboard]",
  "gpu−[object GPU]",
  "doNotTrack",
  "serial−[object Serial]",
  "pdfViewerEnabled−true",
  "language−zh-CN",
  "geolocation−[object Geolocation]",
  "userAgentData−[object NavigatorUAData]",
  "getUserMedia−function getUserMedia() { [native code] }",
  "sendBeacon−function sendBeacon() { [native code] }",
  "hardwareConcurrency−32",
  "windowControlsOverlay−[object WindowControlsOverlay]",
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function legacyParseTime(): string {
  const d = new Date();
  return d.toString();
}

export function parsePowResources(htmlContent: string): { scriptSources: string[]; dataBuild: string } {
  const scriptSources: string[] = [];
  let dataBuild = "";

  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    scriptSources.push(src);
    const buildMatch = src.match(/c\/[^\/]*\/_/);
    if (buildMatch) {
      dataBuild = buildMatch[0];
    }
  }

  if (!dataBuild) {
    const htmlBuildMatch = htmlContent.match(/<html[^>]*data-build=["']([^"']*)["']/);
    if (htmlBuildMatch) {
      dataBuild = htmlBuildMatch[1];
    }
  }

  return {
    scriptSources: scriptSources.length > 0 ? scriptSources : [DEFAULT_POW_SCRIPT],
    dataBuild,
  };
}

export function buildPowConfig(
  userAgent: string,
  scriptSources?: string[],
  dataBuild = ""
): unknown[] {
  const res = randomChoice(SCREEN_RESOLUTIONS);
  const screenSum = res[0] + res[1];
  const scriptSource = scriptSources && scriptSources.length > 0
    ? randomChoice(scriptSources)
    : DEFAULT_POW_SCRIPT;

  const perfNow = performance.now();
  const timeNow = Date.now();

  return [
    screenSum,
    legacyParseTime(),
    4294705152,
    1,
    userAgent,
    scriptSource,
    dataBuild,
    "en-US",
    "en-US,es-US,en,es",
    Math.random(),
    randomChoice(NAVIGATOR_KEYS),
    randomChoice(DOCUMENT_KEYS),
    randomChoice(WINDOW_KEYS),
    perfNow,
    randomUUID(),
    "",
    randomChoice(CORES),
    timeNow - perfNow,
    0, 0, 0, 0, 0, 0,
    0, // 0 = chrome/edge, 1 = firefox
  ];
}

export function buildLegacyRequirementsToken(
  userAgent: string,
  scriptSources?: string[],
  dataBuild = ""
): string {
  const config = buildPowConfig(userAgent, scriptSources, dataBuild);
  return "gAAAAAC" + Buffer.from(JSON.stringify(config)).toString("base64");
}

export function solvePow(
  seed: string,
  difficulty: string,
  config: unknown[],
  limit = 500000
): { token: string; solved: boolean } {
  const target = Buffer.from(difficulty, "hex");
  const diffLen = Math.floor(difficulty.length / 2);
  const seedBuf = Buffer.from(seed);

  const static1 = Buffer.from(JSON.stringify(config.slice(0, 3)).slice(0, -1) + ",");
  const static2 = Buffer.from("," + JSON.stringify(config.slice(4, 9)).slice(1, -1) + ",");
  const static3 = Buffer.from("," + JSON.stringify(config.slice(10)).slice(1));

  for (let i = 0; i < limit; i++) {
    const iBuf = Buffer.from(String(i));
    const iShiftBuf = Buffer.from(String(i >> 1));
    const finalJson = Buffer.concat([static1, iBuf, static2, iShiftBuf, static3]);
    const encoded = finalJson.toString("base64");
    const hash = createHash("sha3-512").update(seedBuf).update(Buffer.from(encoded)).digest();

    if (hash.subarray(0, diffLen).compare(target) <= 0) {
      return { token: "gAAAAAB" + encoded, solved: true };
    }
  }

  const fallback = "gAAAAAB" + Buffer.from(JSON.stringify(seed)).toString("base64");
  return { token: fallback, solved: false };
}
