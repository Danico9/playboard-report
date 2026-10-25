// Sustituto de node:url: en el navegador no hay import.meta.url de fichero (la ruta la fija PLAYBOARD_ROOT)
export const fileURLToPath = () => '/web/scripts/ingest-reports.mjs'
export default { fileURLToPath }
