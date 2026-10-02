import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import JavaScriptObfuscator from "javascript-obfuscator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const productionDir = path.resolve(rootDir, "production");

console.log("🚀 Starting Production Build Pipeline (Target: production)...");

// 1. Clean production directory (Preserving .git folder if production is a separate git repo)
if (fs.existsSync(productionDir)) {
  const items = fs.readdirSync(productionDir);
  for (const item of items) {
    if (item === ".git") continue; // Preserve git repo if configured
    fs.removeSync(path.join(productionDir, item));
  }
  console.log("  🧹 Cleaned old production build (Preserved .git repo if existing)");
} else {
  fs.mkdirSync(productionDir, { recursive: true });
}

// 2. Compile TypeScript project to dist
console.log("📦 [Step 1/5] Compiling TypeScript codebase (tsc)...");
if (fs.existsSync(distDir)) {
  fs.removeSync(distDir);
}
execSync("npx tsc", { cwd: rootDir, stdio: "inherit" });
console.log("  ✅ TypeScript compilation completed.");

// 3. Selective Obfuscation & Copying JS Files from dist/ to production/
console.log("🔒 [Step 2/5] Copying & Selectively Obfuscating Logic Files...");

function isLogicFile(relativePath) {
  const norm = relativePath.replace(/\\/g, "/");
  return (
    norm.startsWith("services/") ||
    norm.startsWith("utils/") ||
    norm.startsWith("protocol/") ||
    norm.startsWith("api/middlewares/")
  );
}

function processDirectory(srcPath, destPath, baseDir) {
  const items = fs.readdirSync(srcPath);

  for (const item of items) {
    const fullSrc = path.join(srcPath, item);
    const fullDest = path.join(destPath, item);
    const stat = fs.statSync(fullSrc);

    if (stat.isDirectory()) {
      fs.mkdirpSync(fullDest);
      processDirectory(fullSrc, fullDest, baseDir);
    } else if (item.endsWith(".map") || item.endsWith(".d.ts")) {
      // Exclude source maps and TypeScript definitions to prevent reverse mapping!
      continue;
    } else if (item.endsWith(".js")) {
      const relativePath = path.relative(baseDir, fullSrc);

      if (isLogicFile(relativePath)) {
        const code = fs.readFileSync(fullSrc, "utf8");
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, {
          target: "node",
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: "hexadecimal",
          log: false,
          numbersToExpressions: true,
          renameGlobals: false,
          selfDefending: false,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 10,
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayEncoding: ["base64"],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayThreshold: 0.8,
          unicodeEscapeSequence: false,
        }).getObfuscatedCode();

        fs.writeFileSync(fullDest, obfuscatedCode, "utf8");
        console.log(`  🔒 Obfuscated Core Logic: ${relativePath}`);
      } else {
        fs.copySync(fullSrc, fullDest);
        console.log(`  📄 Copied Plain JS:       ${relativePath}`);
      }
    } else {
      fs.copySync(fullSrc, fullDest);
    }
  }
}

processDirectory(distDir, productionDir, distDir);

// 4. Copy Docker, PM2 & Git configuration files
console.log("📄 [Step 3/5] Copying Docker, PM2 & environment configuration files...");
const configFiles = [
  "docker-compose.yml",
  "ecosystem.config.cjs",
  ".gitignore",
  ".dockerignore",
  "readme.md",
  ".env.example",
];

for (const file of configFiles) {
  const srcFile = path.join(rootDir, file);
  if (fs.existsSync(srcFile)) {
    fs.copySync(srcFile, path.join(productionDir, file));
    console.log(`  📄 Copied: ${file}`);
  }
}

// Generate self-contained production dockerfile
const prodDockerfileContent = `FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3040

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data

EXPOSE 3040

CMD ["node", "index.js"]
`;
fs.writeFileSync(path.join(productionDir, "dockerfile"), prodDockerfileContent, "utf8");
console.log("  📄 Generated: production dockerfile");

// 5. Initialize clean data directory in production
const prodDataDir = path.join(productionDir, "data");
fs.mkdirpSync(prodDataDir);
fs.mkdirpSync(path.join(prodDataDir, "uploads"));

const prodAccountsFile = path.join(prodDataDir, "accounts.json");
if (!fs.existsSync(prodAccountsFile)) {
  fs.writeJsonSync(prodAccountsFile, [], { spaces: 2 });
}

const prodStoreFile = path.join(prodDataDir, "openai_store.json");
if (!fs.existsSync(prodStoreFile)) {
  fs.writeJsonSync(
    prodStoreFile,
    { assistants: {}, vector_stores: {}, batches: {}, fine_tuning: {} },
    { spaces: 2 }
  );
}

// 6. Generate Production package.json
console.log("📝 [Step 4/5] Preparing Production package.json...");
const pkgJson = fs.readJsonSync(path.join(rootDir, "package.json"));
delete pkgJson.devDependencies;
pkgJson.main = "index.js";
pkgJson.scripts = {
  start: "node index.js",
  "pm2:start": "pm2 start ecosystem.config.cjs",
  "pm2:stop": "pm2 stop ecosystem.config.cjs",
  "pm2:restart": "pm2 restart ecosystem.config.cjs",
  "pm2:logs": "pm2 logs chatgpt-nodejs",
};
fs.writeJsonSync(path.join(productionDir, "package.json"), pkgJson, { spaces: 2 });

// 7. Auto Git Push for Production repo (if .git exists inside production folder)
console.log("🚀 [Step 5/5] Checking Production Git repository...");
const gitDir = path.join(productionDir, ".git");
if (fs.existsSync(gitDir)) {
  console.log("  Detected .git repository in production folder...");
  try {
    const status = execSync("git status --porcelain", { cwd: productionDir, encoding: "utf8" }).trim();
    if (status) {
      const commitMsg = `Auto-build production release (${new Date().toLocaleString("vi-VN")})`;
      console.log("  ➕ Running git add .");
      execSync("git add .", { cwd: productionDir, stdio: "inherit" });

      console.log(`  ✏️ Running git commit -m "${commitMsg}"`);
      execSync(`git commit -m "${commitMsg}"`, { cwd: productionDir, stdio: "inherit" });

      console.log("  ⬆️ Running git push...");
      execSync("git push", { cwd: productionDir, stdio: "inherit" });

      console.log("  ✅ Successfully auto-pushed production build to Git repository!");
    } else {
      console.log("  ℹ️ No changes detected in production Git repository.");
    }
  } catch (err) {
    console.error("  ❌ Auto Git Push failed:", err.message);
  }
} else {
  console.log("  ℹ️ Git is not initialized in production folder yet.");
  console.log("     (Run 'git init' and add remote inside production/ to enable auto-push).\n");
}

console.log("\n=======================================================");
console.log("🎉 PRODUCTION BUILD COMPLETED SUCCESSFULLY!");
console.log("📁 Target Directory: " + productionDir);
console.log("⚡ PM2 Configured:   ecosystem.config.cjs");
console.log("🔒 Obfuscated:       Services, Utils, Protocols & Middlewares");
console.log("=======================================================\n");
