import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/chainbox/',
  title: "Chainbox",
  description: "Execution-first, no APIs.",
  head: [
    ['link', { rel: 'icon', href: '/chainbox/favicon.ico' }],
    // Fonts
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap' }]
  ],
  themeConfig: {
    logo: '/logo.png', 
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Chainbox?', link: '/#what-is-chainbox' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Core Concepts', link: '/guide/core-concepts' }
        ]
      },
      {
        text: 'Developer Guide',
        items: [
            { text: 'Execution Context', link: '/guide/execution-context' },
            { text: 'Server-Side Composition', link: '/guide/capability-chaining' },
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'Security Model', link: '/guide/security' },
            { text: 'Supabase Adapter', link: '/guide/supabase-adapter' }
        ]
      },
      {
        text: 'Reference',
        items: [
           { text: 'Capability Reference', link: '/reference/capabilities' },
           { text: 'FAQ', link: '/guide/faq' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sddion/chainbox' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@sddion/chainbox' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Chainbox'
    }
  }
})
