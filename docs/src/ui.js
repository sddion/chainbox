/**
 * UI Enhancements: Pagination, Table of Contents, Tabs
 */

// --- Configuration ---
const SIDEBAR_ORDER = [
    { title: "Getting Started", url: "getting-started.html", path: "guide/getting-started.html" },
    { title: "Core Concepts", url: "core-concepts.html", path: "guide/core-concepts.html" },
    { title: "Execution Context", url: "execution-context.html", path: "guide/execution-context.html" },
    { title: "Capability Chaining", url: "capability-chaining.html", path: "guide/capability-chaining.html" },
    { title: "Error Handling", url: "error-handling.html", path: "guide/error-handling.html" },
    { title: "Security", url: "security.html", path: "guide/security.html" },
    { title: "Supabase Adapter", url: "supabase-adapter.html", path: "guide/supabase-adapter.html" },
    { title: "FAQ", url: "faq.html", path: "guide/faq.html" },
    { title: "Capabilities", url: "../reference/capabilities.html", path: "reference/capabilities.html" } // specific handling maybe needed
];

// --- 1. Pagination ---
function injectPagination() {
    const currentPath = window.location.pathname.split('/').pop();
    const currentIndex = SIDEBAR_ORDER.findIndex(item => currentPath.endsWith(item.url));

    if (currentIndex === -1) return;

    const prev = SIDEBAR_ORDER[currentIndex - 1];
    const next = SIDEBAR_ORDER[currentIndex + 1];

    const container = document.getElementById('pagination-container');
    if (!container) return;

    let html = '<div class="flex justify-between items-center mt-12 pt-8 border-t border-white/5">';

    // Previous Link
    if (prev) {
        html += `
            <a href="${prev.url}" class="group flex flex-col gap-1 text-sm text-gray-400 hover:text-white transition-colors">
                <span class="text-xs text-gray-500">Previous</span>
                <span class="font-medium text-brand group-hover:text-brand-light">← ${prev.title}</span>
            </a>
        `;
    } else {
        html += '<div></div>'; // Spacer
    }

    // Next Link
    if (next) {
        html += `
            <a href="${next.url}" class="group flex flex-col gap-1 text-sm text-gray-400 hover:text-white text-right transition-colors">
                <span class="text-xs text-gray-500">Next</span>
                <span class="font-medium text-brand group-hover:text-brand-light">${next.title} →</span>
            </a>
        `;
    } else {
        html += '<div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
}

// --- 2. Table of Contents (On This Page) ---
function generateTOC() {
    const tocContainer = document.getElementById('toc-container');
    if (!tocContainer) return;

    const headings = document.querySelectorAll('article h2, article h3');
    if (headings.length === 0) return;

    let html = `
        <div class="fixed w-64 hidden xl:block pl-8 border-l border-white/5 right-6 top-24 h-[calc(100vh-6rem)] overflow-y-auto">
            <h5 class="text-xs font-bold text-white uppercase tracking-wider mb-4">On this page</h5>
            <ul class="space-y-3 text-sm">
    `;

    headings.forEach((heading, index) => {
        const id = heading.id || `heading-${index}`;
        heading.id = id;

        const isH3 = heading.tagName === 'H3';
        const indentClass = isH3 ? 'pl-4' : '';
        const activeClass = index === 0 ? 'text-brand' : 'text-gray-500 hover:text-gray-300';

        html += `
            <li class="${indentClass}">
                <a href="#${id}" class="block transition-colors ${activeClass}">${heading.innerText}</a>
            </li>
        `;
    });

    html += `
            </ul>
        </div>
    `;

    tocContainer.innerHTML = html;
}

// --- 3. Code Tabs (npm, pnpm, yarn) ---
function initTabs() {
    const tabGroups = document.querySelectorAll('.code-tabs'); // We will add this class to HTML

    tabGroups.forEach(group => {
        const buttons = group.querySelectorAll('button[data-tab]');
        const panels = group.querySelectorAll('div[data-panel]');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;

                // Update Buttons
                buttons.forEach(b => {
                    if (b.dataset.tab === target) {
                        b.classList.add('text-white', 'bg-white/5', 'border-r', 'border-white/5');
                        b.classList.remove('text-gray-500', 'hover:text-gray-300');
                    } else {
                        b.classList.remove('text-white', 'bg-white/5', 'border-r', 'border-white/5');
                        b.classList.add('text-gray-500', 'hover:text-gray-300');
                    }
                });

                // Update Panels
                panels.forEach(p => {
                    if (p.dataset.panel === target) {
                        p.classList.remove('hidden');
                    } else {
                        p.classList.add('hidden');
                    }
                });
            });
        });
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    injectPagination();
    generateTOC();
    initTabs();
});
