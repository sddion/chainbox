import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '..');
const OUT_FILE = path.join(DOCS_DIR, 'search-index.json');

// Files to index
const FILES = [
    'index.html',
    'guide/getting-started.html',
    'guide/core-concepts.html',
    'guide/execution-context.html',
    'guide/capability-chaining.html',
    'guide/error-handling.html',
    'guide/security.html',
    'guide/supabase-adapter.html',
    'guide/faq.html',
    'reference/capabilities.html'
];

const index = [];

FILES.forEach(file => {
    const fullPath = path.join(DOCS_DIR, file);
    if (!fs.existsSync(fullPath)) return;

    const content = fs.readFileSync(fullPath, 'utf-8');

    // Simple regex to extract title and headings
    const titleMatch = content.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].split(' - ')[0] : file;

    // Extract H1, H2, P text
    const headings = [...content.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)].map(m => m[1].replace(/<[^>]*>/g, ''));

    // Normalize path for web
    const url = file;

    index.push({
        url,
        title,
        content: headings.join(' ') + ' ' + title,
        headings
    });
});

fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2));
console.log(`Search index generated with ${index.length} pages.`);
