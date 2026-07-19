import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Manually defined sidebar structure
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'index', // Our root index file
      label: 'Home',
    },
    {
      type: 'doc',
      id: 'quickstart',
      label: 'Quickstart',
    },
    {
      type: 'category',
      label: 'Workspace',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'workspace',
          label: 'Overview',
        },
        {
          type: 'doc',
          id: 'nodes',
          label: 'Nodes',
        },
        {
          type: 'doc',
          id: 'sockets-data-types',
          label: 'Sockets and data types',
        },
      ],
    },
    {
      type: 'category',
      label: 'How to',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'canvas',
          label: 'Use the canvas',
        },
        {
          type: 'doc',
          id: 'inspector',
          label: 'Use the inspector',
        },
        {
          type: 'doc',
          id: 'build-graph',
          label: 'Build the graph',
        },
        {
          type: 'doc',
          id: 'update-behaviour',
          label: 'Update the execution logic',
        },
        {
          type: 'doc',
          id: 'importing-data',
          label: 'Import data',
        },
        {
          type: 'doc',
          id: 'access-apis',
          label: 'Access APIs',
        },
        {
          type: 'doc',
          id: 'custom-nodes',
          label: 'Create custom nodes',
        },
        {
          type: 'doc',
          id: 'macros',
          label: 'Create reusable macros',
        },
        {
          type: 'doc',
          id: 'build-user-interface',
          label: 'Build the user interface',
        },
        {
          type: 'doc',
          id: 'html-nodes',
          label: 'Create custom UI elements',
        },
        {
          type: 'doc',
          id: 'storage-nodes',
          label: 'Use storage & state nodes',
        },
        {
          type: 'doc',
          id: 'signin',
          label: 'Sign in to tailrmade',
        },
        {
          type: 'doc',
          id: 'share-app',
          label: 'Share your app',
        },
        {
          type: 'doc',
          id: 'self-hosting',
          label: 'Self-host tailrmade',
        },
      ],
    },
    {
      type: 'doc',
      id: 'keyboard-shortcuts',
      label: 'Keyboard shortcuts',
    },
    // {
    //   type: 'doc',
    //   id: 'performance',
    //   label: 'Performance',
    // },
    // {
    //   type: 'doc',
    //   id: 'debugging',
    //   label: 'Debugging',
    // },
    // {
    //   type: 'doc',
    //   id: 'common-issues',
    //   label: 'Common issues',
    // },
    // {
    //   type: 'doc',
    //   id: 'error-messages',
    //   label: 'Error messages',
    // },
    {
      type: 'doc',
      id: 'faq',
      label: 'FAQ',
    },
  ],
};

export default sidebars;
