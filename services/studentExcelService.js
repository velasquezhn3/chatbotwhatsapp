/**
 * Módulo para descargar y cachear el archivo Excel desde un enlace público.
 * Implementa descarga directa con axios, parseo con exceljs,
 * caché en memoria con actualización automática cada 60 minutos,
 * manejo de errores con reintentos y logging con timestamps.
 */

const axios = require('axios');
const ExcelJS = require('exceljs');

const EXCEL_URL = 'https://www.dropbox.com/scl/fi/be1f5zgppiijqvsus0qor/CUENTAS-A-O-2025-IJCV.xlsx?rlkey=zriuxv8yk3l7ho4ky6vz85jbg&e=2&st=c6tuewcy&dl=1';
const CACHE_REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutos
const MAX_RETRIES = 3;

let cachedWorkbook = null;
let lastFetchTime = 0;

/**
 * Función para descargar el archivo Excel desde la URL pública con reintentos.
 */
async function downloadExcelWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Intentando descargar archivo Excel (intento ${attempt})...`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000 // 15 segundos timeout
      });
      console.log(`[${new Date().toISOString()}] Descarga exitosa.`);
      return response.data;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error en descarga intento ${attempt}: ${error.message}`);
      if (attempt === retries) {
        throw new Error('No se pudo descargar el archivo Excel después de varios intentos.');
      }
      // Esperar 2 segundos antes del siguiente intento
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Función para cargar y parsear el archivo Excel desde el buffer.
 */
async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

/**
 * Función para obtener el workbook cacheado, actualizando si es necesario.
 */
async function getWorkbook() {
  const now = Date.now();
  if (!cachedWorkbook || (now - lastFetchTime) > CACHE_REFRESH_INTERVAL) {
    console.log(`[${new Date().toISOString()}] Actualizando caché del archivo Excel...`);
    const buffer = await downloadExcelWithRetry(EXCEL_URL);
    cachedWorkbook = await loadWorkbook(buffer);
    lastFetchTime = now;
    console.log(`[${new Date().toISOString()}] Caché actualizada.`);

    // Log all sheet names for debugging
    console.log('Hojas disponibles en el workbook:');
    cachedWorkbook.worksheets.forEach((sheet, index) => {
      console.log(`  [${index + 1}] ${sheet.name}`);
    });
  } else {
    console.log(`[${new Date().toISOString()}] Usando caché existente del archivo Excel.`);
  }
  return cachedWorkbook;
}

module.exports = {
  getWorkbook
};
