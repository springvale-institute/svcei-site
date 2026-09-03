# springvale-institute

The website of the Spring Vale Christian Education Institute, as served.

## What is here

    public/     the site as served: pages, data, exports, and published PDFs
    .github/    an integrity check that runs before a change merges

The generators, the gates, and the measurement pipeline are not in this
repository and will not be. Everything needed to read, check, and reuse the
Institute's figures is under `public/data`.

## How the site works

Pages carry no figures. Every number a reader sees is fetched at run time from
JSON under `public/data/` and rendered by `public/assets/svcei.js`. That is
deliberate: the previous site carried its figures in HTML, so a correction had
to be made in as many places as the figure appeared, and one of them was always
missed.

Three consequences follow, and they are the reasons for the design:

* A monthly release changes data files and no pages.
* The same figure cannot appear differently on two pages, because there is one
  copy of it.
* The site and the published reports read the same series, so they cannot
  disagree.

## The data

Everything on this site is published beside it as a file you can download.

    public/data/series/*.json     the five index series, 2004 to the present:
                                  rank and multiple of the median state
    public/data/manifest.json     states, Regions, indices, windows
    public/data/*.json            every payload the pages read at run time

Two things a reader may want are deliberately NOT in this repository, because
they are too large to carry here and never change once written. They are served
from the Institute's archive and are open to anyone:

    every figure as CSV           https://springvale.institute/data/
                                  e.g. /data/michigan-2026-07.csv
    every published volume        https://reports.springvale.institute/
                                  e.g. /A1_monthly_release_2026-07.pdf

`public/reports/index.html` lists every volume with its address.

Index values are relative positions. They are not counts of children, schools,
or enrollments.

## Publishing a monthly release

The site is generated in the Institute's pipeline, checked there against twelve
gates, and the finished `public/` tree is committed here. Cloudflare serves it on
push to `main`. There is no build step on the host and none in this repository.

## License

Everything published here is released under Creative Commons Attribution 4.0
International. See `public/cite/index.html` for how to cite it and for the four
conditions of correct use.

The indices measure relative position. They are not counts of children, schools,
or enrollments, and a movement in an index is a change in standing rather than
growth or decline in any quantity.
