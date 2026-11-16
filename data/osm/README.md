# Manually exported OpenStreetMap data

Used by `scripts/import-sector.ts` when the Overpass API can't be reached from the build machine.
Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).

For a sector `<id>` the script expects two files here:

- `<id>-features.json`: land use, woods, tree rows, water, wetlands, roads, spoil heaps (with geometry)
- `<id>-buildings.json`: building centres and place names

Produce them at https://overpass-turbo.eu with the queries in the slice 3 instructions
(Export → "raw data directly from Overpass API"), then run:

```bash
npx tsx scripts/import-sector.ts <id>
```
