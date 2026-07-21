export const lighthouseMetrics = [
    { key: 'lcp',        label: 'Largest Contentful Paint', unit: 'ms', good: 2500,  warn: 4000,  decimals: 0 },
    { key: 'fcp',        label: 'First Contentful Paint',   unit: 'ms', good: 1800,  warn: 3000,  decimals: 0 },
    { key: 'ttfb',       label: 'Time to First Byte',       unit: 'ms', good: 800,   warn: 1800,  decimals: 0 },
    { key: 'tbt',        label: 'Total Blocking Time',      unit: 'ms', good: 200,   warn: 600,   decimals: 0 },
    { key: 'speedIndex', label: 'Speed Index',              unit: 'ms', good: 3400,  warn: 5800,  decimals: 0 },
    { key: 'cls',        label: 'Cumulative Layout Shift',  unit: '',   good: 0.1,   warn: 0.25,  decimals: 3 },
]
