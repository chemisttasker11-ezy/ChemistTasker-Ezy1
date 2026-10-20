#!/usr/bin/env node
/**
 * A04 whole-tree architecture inventory. Reporting mode is intentionally
 * non-blocking; CI's existing added-lines boundary audit remains the ratchet.
 * This is not a replacement for an AST/semantic call-graph audit.
 *
 * Usage: node scripts/inventory-client-api-boundaries.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(root, 'shared-core', 'package.json'))('typescript');
const trees = ['frontend_web/src', 'frontend_web/landing_next', 'frontend_mobile'];
const ignored = new Set(['node_modules', 'dist', 'build', '.next', '.expo', 'coverage', '.git', 'e2e', '__tests__', '__mocks__']);
const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const route = /(?:\/api\/v1|\/api|['"` ]\/(?:pharmacies|organizations|roster|work-notes|calendar-events|shift|shifts|billing|attendance|workforce|users|marketplace|ethical|public-hub|content|talent|chat|onboarding)\/)/i;
const directTransport = /\b(?:axios\s*\.|(?:apiClient|httpClient|fetchApi)\s*\.|fetch\s*\(|fetchJson\s*\(|postJson\s*\()/;
const clientEscape = /\b(?:marketApi|ethicalApi)\s*(?:<[^>]*>)?\s*\(|\bchemistTaskerApi\.(?:publicContent|contentManagement|marketplace|ethicalMarketplace)\.request\s*\(/;

function visit(folder, output = []) {
    if (!fs.existsSync(folder)) return output;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) visit(full, output);
        else if (allowedExt.has(path.extname(entry.name)) && !/\.(?:test|spec|stories|d)\.[cm]?[jt]sx?$/.test(entry.name) && !full.replaceAll('\\', '/').includes('/src/kiosk/') && !/\/frontend_web\/src\/pages\/attendance\/KioskPage(?:\.runtime)?\.[jt]sx?$/.test(full.replaceAll('\\', '/'))) output.push(full);
    }
    return output;
}

function calleeName(node) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return calleeName(node.expression);
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const prefix = calleeName(node.expression);
    return prefix ? prefix + '.' + node.name.text : null;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    const prefix = calleeName(node.expression);
    return prefix ? prefix + '.' + node.argumentExpression.text : null;
  }
  return null;
}
function routeText(node, constants = new Map()) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return routeText(node.expression, constants);
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => '$' + '{...}' + span.literal.text).join('');
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = routeText(node.left, constants), b = routeText(node.right, constants);
    return (a || b) ? (a || '$' + '{...}') + (b || '$' + '{...}') : null;
  }
  return null;
}
const fullDomainRoute = /\/(?:api\/(?:v1\/)?)?(?:users|client-profile|pharmacies|organizations|billing|account|attendance|roster|roster-owner|roster-worker|roster-shifts|workforce|shifts|community-shifts|public-shifts|shift-offers|shift-interests|work-notes|calendar-events|calendar-feed|team-calendar|invoices|marketplace|ethical|public-hub|content|talent|rooms|messages|notifications|ratings|rewards|onboarding)(?:\/|\?|$)/i;
const transportName = /^(?:(?:apiClient|axios|httpClient|fetchApi|fetchWithAuth|requestApi)\.(?:get|post|put|patch|delete|request)$|(?:fetch|fetchJson|postJson|fetchWithAuth|fetchApi|apiClient|requestApi)$)/;
// Only raw request escape hatches are violations. Named marketplace operations
// (getAccess, createListing, actOnTransfer, etc.) are already domain methods.
const genericName = /^(?:marketApi|ethicalApi|marketplaceApi\.request|ethicalMarketplaceApi\.request|chemistTaskerApi\.(?:publicContent|contentManagement|marketplace|ethicalMarketplace)\.request)$/;
export function inventoryBoundarySources(sources) {
  const findings = [];
  for (const { path: filename, content } of sources) {
    if (filename.includes('/src/kiosk/') || /^frontend_web\/src\/pages\/attendance\/KioskPage(?:\.runtime)?\.[jt]sx?$/.test(filename) || /\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(filename)) continue;
    const ext = path.extname(filename);
    const kind = ext === '.tsx' ? ts.ScriptKind.TSX : ext === '.jsx' ? ts.ScriptKind.JSX : (ext === '.js' || ext === '.mjs' || ext === '.cjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, kind);
    const aliases = new Map();
    const constants = new Map();
    // Resolve straightforward import, local variable and destructured method aliases.
    // Unknown/dynamic values remain visible as unresolved transport calls.
    function capture(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        const primary = module === 'axios' ? 'axios' : /(?:^|\\/)apiClient(?:\\.[jt]sx?)?$/.test(module) ? 'apiClient' : null;
        if (primary && node.importClause?.name) aliases.set(node.importClause.name.text, primary);
      }
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name)) {
          if (ts.isIdentifier(node.initializer) && constants.has(node.initializer.text))
            constants.set(node.name.text, constants.get(node.initializer.text));
          else if (ts.isStringLiteralLike(node.initializer) || ts.isBinaryExpression(node.initializer) || ts.isTemplateExpression(node.initializer)) {
            const known = routeText(node.initializer, constants);
            if (known) constants.set(node.name.text, known);
          }
          const name = calleeName(node.initializer);
          if (name) {
            const resolved = aliases.get(name) ?? name;
            if (transportName.test(resolved) || resolved === 'axios' || resolved === 'apiClient') aliases.set(node.name.text, resolved);
          }
        } else if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer)) {
          const root = aliases.get(node.initializer.text) ?? node.initializer.text;
          if (root === 'apiClient' || root === 'axios') for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name)) {
              const property = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text;
              if (/^(get|post|put|patch|delete|request)$/.test(property)) aliases.set(element.name.text, root + '.' + property);
            }
          }
        }
      }
      ts.forEachChild(node, capture);
    }
    capture(ast);
    function inspect(node) {
      if (ts.isCallExpression(node)) {
        const called = calleeName(node.expression);
        const first = called?.split('.')[0] ?? '';
        const callee = called ? (aliases.get(called) ?? (aliases.has(first) ? aliases.get(first) + called.slice(first.length) : called)) : null;
        if (callee) {
          const route = routeText(node.arguments[0], constants);
          const escape = genericName.test(callee);
          const transport = transportName.test(callee);
          const direct = !!route && fullDomainRoute.test(route) && (transport || /\.(?:get|post|put|patch|delete|request)$/.test(callee));
          if (escape || direct || transport) {
            const position = ast.getLineAndCharacterOfPosition(node.getStart(ast));
            findings.push({ path: filename, line: position.line + 1, column: position.character + 1,
              kind: escape ? 'generic-client-escape' : direct ? 'direct-backend-route' : 'unresolved-client-transport',
              callee, route });
          }
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
}

// Stable callsite identity: moving lines must not hide architecture debt.
// Duplicate identical calls in one file are disambiguated by occurrence count.
export function classifyBoundaryFindings(findings, manifest = {}) {
  const seen = new Map();
  return findings.map(finding => {
    const signature = [finding.path, finding.kind, finding.callee, finding.route ?? ''].join('|');
    const count = (seen.get(signature) ?? 0) + 1;
    seen.set(signature, count);
    const key = signature + '#' + count;
    const decision = manifest[key] ?? null;
    return { ...finding, key, classification: decision?.classification ?? 'unreviewed',
      owner: decision?.owner ?? null, rationale: decision?.rationale ?? null };
  });
}

export function validateBoundaryManifest(classified, manifest = {}) {
  const allowed = new Set(['approved-adapter', 'legacy-migrate', 'false-positive']);
  const failures = [];
  const keys = new Set(classified.map(finding => finding.key));
  for (const [key, decision] of Object.entries(manifest)) {
    if (!keys.has(key)) failures.push('stale manifest entry: ' + key);
    if (!allowed.has(decision?.classification) || !decision?.owner?.trim() || !decision?.rationale?.trim())
      failures.push('incomplete decision: ' + key);
  }
  for (const finding of classified) {
    if (finding.classification === 'unreviewed') failures.push('unreviewed: ' + finding.key);
    if (finding.classification === 'legacy-migrate') failures.push('migration still required: ' + finding.key);
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const sources = trees.flatMap(tree => visit(path.join(root, tree))).map(filename => ({
        path: path.relative(root, filename).replaceAll('\\', '/'),
        content: fs.readFileSync(filename, 'utf8'),
    }));
    const manifestPath = path.join(root, 'docs/handover/architecture-remediation-2026-10-20/CLIENT_BOUNDARY_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const findings = classifyBoundaryFindings(inventoryBoundarySources(sources), manifest);
    const violations = validateBoundaryManifest(findings, manifest);
    const strict = process.argv.includes('--strict');
    const report = {
        scope: 'runtime Vite, Next and Expo; Windows kiosk, test fixtures and dependencies excluded',
        mode: strict ? 'full-tree review enforcement' : 'AST full-tree inventory, report-only',
        unreviewed: findings.filter(item => item.classification === 'unreviewed').length,
        legacyMigrate: findings.filter(item => item.classification === 'legacy-migrate').length,
        violations,
        limitations: [
            'AST detects multiline calls, but does not fully resolve imported aliases or dynamic route names.',
            'Not an authorization analysis; validate backend and endpoint DTOs separately.',
            'Generated outputs and dependencies are excluded.',
        ],
        scannedFiles: sources.length,
        findings,
    };
    if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
        process.stdout.write(`AST inventory: ${sources.length} runtime Vite, Next and Expo files; ${findings.length} direct or unresolved transports.\n`);
        if (!process.argv.includes('--summary')) for (const finding of findings) {
            process.stdout.write(`${finding.path}:${finding.line} [${finding.kind}] ${finding.callee} ${finding.route ?? ''}\n`);
        }
    }
    if (strict && violations.length) {
        console.error('Full-tree strict boundary gate failed: ' + violations.length + ' unapproved, unfinished or stale callsites.');
        for (const item of violations) console.error(item);
        process.exitCode = 1;
    }
}
