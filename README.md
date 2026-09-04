# svcei-site

**Open data from the Spring Vale Christian Education Institute** — twenty-two
years of measurement across the United States, published as files you can
download, check, and reuse, alongside the website that draws them.

Released under Creative Commons Attribution 4.0. See `public/cite/` for how to
cite it and for the four conditions of correct use.

## Start here: the data

    public/data/series/*.json     the five indices, 271 monthly windows,
                                  January 2004 to the present, fifty states
    public/data/state/*.json      one file per state
    public/data/market/*.json     one file per Christian Education Market Area
    public/data/schools/*.json    the schools counted in each market area
    public/data/region/*.json     the eight Institute Regions
    public/data/geo/*.json        state, county and market-area boundaries
    public/data/reports.json      every published volume, with its address
    public/data/manifest.json     the index to all of the above

Each series file carries two numbers for every state in every month:

* `rank` — where that state stood among the fifty, 1 to 50
* `ratio` — that state as a multiple of the median state that month

**A reading is a position, not a count.** It says where a state stands against
the other forty-nine in the same month; it is never a quantity of children,
schools, or enrollments, and a movement is a change in standing rather than
growth or decline in anything. Index levels are not published, in any form. A
ratio is comparable across the whole series in a way a level is not.

## Two things that are NOT in this repository

They are open, and they are simply too large to carry here.

    every figure as CSV      https://springvale.institute/data/
                             e.g. /data/michigan-2026-07.csv
    every published volume   https://reports.springvale.institute/
                             e.g. /A1_monthly_release_2026-07.pdf

`public/data/reports.json` lists every volume with its address, and
`public/reports/` is the same list as a page.

## The website, and why it is here too

    public/          the site as served — 355 pages
    public/assets/   svcei.js draws every chart; svcei.css styles it
    .github/         an integrity check that runs before a change merges

Pages carry no figures. Every number a reader sees is fetched at run time from
JSON under `public/data/` and drawn by `public/assets/svcei.js`. That is
deliberate: the previous site carried its figures in HTML, so a correction had
to be made in as many places as the figure appeared, and one of them was always
missed.

The site is included so that the **drawing code sits beside the data it draws**.
Anyone can check our figures from `public/data/` alone; with `svcei.js` here as
well, they can also check that a published chart shows what its file says. For
an institute whose argument is that you need not take its word, that is part of
the argument rather than decoration.

## What is deliberately withheld, and why

The generators, the gates, and the measurement pipeline are not here and will
not be. Nor is the list of constituents the indices are built from, nor the
provider of the underlying signal.

**Publish outputs. Never publish inputs.** Everything needed to read, check,
recompute, and argue with the Institute's figures is in this repository and in
the two archives above. Nothing here would let a reader rebuild the instrument.
This is the distinction a central bank draws between publishing an index and
publishing its basket weights, and it is stated on the methodology page rather
than left to be discovered.

## Publishing a release

The site is generated in the Institute's pipeline, checked there against twelve
gates, and the finished `public/` tree is committed here. Cloudflare serves it.
There is no build step on the host and none in this repository — the check under
`.github/` confirms that every data file parses, that the manifest is whole, and
that no internal link points at a file that is not committed.

**This repository is pushed whenever the site is deployed, never separately.**
A mirror that lags is worse than no mirror: it tells a reader the archive holds
one number of volumes when it holds another.

## License

Everything published here is released under Creative Commons Attribution 4.0
International. See `public/cite/index.html` for how to cite it and for the four
conditions of correct use.

The indices measure relative position. They are not counts of children, schools,
or enrollments, and a movement in one is a change in standing rather than growth
or decline in any quantity.
