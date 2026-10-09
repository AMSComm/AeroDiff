import React from 'react';
import Prism from 'prismjs';

// Common programming language grammars for Prism
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-markdown';

export function detectLanguage(path?: string | null): string | null {
  if (!path) return null;
  const clean = path.toLowerCase().trim();
  const ext = clean.includes('.') ? clean.split('.').pop() || '' : clean;

  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'json':
      return 'json';
    case 'py':
    case 'pyw':
      return 'python';
    case 'rs':
      return 'rust';
    case 'php':
    case 'phtml':
      return 'php';
    case 'html':
    case 'htm':
    case 'xml':
    case 'svg':
    case 'vue':
    case 'svelte':
      return 'markup';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'sql':
      return 'sql';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'cpp';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return null;
  }
}

/**
 * Maps Prism token types to high-contrast colors compliant with DESIGN.md
 * Strict adherence to Purple Ban (no purple/violet).
 */
function getTokenClass(type: string): string {
  switch (type) {
    case 'keyword':
    case 'boolean':
    case 'important':
      return 'text-sky-400 font-medium';
    case 'operator':
    case 'entity':
    case 'url':
      return 'text-sky-300';
    case 'string':
    case 'char':
    case 'attr-value':
    case 'regex':
      return 'text-emerald-300';
    case 'comment':
    case 'prolog':
    case 'doctype':
    case 'cdata':
      return 'text-neutral-500 italic';
    case 'function':
    case 'class-name':
      return 'text-amber-300 font-semibold';
    case 'number':
      return 'text-amber-400';
    case 'property':
    case 'constant':
    case 'symbol':
    case 'variable':
      return 'text-sky-200';
    case 'punctuation':
      return 'text-neutral-400';
    case 'tag':
      return 'text-rose-400 font-medium';
    case 'attr-name':
      return 'text-amber-300';
    default:
      return 'text-neutral-300';
  }
}

function renderPrismTokens(tokens: (string | Prism.Token)[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof token === 'string') {
      return <span key={key}>{token}</span>;
    }

    const tokenClass = getTokenClass(token.type);

    if (Array.isArray(token.content)) {
      return (
        <span key={key} className={tokenClass}>
          {renderPrismTokens(token.content, `${key}-inner`)}
        </span>
      );
    }

    if (typeof token.content === 'object' && token.content !== null) {
      return (
        <span key={key} className={tokenClass}>
          {renderPrismTokens([token.content as any], `${key}-obj`)}
        </span>
      );
    }

    return (
      <span key={key} className={tokenClass}>
        {String(token.content)}
      </span>
    );
  });
}

/**
 * Highlights a single line of code with Prism.
 * Returns null if language is not supported, allowing caller to render raw text.
 */
export function highlightLineTokens(text: string, language: string | null): React.ReactNode | null {
  if (!language || !text) return null;
  const grammar = Prism.languages[language];
  if (!grammar) return null;

  try {
    const tokens = Prism.tokenize(text, grammar);
    return renderPrismTokens(tokens, 'tok');
  } catch {
    return null;
  }
}
