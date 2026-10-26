type DiffRow = { left: string | null; right: string | null; kind: 'same' | 'removed' | 'added' };


export function diffLines(previous: string, current: string): DiffRow[] {
  const left = previous.split('\n');
  const right = current.split('\n');
  if (left.length * right.length > 300_000) {
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
    return [
      ...left.slice(0, prefix).map((line) => ({ left: line, right: line, kind: 'same' as const })),
      ...left.slice(prefix, left.length - suffix).map((line) => ({ left: line, right: null, kind: 'removed' as const })),
      ...right.slice(prefix, right.length - suffix).map((line) => ({ left: null, right: line, kind: 'added' as const })),
      ...left.slice(left.length - suffix).map((line, index) => ({ left: line, right: right[right.length - suffix + index] ?? '', kind: 'same' as const })),
    ];
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = left[i] === right[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ left: left[i], right: right[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ left: left[i], right: null, kind: 'removed' });
      i += 1;
    } else {
      rows.push({ left: null, right: right[j], kind: 'added' });
      j += 1;
    }
  }
  while (i < left.length) rows.push({ left: left[i++], right: null, kind: 'removed' });
  while (j < right.length) rows.push({ left: null, right: right[j++], kind: 'added' });
  return rows;
}

