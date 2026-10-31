// Read-only catalogue query. No third-party scripts are downloaded or executed.
const headers = { 'User-Agent': 'UninvitedGuests-GameJam/1.0 (local asset preparation)' };
async function json(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
if (process.argv[2] === 'files') {
  for (const id of process.argv.slice(3)) {
    const files = await json(`https://api.polyhaven.com/files/${id}`);
    console.log(JSON.stringify({ id, keys: Object.keys(files), gltf: files.gltf?.['1k'], diffuse: files.diff?.['1k'], normal: files.nor_gl?.['1k'], rough: files.rough?.['1k'] }));
  }
  process.exit(0);
}
const type = process.argv[2] || 'models';
const assets = await json(`https://api.polyhaven.com/assets?t=${type}`);
const pattern = type === 'models' ? /chair|sofa|television|tv_|table|cabinet|vase|cardboard|lamp|book|hammer/iu : /wood_floor|plaster|wallpaper|parquet/iu;
for (const [id, item] of Object.entries(assets)) {
  if (pattern.test(id) && (type !== 'models' || item.polycount < 25000)) {
    console.log(JSON.stringify({ id, polys: item.polycount, dimensions: item.dimensions, authors: item.authors }));
  }
}
