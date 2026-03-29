declare module 'svg-parser' {
  interface SvgNode {
    type: string;
    tagName?: string;
    properties?: Record<string, string | number>;
    children?: SvgNode[];
    value?: string;
  }
  export function parse(svg: string): SvgNode;
}

declare module 'dxf-parser' {
  class DxfParser {
    parseSync(dxfString: string): any;
  }
  export default DxfParser;
}

declare module 'svgpath' {
  interface SvgPath {
    scale(sx: number, sy?: number): SvgPath;
    translate(tx: number, ty: number): SvgPath;
    abs(): SvgPath;
    toString(): string;
  }
  function svgpath(path: string): SvgPath;
  export default svgpath;
}
