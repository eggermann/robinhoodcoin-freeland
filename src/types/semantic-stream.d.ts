declare module "semantic-stream" {
  export interface SemanticLinkSentences {
    prev?: string[];
    next?: string[];
  }

  export interface SemanticLink {
    title?: string;
    text?: string;
    sentences?: SemanticLinkSentences;
  }

  export interface SemanticWordStream {
    start(): Promise<void>;
    getNext(): Promise<SemanticLink>;
  }

  export interface SemanticStreamDefaultExport {
    WordStream?: new (
      word: string,
      lang?: string,
      options?: Record<string, unknown>,
    ) => SemanticWordStream;
    initStreams?: (...args: unknown[]) => Promise<unknown[]>;
  }

  const semanticStream: SemanticStreamDefaultExport;
  export default semanticStream;
}
