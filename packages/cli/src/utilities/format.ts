import prettier from 'prettier';

const PRETTIER_CONFIG = {
  ...require('@shopify/prettier-config'),
};

export function formatFile(content: string) {
  const formattedContent = prettier.format(content, PRETTIER_CONFIG);

  return formattedContent;
}
