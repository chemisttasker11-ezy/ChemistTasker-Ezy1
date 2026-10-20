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

const root = path.resolve(import.meta.dirname, '..');
const trees = ['frontend_web/src', 'frontend_web/landing_next', 'frontend_mobile'];
const ignored = new Set(['node_modules', 'dist', 'build', '.next', '.expo', 'coverage', '.git']);
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
        else if (allowedExt.has(path.extname(entry.name))) output.push(full);
    }
    return output;
}

export function inventoryBoundarySources(sources) {
    const findings = [];
    for (const { path: filename, content } of sources) {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
            const text = line.trim();
            if (!text || text.startsWith('//') || text.startsWith('*')) return;
            const inlineRoute = route.test(line);
            const directCall = directTransport.test(line);
            const escapeHatch = clientEscape.test(line);
            if (escapeHatch || (inlineRoute && directCall)) {
                findings.push({
                    path: filename,
                    line: index + 1,
                    kind: escapeHatch ? 'generic-client-escape' : 'direct-backend-route',
                    evidence: text.slice(0, 200),
                });
            }
        });
    }
    return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const sources = trees.flatMap(tree => visit(path.join(root, tree))).map(filename => ({
        path: path.relative(root, filename).replaceAll('\\', '/'),
        content: fs.readFileSync(filename, 'utf8'),
    }));
    const findings = inventoryBoundarySources(sources);
    const report = {
        scope: 'full tracked-like tree (including any untracked source files)',
        mode: 'report-only',
        limitations: [
            'Line-based patterns cannot reliably resolve imported API aliases or multiline calls.',
            'Not an authorization analysis; validate backend and endpoint DTOs separately.',
            'Generated outputs and dependencies are excluded.',
        ],
        scannedFiles: sources.length,
        findings,
    };
    if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
        process.stdout.write(`Scanned ${sources.length} client source files; ${findings.length} probable boundary issues.\n`);
        for (const finding of findings) {
            process.stdout.write(`${finding.path}:${finding.line} [${finding.kind}] ${finding.evidence}\n`);
        }
    }
}
