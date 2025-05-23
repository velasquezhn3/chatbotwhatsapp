const path = require('path');

/**
 * Configuración general y rutas de archivos.
 */

module.exports = {
  excelFilePath: '/datos_estudiantes.xlsx',
  relacionesFilePath: 'relaciones.xlsx',
  encargadosFilePath: path.join(__dirname, '..', 'encargados.json'),
  dataDir: path.join(__dirname, '..', 'data'),
  infoEscuela: {
    nombre: "Instituto Jose Cecilio Del Valle",
    direccion: "https://acortar.link/ijUbNm",
    telefono: "http://wa.me/50495031205",
    email: "contacto@josececiliodelvalle.edu.hn",
    horario: "Lunes a Viernes: 7:00 AM - 4:00 PM",
    sitioWeb: "www.JoseCecilioDelValle.edu.hn",
    bac: "730043231",
    occidente: "11-402-004148-5",
  },
  columnas: {
    NOMBRE: 'A',
    GRADO: 'B',
    ID: 'F',
    MESES: {
      ENERO: 'W', FEBRERO: 'X', MARZO: 'Y', ABRIL: 'Z',
      MAYO: 'AA', JUNIO: 'AB', JULIO: 'AC', AGOSTO: 'AD',
      SEPTIEMBRE: 'AE', OCTUBRE: 'AF', NOVIEMBRE: 'AG', DICIEMBRE: 'AH'
    },
    TOTAL_PAGAR: 'N'
  }
};
