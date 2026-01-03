// Search Logic
let searchIndex = [];

async function loadIndex() {
    // Current path check to handle relative loading
    const isRoot = !window.location.pathname.includes('/guide/') && !window.location.pathname.includes('/reference/');
    const pathPrefix = isRoot ? '.' : '..';

    try {
        const res = await fetch(`${pathPrefix}/search-index.json`);
        searchIndex = await res.json();
    } catch (e) {
        console.error("Failed to load search index", e);
    }
}

function injectModal() {
    const modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.className = 'fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden flex items-start justify-center pt-24 opacity-0 transition-opacity duration-200';
    modal.innerHTML = `
        <div class="w-full max-w-2xl bg-bg-alt border border-white/10 rounded-xl shadow-2xl transform scale-95 transition-transform duration-200" id="search-content">
            <div class="flex items-center border-b border-white/5 p-4 gap-3">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input type="text" id="search-input" class="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 font-medium" placeholder="Search documentation..." autocomplete="off">
                <button id="close-search" class="text-xs bg-white/10 px-1.5 py-0.5 rounded border border-white/5 text-gray-400 hover:text-white">ESC</button>
            </div>
            <div id="search-results" class="max-h-[60vh] overflow-y-auto p-2">
                <!-- Results go here -->
                <div class="p-8 text-center text-gray-500 text-sm">Type to search...</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Event Listeners
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    const trigger = document.getElementById('search-trigger');
    const closeBtn = document.getElementById('close-search');

    function open() {
        if (searchIndex.length === 0) loadIndex();
        modal.classList.remove('hidden');
        // Trigger reflow
        void modal.offsetWidth;
        modal.classList.remove('opacity-0');
        modal.querySelector('#search-content').classList.remove('scale-95');
        modal.classList.add('scale-100');
        input.focus();
        document.body.style.overflow = 'hidden';
    }

    function close() {
        modal.classList.add('opacity-0');
        modal.classList.remove('scale-100');
        modal.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }, 200);
    }

    if (trigger) trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            open();
        }
        if (e.key === 'Escape') close();
    });

    // Search Logic
    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            resultsContainer.innerHTML = '<div class="p-8 text-center text-gray-500 text-sm">Type to search...</div>';
            return;
        }

        const matches = searchIndex.filter(page => {
            return page.title.toLowerCase().includes(query) ||
                page.content.toLowerCase().includes(query);
        });

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">No results found.</div>';
            return;
        }

        const isRoot = !window.location.pathname.includes('/guide/') && !window.location.pathname.includes('/reference/');
        const pathPrefix = isRoot ? '.' : '..'; // Hacky but works for this structure

        resultsContainer.innerHTML = matches.map(page => `
            <a href="${pathPrefix}/${page.url}" class="block p-3 rounded-lg hover:bg-white/5 group transition-colors">
                <div class="text-brand font-medium group-hover:text-brand-light">${page.title}</div>
                <div class="text-xs text-gray-500 mt-1 truncate">${page.headings[0] || ''}</div>
            </a>
        `).join('');
    });
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectModal);
} else {
    injectModal();
}
