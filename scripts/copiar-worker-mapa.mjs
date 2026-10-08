// Copia o "worker" do MapLibre (o mapa) para public/vendor, de onde o
// navegador consegue baixá-lo. Roda sozinho antes de `npm run dev` e
// `npm run build`, então fica sempre na mesma versão do pacote instalado.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pasta = path.dirname(require.resolve("maplibre-gl/package.json"));
const origem = path.join(pasta, "dist", "maplibre-gl-worker.mjs");
const destino = path.join(process.cwd(), "public", "vendor", "maplibre-gl-worker.mjs");

mkdirSync(path.dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log("Mapa: worker do MapLibre copiado para public/vendor/");
