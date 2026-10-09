import React from 'react';

// Brand illustrations describe a benefit; they do not impersonate product UI.
export default function FeatureBenefitArt({ kind }) {
  return <svg className={`feature-benefit-art feature-benefit-art-${kind}`} viewBox="0 0 180 180" aria-hidden="true" focusable="false" fill="none">
    {kind === 'plan' && <>
      <circle cx="90" cy="90" r="70" className="feature-art-orbit" />
      <circle cx="90" cy="90" r="47" className="feature-art-fill" />
      <circle cx="90" cy="90" r="37" className="feature-art-line" />
      <g className="feature-art-detail"><path d="M74 105c-2-25 12-39 37-38 2 25-12 39-37 38Z" className="feature-art-accent" /><path d="m72 111 28-31" className="feature-art-line" /></g>
      <path d="M29 58v30m-7-30v16c0 10 14 10 14 0V58m-7 30v34m123-64c-12 10-13 24-13 32h13m0-32v64" className="feature-art-line" />
      <circle cx="135" cy="37" r="7" className="feature-art-dot" />
    </>}
    {kind === 'context' && <>
      <path d="M90 86 40 39m50 47 51-39m-51 39-47 56m47-56 51 54" className="feature-art-orbit" />
      <circle cx="90" cy="86" r="35" className="feature-art-fill" />
      <circle cx="90" cy="77" r="10" className="feature-art-line" /><path d="M72 106c0-19 36-19 36 0" className="feature-art-line" />
      <g className="feature-art-detail"><circle cx="40" cy="39" r="16" className="feature-art-accent" /><path d="m33 39 5 5 9-10" className="feature-art-line" /><circle cx="141" cy="47" r="19" className="feature-art-fill" /><path d="M133 42h16m-16 8h11" className="feature-art-line" /></g>
      <circle cx="43" cy="142" r="13" className="feature-art-fill" /><circle cx="141" cy="140" r="17" className="feature-art-accent" /><path d="M141 132v16m-8-8h16" className="feature-art-line" />
    </>}
    {kind === 'progress' && <>
      <path d="M25 139c32 0 18-61 60-61s20-43 65-43" className="feature-art-orbit" />
      <path d="M25 139c32 0 18-61 60-61s20-43 65-43" className="feature-art-route" pathLength="100" />
      <circle cx="25" cy="139" r="11" className="feature-art-fill" /><circle cx="85" cy="78" r="17" className="feature-art-fill" />
      <g className="feature-art-detail"><circle cx="150" cy="35" r="23" className="feature-art-accent" /><path d="m139 35 7 7 14-15" className="feature-art-line" /></g>
      <path d="M107 138h39m-39 9h25" className="feature-art-line feature-art-muted" /><circle cx="38" cy="52" r="6" className="feature-art-dot" />
    </>}
    {kind === 'agenda' && <>
      <circle cx="91" cy="90" r="70" className="feature-art-orbit" />
      <rect x="39" y="45" width="102" height="100" rx="18" className="feature-art-fill" /><path d="M39 76h102M64 34v25m52-25v25" className="feature-art-line" />
      <circle cx="65" cy="99" r="4" className="feature-art-dot" /><circle cx="91" cy="99" r="4" className="feature-art-dot" /><circle cx="65" cy="123" r="4" className="feature-art-dot" />
      <g className="feature-art-detail"><circle cx="132" cy="134" r="25" className="feature-art-accent" /><path d="m121 134 7 7 14-15" className="feature-art-line" /></g>
    </>}
  </svg>;
}
