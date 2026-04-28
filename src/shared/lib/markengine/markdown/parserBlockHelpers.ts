// Barrel — re-exports for backward compatibility
export type { ParseContext } from './parserBlockContext';
export { peek, advance } from './parserBlockContext';
export {
  isThematicBreak, isSetextHeading,
  parseFencedCode, parseMathBlock,
  HTML_BLOCK_TAGS, isHtmlBlockTag, parseHtmlBlock,
  listStartPattern, parseIndentedCode,
  isTableStart, parseTable,
  parseParagraph,
} from './parserBlockParsers';
