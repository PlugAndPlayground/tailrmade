import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'tailrmade - Help',
  tagline: 'All you need to know about tailrmade',
  favicon: 'img/favicon-32.png',

  // Set the production url of your site here
  url: 'https://help.tailrmade.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/help/',

  organizationName: 'PlugAndPlayground',
  projectName: 'tailrmade',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        blog: false,
        docs: {
          sidebarPath: './sidebars.ts',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  customFields: {
    routes: [
      {
        path: '/',
        component: '@site/docs/index',
        exact: true,
      },
    ],
  },

  themeConfig: {
    // Rest of your themeConfig remains unchanged
    image: './img/docusaurus-social-card.jpg',
    navbar: {
      title: 'tailrmade',
      logo: {
        alt: 'tailrmade Logo',
        src: './img/Tailrmade512.png',
      },
      items: [
        { to: '/about', label: 'About', position: 'left' },
        {
          href: 'https://tailrmade.app/',
          label: 'tailrmade',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Quickstart',
              to: '/docs/quickstart',
            },
            {
              label: 'Workspace Overview',
              to: '/docs/workspace',
            },
            {
              label: 'Keyboard Shortcuts',
              to: '/docs/keyboard-shortcuts',
            },
            {
              label: 'FAQ',
              to: '/docs/faq',
            },
          ],
        },
        {
          title: 'How To',
          items: [
            {
              label: 'Build User Interface',
              to: '/docs/build-user-interface',
            },
            {
              label: 'Create Custom Nodes',
              to: '/docs/custom-nodes',
            },
            {
              label: 'Access APIs',
              to: '/docs/access-apis',
            },
            {
              label: 'Share Your App',
              to: '/docs/share-app',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://discord.gg/JWMsz8vrx4',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/PlugAndPlayground/tailrmade',
            },
            {
              label: 'Bluesky',
              href: 'https://bsky.app/profile/tailrmade.app',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'About',
              to: '/about',
            },

            {
              label: 'Contact',
              href: 'mailto:support@tailrmade.app',
            },
            {
              label: 'Privacy Policy',
              to: '/privacy-policy',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} tailrmade`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],
};

export default config;
