/**
 * UI Enhancements: Pagination, Table of Contents, Tabs, Mobile Menu
 */

// --- Configuration ---
const SIDEBAR_ORDER = [
    { title: "Getting Started", url: "getting-started.html", path: "guide/getting-started.html" },
    { title: "Core Concepts", url: "core-concepts.html", path: "guide/core-concepts.html" },
    { title: "Architecture", url: "architecture.html", path: "guide/architecture.html" },
    { title: "Client SDK", url: "client-sdk.html", path: "guide/client-sdk.html" },
    { title: "Execution Context", url: "execution-context.html", path: "guide/execution-context.html" },
    { title: "Capability Chaining", url: "capability-chaining.html", path: "guide/capability-chaining.html" },
    { title: "Error Handling", url: "error-handling.html", path: "guide/error-handling.html" },
    { title: "Security", url: "security.html", path: "guide/security.html" },
    { title: "Supabase Adapter", url: "supabase-adapter.html", path: "guide/supabase-adapter.html" },
    { title: "FAQ", url: "faq.html", path: "guide/faq.html" },
    { title: "Capabilities", url: "../reference/capabilities.html", path: "reference/capabilities.html" }
];

// --- 1. Pagination ---
function injectPagination() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    // Normalize matching by checking if item.url ends with the current filename
    const currentIndex = SIDEBAR_ORDER.findIndex(item => item.url.endsWith(currentPath));

    if (currentIndex === -1) {
        console.warn("Pagination: Current page not found in SIDEBAR_ORDER", currentPath);
        return;
    }

    const prev = SIDEBAR_ORDER[currentIndex - 1];
    const next = SIDEBAR_ORDER[currentIndex + 1];

    const container = document.getElementById('pagination-container');
    if (!container) return;

    let html = '<div class="flex justify-between items-center mt-16 pt-8 border-t border-white/5">';

    // Previous Link
    if (prev) {
        html += `
            <a href="${prev.url}" class="group flex flex-col gap-1 text-sm text-gray-400 hover:text-white transition-colors">
                <span class="text-xs text-gray-500 font-medium">Previous</span>
                <span class="font-medium text-brand group-hover:text-brand-light transition-colors">← ${prev.title}</span>
            </a>
        `;
    } else {
        html += '<div></div>'; // Spacer
    }

    // Next Link
    if (next) {
        html += `
            <a href="${next.url}" class="group flex flex-col gap-1 text-sm text-gray-400 hover:text-white text-right transition-colors">
                <span class="text-xs text-gray-500 font-medium">Next</span>
                <span class="font-medium text-brand group-hover:text-brand-light transition-colors">${next.title} →</span>
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
    if (headings.length === 0) {
        if (tocContainer.parentElement) tocContainer.parentElement.removeChild(tocContainer);
        return;
    }

    // Use Sticky positioning relative to the container
    let html = `
        <div class="sticky top-24 w-64 hidden xl:block pl-6 ml-6 border-l border-white/5 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
            <h5 class="text-xs font-bold text-white uppercase tracking-wider mb-4">On this page</h5>
            <ul class="space-y-2.5 text-sm">
    `;

    headings.forEach((heading, index) => {
        const id = heading.id || `heading-${index}`;
        heading.id = id;

        const isH3 = heading.tagName === 'H3';
        const indentClass = isH3 ? 'pl-4 border-l border-white/5' : '';
        const activeClass = 'text-gray-500 hover:text-gray-300 transition-colors duration-200';

        html += `
            <li class="${indentClass}">
                <a href="#${id}" class="block py-0.5 ${activeClass}" data-target="${id}">${heading.innerText}</a>
            </li>
        `;
    });

    html += `
            </ul>
        </div>
    `;

    tocContainer.innerHTML = html;

    // ScrollSpy Logic
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                document.querySelectorAll('#toc-container a').forEach(link => {
                    link.classList.remove('text-brand', 'font-medium');
                    link.classList.add('text-gray-500');
                    if (link.dataset.target === id) {
                        link.classList.remove('text-gray-500');
                        link.classList.add('text-brand', 'font-medium');
                    }
                });
            }
        });
    }, { rootMargin: '-10% 0px -80% 0px' });

    headings.forEach(h => observer.observe(h));
}

// --- 3. Code Tabs (npm, pnpm, yarn) ---
function initTabs() {
    const tabGroups = document.querySelectorAll('.code-tabs');

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

// --- 4. Mobile Menu Toggle ---
function initMobileMenu() {
    const trigger = document.getElementById('mobile-menu-trigger');
    const close = document.getElementById('mobile-menu-close');
    const menu = document.getElementById('mobile-menu');

    if (!trigger || !close || !menu) return;

    trigger.addEventListener('click', () => {
        menu.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    });

    close.addEventListener('click', () => {
        menu.classList.add('hidden');
        document.body.style.overflow = '';
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    injectPagination();
    generateTOC();
    initTabs();
    initMobileMenu();
});
