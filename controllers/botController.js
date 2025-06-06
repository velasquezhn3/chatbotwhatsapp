/* Controlador para conexión y manejo del bot WhatsApp.
 */

const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const {
  buscarEstudiante,
  calcularDeuda
} = require('../services/studentService');
const {
  validarPIN
} = require('../services/pinService');
const {
  registrarEncargado,
  obtenerAlumnosEncargado,
  eliminarRelacion
} = require('../services/encargadoService');
const {
  establecerEstado,
  obtenerEstado,
  establecerUltimoSaludo,
  obtenerUltimoSaludo
} = require('../services/stateService');
const { infoEscuela, dataDir } = require('../config/config');
const { isAdmin } = require('../services/adminService');

/**
 * Envía el menú principal al usuario.
 * @param {Object} bot - Instancia del bot.
 * @param {string} remitente - Número del usuario.
 */
async function enviarBroadcast(bot, mensaje) {
  const fs = require('fs');
  const path = require('path');
  // Use absolute path to ensure correct file resolution
  const encargadosFilePath = path.join(__dirname, '../encargados.json');
  console.log(`Reading encargados.json from: ${encargadosFilePath}`);

  let encargadosDB = { encargados: {} };
  try {
    if (fs.existsSync(encargadosFilePath)) {
      const fileContent = fs.readFileSync(encargadosFilePath, 'utf8');
      console.log(`encargados.json content: ${fileContent.slice(0, 500)}`);
      try {
        encargadosDB = JSON.parse(fileContent);
      } catch (parseError) {
        console.error('Error parsing encargados.json:', parseError);
        return 0;
      }
    } else {
      console.warn('encargados.json file does not exist at path:', encargadosFilePath);
    }
  } catch (error) {
    console.error('Error al leer encargados.json:', error);
    return 0;
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const destinatarios = Object.keys(encargadosDB.encargados);
  console.log(`Broadcast recipients: ${destinatarios.join(', ')}`);
  let enviados = 0;

  for (const destinatario of destinatarios) {
    try {
      console.log(`Sending message to ${destinatario}`);

      if (typeof mensaje === 'string') {
        await bot.sendMessage(destinatario, { text: mensaje });
      } else if (typeof mensaje === 'object') {
        console.log('Message keys:', Object.keys(mensaje));
        // Unwrap extendedTextMessage if present
        let msgContent = mensaje;
        if (mensaje.extendedTextMessage && mensaje.extendedTextMessage.contextInfo && mensaje.extendedTextMessage.contextInfo.quotedMessage) {
          msgContent = mensaje.extendedTextMessage.contextInfo.quotedMessage;
        }

        if (msgContent.conversation) {
          // Text message
          await bot.sendMessage(destinatario, { text: msgContent.conversation });
        } else if (msgContent.imageMessage) {
          console.log('Downloading image message for broadcast...');
          const buffer = await downloadMediaMessage(bot, { message: msgContent }, 'buffer', {}, { logger: console });
          await bot.sendMessage(destinatario, {
            image: buffer,
            caption: msgContent.caption || ''
          });
        } else if (msgContent.videoMessage) {
          console.log('Downloading video message for broadcast...');
          const buffer = await downloadMediaMessage(bot, { message: msgContent }, 'buffer', {}, { logger: console });
          await bot.sendMessage(destinatario, {
            video: buffer,
            caption: msgContent.caption || ''
          });
        } else if (msgContent.audioMessage) {
          console.log('Downloading audio message for broadcast...');
          const buffer = await downloadMediaMessage(bot, { message: msgContent }, 'buffer', {}, { logger: console });
          await bot.sendMessage(destinatario, {
            audio: buffer,
            mimetype: msgContent.audioMessage.mimetype || 'audio/mpeg'
          });
        } else if (msgContent.documentMessage) {
          console.log('Downloading document message for broadcast...');
          const buffer = await downloadMediaMessage(bot, { message: msgContent }, 'buffer', {}, { logger: console });
          await bot.sendMessage(destinatario, {
            document: buffer,
            mimetype: msgContent.documentMessage.mimetype || 'application/octet-stream',
            fileName: msgContent.documentMessage.fileName || 'document'
          });
        } else if (msgContent.stickerMessage) {
          console.log('Downloading sticker message for broadcast...');
          const buffer = await downloadMediaMessage(bot, { message: msgContent }, 'buffer', {}, { logger: console });
          await bot.sendMessage(destinatario, {
            sticker: buffer
          });
        } else if (msgContent.extendedTextMessage && msgContent.extendedTextMessage.text) {
          await bot.sendMessage(destinatario, { text: msgContent.extendedTextMessage.text });
        } else {
          console.warn(`Unsupported message object for broadcast to ${destinatario}, skipping.`);
          continue;
        }
      } else {
        console.warn(`Mensaje de tipo no soportado para destinatario ${destinatario}`);
        continue;
      }
      enviados++;
      console.log(`Mensaje enviado a ${destinatario}`);
    } catch (error) {
      console.error(`Error enviando mensaje a ${destinatario}:`, error);
    }
    const delayMs = Math.floor(Math.random() * 15000) + 1000; // 1 to 15 seconds
    await delay(delayMs);
  }
  return enviados;
}

async function enviarMenuPrincipal(bot, remitente) {
  const alumnos = obtenerAlumnosEncargado(remitente);
  let mensaje = `🏫 *BIENVENIDO AL SISTEMA ESCOLAR*\n\n`;

  if (alumnos.length > 0) {
    mensaje += `👨‍👩‍👧‍👦 Tiene ${alumnos.length} alumno(s) registrado(s)\n\n`;
  }

  mensaje += `Seleccione una opción:\n\n`;
  mensaje += `1️⃣ *Registrar* nuevo alumno\n`;
  mensaje += `2️⃣ *Consultar* estado de pagos\n`;
  mensaje += `3️⃣ *Información* de la escuela\n`;
  mensaje += `4️⃣ *Contactar* administración\n`;

  if (alumnos.length > 0) {
    mensaje += `5️⃣ *Eliminar* alumno de mi cuenta\n`;
  }

  // Add admin-only menu option
  if (isAdmin(remitente)) {
    mensaje += `6️⃣ *Broadcast Admin*\n`;
  }

  mensaje += `\nResponda con el número de la opción deseada.`;

  establecerEstado(remitente, 'MENU_PRINCIPAL');
  await bot.sendMessage(remitente, { text: mensaje });
}

/**
 * Envía el estado de pagos detallado al usuario.
 * @param {Object} bot - Instancia del bot.
 * @param {string} remitente - Número del usuario.
 * @param {Object} estudiante - Información del estudiante.
 */
async function enviarEstadoPagos(bot, remitente, estudiante) {
  if (!estudiante || !estudiante.nombre) {
    await bot.sendMessage(remitente, {
      text: '❌ No se encontró información del alumno. Por favor contacte a administración.'
    });
    return;
  }

  const deuda = calcularDeuda(estudiante);
  // Define ordered months array in lowercase
  const mesesOrdenados = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesActualIndex = new Date().getMonth(); // 0-based index

  // Determine starting month index based on planDePago
  const inicioMesIndex = estudiante.planDePago === 10 ? 1 : 0; // febrero index 1, enero index 0

  const mesesHastaActualLower = mesesOrdenados.slice(inicioMesIndex, mesActualIndex + 1);

  const mesesKeys = Object.keys(estudiante.meses);

  let respuesta = `📊 *ESTADO DE PAGOS - ${estudiante.nombre.toUpperCase()}*\n`;
  respuesta += `🏫 Grado: ${estudiante.grado}\n\n`;

  mesesKeys
    .filter(mes => mesesHastaActualLower.includes(mes.toLowerCase()))
    .forEach(mes => {
      const valorMes = estudiante.meses[mes];
      const estado = valorMes ? `L.${parseFloat(valorMes).toFixed(2)} ✅ Pagado` : '❌ Pendiente';
      respuesta += `▫️ ${mes.charAt(0).toUpperCase() + mes.slice(1)}: ${estado}\n`;
    });

  respuesta += `\n💵 Cuota mensual: L.${deuda.cuotaMensual}`;
  respuesta += `\n📅 Meses pendientes: ${deuda.mesesPendientes.length}`;
  respuesta += deuda.alDia
    ? '\n\n✅ *AL DÍA EN PAGOS*'
    : `\n\n❌ *DEUDA MENSUALIDAD: L.${deuda.deudaMensualidad}*\n❌ *DEUDA MORA: L.${deuda.deudaMora}*\n❌ *DEUDA TOTAL: L.${deuda.totalDeuda}*`;

  if (estudiante.totalPagar < 10) {
    respuesta += `\n\n[DEBUG] Valor original: ${JSON.stringify(estudiante.valorCeldaOriginal)}`;
  }

  await bot.sendMessage(remitente, { text: respuesta });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarMensajeConDelay(bot, remitente, mensaje) {
  const delayMs = Math.floor(Math.random() * 10000) + 1000; // 1 to 10 seconds
  await delay(delayMs);
  await bot.sendMessage(remitente, mensaje);
}

/**
 * Procesa los mensajes recibidos y maneja la lógica de conversación.
 * @param {Object} bot - Instancia del bot.
 * @param {string} remitente - Número del usuario.
 * @param {string} mensaje - Texto del mensaje recibido.
 */
async function procesarMensaje(bot, remitente, mensaje, mensajeObj) {
  const estado = obtenerEstado(remitente);
  const alumnos = obtenerAlumnosEncargado(remitente);
  const textoMinuscula = mensaje.toLowerCase();

  // Check if greeting was sent today
  const hoy = new Date().toISOString().slice(0, 10);
  const ultimoSaludo = obtenerUltimoSaludo(remitente);
  let esPrimerMensajeDelDia = false;

  if (ultimoSaludo !== hoy) {
    esPrimerMensajeDelDia = true;
    establecerUltimoSaludo(remitente, hoy);
    const saludo = `🐺 ¡Hola! Soy Chilo el lobo asistente virtual del Instituto José Cecilio del Valle.\nEstoy aquí para ayudarte. ¿En qué puedo asistirte hoy? 📚✨.`;
    await enviarMensajeConDelay(bot, remitente, { text: saludo });
    // Set state to MENU_PRINCIPAL after greeting
    establecerEstado(remitente, 'MENU_PRINCIPAL');
    await enviarMenuPrincipal(bot, remitente);
    return;
  }

  // Handle broadcast messages in MENU_ADMIN_BROADCAST state
  if (estado.estado === 'MENU_ADMIN_BROADCAST') {
    console.log(`Entered MENU_ADMIN_BROADCAST state with message from ${remitente}`);
    if (!isAdmin(remitente)) {
      console.log(`User ${remitente} is not admin, broadcast denied.`);
      await bot.sendMessage(remitente, { text: '❌ No tiene permisos para enviar mensajes broadcast.' });
      establecerEstado(remitente, 'MENU_PRINCIPAL');
      await enviarMenuPrincipal(bot, remitente);
      return;
    }
    console.log(`Broadcast message received from admin ${remitente} in MENU_ADMIN_BROADCAST state.`);

    // Send the full message object for broadcast
    const enviados = await enviarBroadcast(bot, mensajeObj);
    console.log(`Broadcast sent to ${enviados} encargados.`);
    await bot.sendMessage(remitente, { text: `✅ Se mandaron ${enviados} encargados.` });
    establecerEstado(remitente, 'MENU_PRINCIPAL');
    await enviarMenuPrincipal(bot, remitente);
    return;
  }

  // Check for broadcast command from admin
  if (textoMinuscula.startsWith('broadcast ') || textoMinuscula.startsWith('bc ')) {
    console.log(`Broadcast command received from ${remitente}`);
    if (!isAdmin(remitente)) {
      console.log(`User ${remitente} is not admin, broadcast denied.`);
      await bot.sendMessage(remitente, { text: '❌ No tiene permisos para enviar mensajes broadcast.' });
      return;
    }
    console.log(`User ${remitente} is admin, proceeding with broadcast.`);

    // Remove the command prefix and get the rest of the message as broadcast content
    let textoBroadcast = mensaje;
    if (textoMinuscula.startsWith('broadcast ')) {
      textoBroadcast = mensaje.substring(10).trim();
    } else if (textoMinuscula.startsWith('bc ')) {
      textoBroadcast = mensaje.substring(3).trim();
    }

    // Send as text message broadcast
    const enviados = await enviarBroadcast(bot, textoBroadcast);
    console.log(`Broadcast sent to ${enviados} encargados.`);
    await bot.sendMessage(remitente, { text: `✅ Se mandaron ${enviados} encargados.` });
    return;
  }

  if (textoMinuscula === 'menu' || textoMinuscula === 'menú') {
    await enviarMenuPrincipal(bot, remitente);
    return;
  }

  switch (estado.estado) {
    case 'MENU_PRINCIPAL':
      switch (mensaje) {
        case '1':
          establecerEstado(remitente, 'REGISTRO_ID');
          await enviarMensajeConDelay(bot, remitente, {
            text: '📝 *REGISTRO DE ALUMNO*\n\nPor favor, ingrese el número de identidad del alumno (13 dígitos):'
          });
          break;

        case '6':
          if (isAdmin(remitente)) {
            establecerEstado(remitente, 'MENU_ADMIN_BROADCAST');
            await enviarMensajeConDelay(bot, remitente, {
              text: '📢 *MENÚ BROADCAST ADMIN*\n\nPor favor, envíe cualquier mensaje (texto, foto, video, etc.) para enviarlo a todos los encargados.\nEscriba *menú* para volver al menú principal.'
            });
          } else {
            await enviarMensajeConDelay(bot, remitente, {
              text: '❌ Opción no válida.'
            });
            await enviarMenuPrincipal(bot, remitente);
          }
          break;

        case '2':
          if (alumnos.length === 0) {
            await enviarMensajeConDelay(bot, remitente, {
              text: '❌ No tiene alumnos registrados. Seleccione la opción 1️⃣ para registrar un alumno.'
            });
            await enviarMenuPrincipal(bot, remitente);
          } else if (alumnos.length === 1) {
            const estudiante = await buscarEstudiante(alumnos[0]);
if (estudiante) {
  await enviarEstadoPagos(bot, remitente, estudiante);
  await delay(15000);
  await enviarMenuPrincipal(bot, remitente);
} else {
              await enviarMensajeConDelay(bot, remitente, {
                text: '❌ No se encontró información del alumno registrado. Por favor contacte a administración.'
              });
              await enviarMenuPrincipal(bot, remitente);
            }
          } else {
            let mensajeLista = '👨‍👩‍👧‍👦 *SELECCIONE ALUMNO*\n\n';
            let contador = 1;

            for (const idAlumno of alumnos) {
              const estudiante = await buscarEstudiante(idAlumno);
              if (estudiante) {
                mensajeLista += `${contador}. ${estudiante.nombre} - ${estudiante.grado}\n`;
                contador++;
              }
            }

            mensajeLista += '\nResponda con el número del alumno para ver su estado de pagos.';
            establecerEstado(remitente, 'SELECCION_ALUMNO', { alumnos });
            await enviarMensajeConDelay(bot, remitente, { text: mensajeLista });
          }
          break;

        case '3':
          let infoMensaje = `📚 *INFORMACIÓN DE LA ESCUELA*\n\n`;
          infoMensaje += `*${infoEscuela.nombre}*\n\n`;
          infoMensaje += `📍 *Dirección:* ${infoEscuela.direccion}\n`;
          infoMensaje += `📞 *Teléfono:* ${infoEscuela.telefono}\n`;
          infoMensaje += `📧 *Email:* ${infoEscuela.email}\n`;
          infoMensaje += `⏰ *Horario:* ${infoEscuela.horario}\n`;
          infoMensaje += `🌐 *Sitio Web:* ${infoEscuela.sitioWeb}\n\n`;
          infoMensaje += `🏦 *Cuentas Bancarias:*\n`;
          infoMensaje += `⚪ *BAC:* ${infoEscuela.bac}\n`;
          infoMensaje += `⚪ *Occidente:* ${infoEscuela.occidente}\n`;
          infoMensaje += `Escriba *menú* para volver al menú principal.`;

          await enviarMensajeConDelay(bot, remitente, { text: infoMensaje });
          break;

        case '4':
          let contactoMensaje = `📞 *CONTACTAR ADMINISTRACIÓN*\n\n`;
          contactoMensaje += `Para consultas administrativas puede comunicarse al:\n`;
          contactoMensaje += `📱 *WhatsApp:* ${infoEscuela.telefono}\n`;
          contactoMensaje += `📧 *Email:* ${infoEscuela.email}\n\n`;
          contactoMensaje += `⏰ *Horario de atención:*\n`;
          contactoMensaje += `${infoEscuela.horario}\n\n`;
         
          contactoMensaje += `Escriba *menú* para volver al menú principal.`;

          await enviarMensajeConDelay(bot, remitente, { text: contactoMensaje });
          break;

        case '5':
          if (alumnos.length === 0) {
            await enviarMensajeConDelay(bot, remitente, {
              text: '❌ No tiene alumnos registrados para eliminar.'
            });
            await enviarMenuPrincipal(bot, remitente);
          } else {
            let mensajeEliminar = '🗑️ *ELIMINAR ALUMNO*\n\n';
            let contador = 1;

            for (const idAlumno of alumnos) {
              const estudiante = await buscarEstudiante(idAlumno);
              if (estudiante) {
                mensajeEliminar += `${contador}. ${estudiante.nombre} - ${estudiante.grado}\n`;
                contador++;
              }
            }

            mensajeEliminar += '\nResponda con el número del alumno que desea eliminar de su cuenta.';
            establecerEstado(remitente, 'ELIMINAR_ALUMNO', { alumnos });
            await enviarMensajeConDelay(bot, remitente, { text: mensajeEliminar });
          }
          break;

        default:
          // Suppress invalid option message on first message of the day
          if (!esPrimerMensajeDelDia) {
            await enviarMensajeConDelay(bot, remitente, {
              text: '❓ Opción no válida. Por favor seleccione una opción del menú.'
            });
          }
          await enviarMenuPrincipal(bot, remitente);
          break;
      }
      break;

    case 'REGISTRO_ID':
      if (/^\d{13}$/.test(mensaje)) {
        const estudiante = await buscarEstudiante(mensaje);
        if (estudiante) {
          establecerEstado(remitente, 'REGISTRO_PIN', { idEstudiante: mensaje });
          await enviarMensajeConDelay(bot, remitente, {
            text: `✅ *Alumno encontrado:* ${estudiante.nombre}\n\nAhora ingrese el PIN de autorización:`
          });
        } else {
          await enviarMensajeConDelay(bot, remitente, {
            text: '❌ El número de identidad no está registrado en el sistema. Verifique e intente nuevamente.'
          });
        }
      } else {
        await enviarMensajeConDelay(bot, remitente, {
          text: '❌ Formato incorrecto. El número de identidad debe tener 13 dígitos numéricos.\n\nIntente nuevamente o escriba *menú* para volver al menú principal.'
        });
      }
      break;

    case 'REGISTRO_PIN':
      const pinValido = await validarPIN(estado.datos.idEstudiante, mensaje);

      if (pinValido) {
        await registrarEncargado(remitente, estado.datos.idEstudiante);
        const estudiante = await buscarEstudiante(estado.datos.idEstudiante);

        await enviarMensajeConDelay(bot, remitente, {
          text: `✅ *REGISTRO EXITOSO*\n\nEl alumno *${estudiante.nombre}* ha sido vinculado a su número.\n\nYa puede consultar su estado de pagos desde el menú principal.`
        });

        setTimeout(() => enviarMenuPrincipal(bot, remitente), 1500);
      } else {
        await enviarMensajeConDelay(bot, remitente, {
          text: '❌ PIN incorrecto. Verifique e intente nuevamente o escriba *menú* para volver al menú principal.'
        });
      }
      break;

    case 'SELECCION_ALUMNO':
      const indice = parseInt(mensaje, 10) - 1;

      if (isNaN(indice) || indice < 0 || indice >= estado.datos.alumnos.length) {
        await enviarMensajeConDelay(bot, remitente, {
          text: '❌ Opción no válida. Por favor seleccione un número de la lista.'
        });
      } else {
        const idAlumno = estado.datos.alumnos[indice];
        const estudiante = await buscarEstudiante(idAlumno);

        if (estudiante) {
          await enviarEstadoPagos(bot, remitente, estudiante);
          setTimeout(() => enviarMenuPrincipal(bot, remitente), 1500);
        } else {
          await enviarMensajeConDelay(bot, remitente, {
            text: '❌ No se encontró información del alumno seleccionado. Por favor contacte a administración.'
          });
          await enviarMenuPrincipal(bot, remitente);
        }
      }
      break;

    case 'ELIMINAR_ALUMNO':
      const indiceEliminar = parseInt(mensaje, 10) - 1;

      if (isNaN(indiceEliminar) || indiceEliminar < 0 || indiceEliminar >= estado.datos.alumnos.length) {
        await enviarMensajeConDelay(bot, remitente, {
          text: '❌ Opción no válida. Por favor seleccione un número de la lista.'
        });
      } else {
        const idAlumno = estado.datos.alumnos[indiceEliminar];
        const estudiante = await buscarEstudiante(idAlumno);

        if (eliminarRelacion(remitente, idAlumno)) {
          await enviarMensajeConDelay(bot, remitente, {
            text: `✅ El alumno *${estudiante.nombre}* ha sido eliminado de su cuenta correctamente.`
          });
        } else {
          await enviarMensajeConDelay(bot, remitente, {
            text: '❌ Error al eliminar el alumno. Por favor contacte a administración.'
          });
        }

        setTimeout(() => enviarMenuPrincipal(bot, remitente), 1500);
      }
      break;

    default:
      await enviarMenuPrincipal(bot, remitente);
      break;
  }
}

/**
 * Inicia la conexión del bot WhatsApp.
 */
async function iniciarBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(dataDir, 'session'));

    const bot = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ["Sistema Escolar", "Chrome", "122.0.6261.94"],
      mobile: false
    });

bot.ev.on('connection.update', (update) => {
  console.log('Connection update event:', JSON.stringify(update, null, 2));
  if (update.qr) {
    console.log('QR code event received');
    console.log('QR code received, scan please:');
    qrcodeTerminal.generate(update.qr, { small: true });

    // Generate QR code string and save to file for Railway environment
    qrcodeTerminal.generate(update.qr, { small: true }, (qrString) => {
      const qrFilePath = path.join(dataDir, 'qr_code.txt');
      fs.writeFile(qrFilePath, qrString, (err) => {
        if (err) {
          console.error('Error saving QR code to file:', err);
        } else {
          console.log(`QR code saved to file: ${qrFilePath}`);
        }
      });
    });

    // Generate QR code PNG file and log data URL
    const qrPngPath = path.join(dataDir, 'qr_code.png');
    qrcode.toFile(qrPngPath, update.qr, { type: 'png' }, (err) => {
      if (err) {
        console.error('Error generating QR code PNG:', err);
      } else {
        console.log(`QR code PNG saved to file: ${qrPngPath}`);
      }
    });

    qrcode.toDataURL(update.qr, (err, url) => {
      if (err) {
        console.error('Error generating QR code data URL:', err);
      } else {
        console.log('QR code data URL:', url);
      }
    });
  }
  if (update.connection) {
    console.log('Connection update:', update.connection);
  }
  if (update.lastDisconnect) {
    console.log('Last disconnect info:', JSON.stringify(update.lastDisconnect, null, 2));
    const statusCode = update.lastDisconnect.error?.output?.statusCode || update.lastDisconnect.statusCode;
    console.log('Last disconnect status code:', statusCode);
if (statusCode === 401) {
  console.log('Unauthorized, deleting session and restarting...');
  // Delete session files to force re-authentication
  const sessionPath = path.join(dataDir, 'session');
  fs.rm(sessionPath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error('Error deleting session files:', err);
    } else {
      console.log('Session files deleted successfully.');
    }
    setTimeout(iniciarBot, 3000);
  });
  return; // Prevent further restart until deletion completes
}
  }
  if (update.connection === 'close') {
    console.log('Connection closed, restarting bot in 3 seconds...');
    setTimeout(iniciarBot, 3000);
  }
});

    bot.ev.on('creds.update', saveCreds);

    bot.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe && msg.message) {
        const remitente = msg.key.remoteJid;
        let texto = '';

        if (msg.message.conversation) {
          texto = msg.message.conversation.trim();
        } else if (msg.message.extendedTextMessage) {
          texto = msg.message.extendedTextMessage.text.trim();
        }

        if (texto) {
          await procesarMensaje(bot, remitente, texto, msg.message);
        }
      }
    });

    console.log('🔔 BOT INICIADO - ESCANEE EL CÓDIGO QR');
  } catch (error) {
    console.error('Error al iniciar el bot:', error);
  }
}

module.exports = {
  iniciarBot,
  procesarMensaje,
  enviarMenuPrincipal,
  enviarEstadoPagos
};
