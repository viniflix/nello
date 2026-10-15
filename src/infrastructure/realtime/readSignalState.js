// Local ordering metadata only. No server payload, user content or telemetry.
let sequence = 0;
export const nextReadSignal = () => ++sequence;
export const currentReadSignal = () => sequence;
