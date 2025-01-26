const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto"); // Importar crypto para generar hashes

/**
 * Crea un directorio si no existe.
 * @param {string} dir - La ruta del directorio a crear.
 */
function createDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Creado directorio: ${dir}`);
  } else {
    console.log(`El directorio ya existe: ${dir}`);
  }
}

/**
 * Extrae un nombre de archivo único basado en el hash de la URL y agrega un prefijo de idioma.
 * @param {string} url - La URL del documento.
 * @param {string} idioma - El idioma del documento (e.g., 'English', 'Español').
 * @returns {string} El nombre del archivo generado.
 */
function getFileNameFromURL(url, idioma) {
  try {
    // Generar un hash SHA-1 de la URL
    const hash = crypto.createHash("sha1").update(url).digest("hex");

    // Determinar el prefijo basado en el idioma
    let prefix = "";
    if (idioma.toLowerCase() === "english") {
      prefix = "English_";
    } else if (
      idioma.toLowerCase() === "español" ||
      idioma.toLowerCase() === "spanish"
    ) {
      prefix = "Español_";
    } else {
      prefix = `${idioma}_`; // Prefijo por defecto si el idioma no es reconocido
    }

    // Asumimos que el archivo es PDF, puedes ajustar esto si necesitas otros formatos
    const fileName = `${prefix}${hash}.pdf`;

    return fileName;
  } catch (error) {
    console.error(`Error en getFileNameFromURL: ${error.message}`);
    // Fallback: usar un nombre genérico con hash
    const hash = crypto.createHash("sha1").update(url).digest("hex");
    return `Document_${hash}.pdf`;
  }
}

/**
 * Descarga un archivo desde una URL y lo guarda en una ruta específica.
 * @param {string} fileURL - La URL del archivo a descargar.
 * @param {string} outputPath - La ruta donde se guardará el archivo.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la descarga termina.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const protocol = fileURL.startsWith("https") ? https : http;
    protocol
      .get(fileURL, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(
              `Falló la descarga. Estado del servidor: ${response.statusCode}`
            )
          );
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (error) => {
        fs.unlink(outputPath, () => {}); // Eliminar el archivo en caso de error
        reject(error);
      });
  });
}

/**
 * Verifica si un archivo existe en una ruta dada.
 * @param {string} filePath - La ruta del archivo a verificar.
 * @returns {boolean} True si el archivo existe, false en caso contrario.
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Maneja la página de documentos para descargar PDFs en inglés y español.
 * @param {object} browser - La instancia de Puppeteer Browser.
 * @param {string} viewDocURL - La URL de la página "View Document".
 * @param {string} baseDir - El directorio base donde se guardarán los archivos descargados.
 */
async function handleViewDocumentPage(browser, viewDocURL, baseDir) {
  try {
    const pdfDir = path.join(baseDir, "pdf");

    // Crear el directorio para PDFs si no existe
    createDirectory(pdfDir);

    // Crear una nueva página para manejar la descarga
    const page = await browser.newPage();
    console.log(`\nNavegando a la página de View Document: ${viewDocURL}`);
    await page.goto(viewDocURL, { waitUntil: "networkidle2" });

    // Definir los idiomas a procesar
    const idiomas = ["English", "Español"];

    for (const idioma of idiomas) {
      console.log(`\nProcesando el idioma: ${idioma}`);

      // Encontrar la fila <tr> que contiene el idioma actual
      const [fila] = await page.$x(`//tr[td[text()='${idioma}']]`);

      if (fila) {
        console.log(`Fila encontrada para el idioma: ${idioma}`);

        // Dentro de la fila, encontrar el enlace <a> con title que contiene 'pdf'
        const [enlacePdf] = await fila.$x(`.//a[contains(@title, 'pdf')]`);

        if (enlacePdf) {
          const href = await enlacePdf.evaluate((el) => el.href);
          console.log(`Descargando PDF para ${idioma}: ${href}`);

          const fileName = getFileNameFromURL(href, idioma);
          const outputPath = path.join(pdfDir, fileName);

          if (!fileExists(outputPath)) {
            await downloadFile(href, outputPath);
            console.log(`Descargado: ${outputPath}`);
          } else {
            console.log(`El archivo ya existe: ${outputPath}`);
          }
        } else {
          console.log(`No se encontró enlace PDF para el idioma: ${idioma}`);

          const [enlaceDoc] = await fila.$x(`.//a[contains(@title, 'doc')]`);

          if (enlaceDoc) {
            const href = await enlaceDoc.evaluate((el) => el.href);
            console.log(`Descargando DOC para ${idioma}: ${href}`);

            const fileName = getFileNameFromURL(href, idioma).replace(
              ".pdf",
              ".doc"
            );
            const outputPath = path.join(pdfDir, fileName);

            if (!fileExists(outputPath)) {
              await downloadFile(href, outputPath);
              console.log(`Descargado: ${outputPath}`);
            } else {
              console.log(`El archivo ya existe: ${outputPath}`);
            }
          } else {
            console.log(`No se encontró enlace DOC para el idioma: ${idioma}`);
          }
        }
      } else {
        console.log(`No se encontró una fila para el idioma: ${idioma}`);
      }
    }

    // Cerrar la página después de procesarla
    await page.close();
    console.log(`Finalizado el procesamiento de: ${viewDocURL}`);
  } catch (error) {
    console.error(`Error en handleViewDocumentPage: ${error}`);
  }
}

/**
 * Scrapea un sitio web, descarga y guarda archivos PDF.
 * @param {string} url - La URL del sitio web a scrapear.
 * @param {string} baseDir - El directorio base para guardar los archivos descargados.
 */
async function scrapeWebsite(url, baseDir) {
  try {
    const pdfDir = path.join(baseDir, "pdf");
    // const docDir = path.join(baseDir, "doc"); // Descomenta si necesitas manejar documentos DOC

    // Crear el directorio para PDFs (y DOC si es necesario)
    createDirectory(pdfDir);
    // createDirectory(docDir); // Descomenta si necesitas manejar documentos DOC

    console.log(`Lanzando navegador para ${url}...`);

    const browser = await puppeteer.launch({
      headless: false, // Ejecuta en modo visible para ver las acciones
      args: ["--start-maximized"], // Opcional: Inicia el navegador maximizado
      defaultViewport: null, // Asegura que el viewport coincida con el tamaño de la ventana
      // Puedes agregar otras opciones de lanzamiento según sea necesario
    });

    const page = await browser.newPage();
    console.log(`Navegando a ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2" });
    console.log("Esperando a que el contenido cargue...");

    // 1. Hacer clic en el <input> con value="10"
    const selectorInput = 'input[value="10"]';
    console.log(`Buscando el elemento ${selectorInput}...`);
    await page.waitForSelector(selectorInput, { visible: true, timeout: 5000 });

    console.log(`Haciendo clic en el elemento ${selectorInput}...`);
    await page.click(selectorInput);

    console.log("Esperando 500 ms...");
    await page.waitForTimeout(500); // Espera 500 ms

    // 2. Hacer clic en el elemento <li> con el texto 'All'
    const textoLi = "All";
    console.log(
      `Buscando y haciendo clic en el elemento <li> con el texto '${textoLi}'...`
    );

    // Utilizar XPath para seleccionar el <li> que contiene el texto 'All'
    const [elementoLi] = await page.$x(`//li[contains(text(), '${textoLi}')]`);

    if (elementoLi) {
      await elementoLi.click();
      console.log(
        `Se hizo clic en el elemento <li> con el texto '${textoLi}'.`
      );
    } else {
      console.error(
        `No se encontró ningún elemento <li> con el texto '${textoLi}'.`
      );
    }

    console.log("Esperando 500 ms adicionales...");
    await page.waitForTimeout(500); // Espera 500 ms

    // 3. Obtener todos los enlaces <a> con el texto 'View document'
    const textoLink = "View document";
    console.log(
      `Buscando todos los enlaces <a> que contienen el texto '${textoLink}'...`
    );
    const enlaces = await page.$x(`//a[contains(text(), '${textoLink}')]`);

    if (enlaces.length > 0) {
      console.log(
        `Se encontraron ${enlaces.length} enlaces con el texto '${textoLink}':`
      );

      const hrefs = await Promise.all(
        enlaces.map(async (enlace) => {
          const href = await enlace.evaluate((el) => el.href);
          return href;
        })
      );

      // Utilizar un ciclo for...of para manejar asincronía correctamente
      for (const href of hrefs) {
        await handleViewDocumentPage(browser, href, baseDir);
      }

      // Opcional: Guardar en un archivo JSON
      // fs.writeFileSync('enlaces.json', JSON.stringify(hrefs, null, 2));
    } else {
      console.log(`No se encontraron enlaces <a> con el texto '${textoLink}'.`);
    }

    // 4. Cerrar el navegador
    console.log("Cerrando navegador...");
    await browser.close();
    console.log(`Finalizado el scraping de ${url}.`);
  } catch (error) {
    console.error("Error:", error);
  }
}

(async () => {
  await scrapeWebsite(
    "https://tbinternet.ohchr.org/_layouts/15/TreatyBodyExternal/TBSearch.aspx?Lang=en&TreatyID=8&DocTypeID=11",
    "./data_crawler_UN_treaty_body"
  );
})();
