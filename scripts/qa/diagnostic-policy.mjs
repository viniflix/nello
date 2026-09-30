export function relevantDiagnostic(line) {
  return /not wrapped in act|Each child in a list should have a unique|defaultProps.*(?:removed|deprecated)|validateDOMNesting|Invalid DOM property|does not recognize the .* prop|cannot be a (?:child|descendant) of|changing an uncontrolled|changing a controlled|state update on an unmounted|Warning:.*(?:unique.*key|unrecognized)|CssSyntaxError|\[postcss\].*(?:Error|error)/i.test(line);
}
