import spec from '../../docs/SPEC.md?raw';
import architecture from '../../docs/ARCHITECTURE.md?raw';
import roadmap from '../../docs/ROADMAP.md?raw';
import benchmarks from '../../docs/BENCHMARKS.md?raw';
import adr0001 from '../../docs/adr/0001-record-architecture-decisions.md?raw';
import adr0002 from '../../docs/adr/0002-sparse-set-component-storage.md?raw';
import adr0003 from '../../docs/adr/0003-canvas2d-before-webgl.md?raw';
import adr0004 from '../../docs/adr/0004-fixed-timestep-loop.md?raw';
import adr0005 from '../../docs/adr/0005-jsdoc-types-no-typescript.md?raw';
import adr0006 from '../../docs/adr/0006-vertical-slice-milestones.md?raw';
import adr0007 from '../../docs/adr/0007-warm-started-sequential-impulses.md?raw';
import adr0008 from '../../docs/adr/0008-body-type-is-mass-authority.md?raw';

/**
 * Every doc page, sourced directly from `docs/*.md` via Vite's `?raw` import — there is no
 * separate "docs site content" to fall out of sync with the actual `docs/` folder engineers
 * read; this page renders the same files.
 * @type {Array<{ slug: string, title: string, markdown: string }>}
 */
export const DOCS = [
  { slug: 'spec', title: 'SPEC', markdown: spec },
  { slug: 'architecture', title: 'Architecture', markdown: architecture },
  { slug: 'roadmap', title: 'Roadmap', markdown: roadmap },
  { slug: 'benchmarks', title: 'Benchmarks', markdown: benchmarks },
  { slug: 'adr-0001', title: 'ADR 1 — Record architecture decisions', markdown: adr0001 },
  { slug: 'adr-0002', title: 'ADR 2 — Sparse-set component storage', markdown: adr0002 },
  { slug: 'adr-0003', title: 'ADR 3 — Canvas2D before WebGL', markdown: adr0003 },
  { slug: 'adr-0004', title: 'ADR 4 — Fixed-timestep loop', markdown: adr0004 },
  { slug: 'adr-0005', title: 'ADR 5 — JSDoc types, no TypeScript', markdown: adr0005 },
  { slug: 'adr-0006', title: 'ADR 6 — Vertical-slice milestones', markdown: adr0006 },
  { slug: 'adr-0007', title: 'ADR 7 — Warm-started sequential impulses', markdown: adr0007 },
  { slug: 'adr-0008', title: 'ADR 8 — Body type is mass authority', markdown: adr0008 },
];
