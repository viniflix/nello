import React from 'react';

export default function FinancialChartData({ label, columns, rows }) {
  return <details className="mt-4 rounded-xl border border-border">
    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</summary>
    <div role="region" aria-label={label} tabIndex={0} className="max-h-64 overflow-auto rounded-b-xl border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <table className="w-full min-w-[280px] text-left text-xs tabular-nums"><caption className="sr-only">{label}</caption><thead><tr>{columns.map(column => <th scope="col" key={column} className="px-3 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-border">{row.map((value, cell) => cell === 0 ? <th scope="row" key={cell} className="px-3 py-2 font-normal [overflow-wrap:anywhere]">{value}</th> : <td key={cell} className="px-3 py-2">{value}</td>)}</tr>)}</tbody></table>
    </div>
  </details>;
}
