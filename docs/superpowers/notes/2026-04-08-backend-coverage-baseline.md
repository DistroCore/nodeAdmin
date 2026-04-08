# Backend Coverage Baseline

Date: 2026-04-08

Command:

```bash
npm run test:coreApi -- --coverage
```

Overall baseline: statements 79.87%, branches 71.05%, functions 75.91%, lines 79.45%.

Priority chains for `T-P5-BE-02`:

- `modules/auth`: 86.39% statements
- `modules/im` + `modules/im/services`: 45.40% / 67.47% statements
- `infrastructure/audit`: 58.66% statements
- `modules/plugin`: 84.95% statements

| Scope                        | Statements | Branches | Functions |   Lines | Covered / Total |
| ---------------------------- | ---------: | -------: | --------: | ------: | --------------: |
| **tests**/helpers            |     93.54% |   87.50% |    85.71% |  96.66% |         29 / 31 |
| app                          |     75.60% |   78.84% |    81.81% |  75.00% |         31 / 41 |
| infrastructure               |     82.29% |   79.16% |    78.57% |  83.14% |         79 / 96 |
| infrastructure/audit         |     58.66% |   51.42% |    60.00% |  60.29% |         44 / 75 |
| infrastructure/database      |     54.12% |   54.44% |    32.83% |  53.26% |       105 / 194 |
| infrastructure/observability |    100.00% |  100.00% |   100.00% | 100.00% |         15 / 15 |
| infrastructure/outbox        |     68.67% |   54.83% |    42.85% |  68.29% |         57 / 83 |
| infrastructure/resilience    |     92.74% |   85.71% |    88.88% |  92.59% |       179 / 193 |
| infrastructure/security      |    100.00% |   93.33% |   100.00% | 100.00% |         31 / 31 |
| infrastructure/tenant        |     93.93% |   80.00% |   100.00% |  93.54% |         31 / 33 |
| modules/auth                 |     86.39% |   80.29% |    81.57% |  87.17% |       254 / 294 |
| modules/backlog              |     93.36% |   89.09% |   100.00% |  92.75% |       211 / 226 |
| modules/console              |     55.79% |   51.04% |    64.28% |  54.96% |        77 / 138 |
| modules/health               |    100.00% |   83.33% |   100.00% | 100.00% |         48 / 48 |
| modules/im                   |     45.40% |   38.23% |    29.62% |  45.02% |        89 / 196 |
| modules/im/dto               |    100.00% |  100.00% |   100.00% | 100.00% |         29 / 29 |
| modules/im/guards            |     94.87% |   82.14% |   100.00% |  94.73% |         37 / 39 |
| modules/im/services          |     67.47% |   47.54% |    66.66% |  67.60% |       222 / 329 |
| modules/menus                |     93.54% |   87.93% |    95.45% |  92.66% |       116 / 124 |
| modules/modernizer           |     91.27% |   75.00% |    88.23% |  91.97% |       136 / 149 |
| modules/permissions          |     96.29% |   83.33% |   100.00% |  95.45% |         26 / 27 |
| modules/plugin               |     84.95% |   75.98% |    93.18% |  84.67% |       367 / 432 |
| modules/roles                |     93.02% |   82.69% |   100.00% |  92.03% |       120 / 129 |
| modules/tenants              |     96.73% |   94.44% |   100.00% |  96.20% |         89 / 92 |
| modules/users                |     88.78% |   71.73% |   100.00% |  87.62% |        95 / 107 |
