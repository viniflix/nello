export function relevantDiagnostic(line) {
  return /Warning:.*(?:not wrapped in act|Each child|unique.*key|defaultProps|validateDOMNesting|unrecognized|does not recognize|changing an uncontrolled)|CssSyntaxError|\[postcss\].*(?:Error|error)/i.test(line);
}
