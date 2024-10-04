// Web crawler modificado para -> Revista Latinoamericana de Psicología
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

/**
 * Crea un directorio si no existe.
 * @param {string} dir - Ruta del directorio a crear.
 */
function createDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Directorio creado: ${dir}`);
  } else {
    console.log(`El directorio ya existe: ${dir}`);
  }
}

/**
 * Genera un hash SHA256 de la URL para usar como nombre de archivo.
 * @param {string} url - URL a hash.
 * @returns {string} El hash SHA256 de la URL.
 */
function getFileNameFromURL(url) {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * Descarga un archivo desde una URL y lo guarda en una ruta especificada.
 * Si el archivo es HTML, se procesa con Puppeteer para obtener el HTML compilado y guardarlo como PDF.
 * @param {string} fileURL - URL del archivo a descargar.
 * @param {string} outputPath - Ruta donde se guardará el archivo.
 * @returns {Promise<void>} Promesa que se resuelve cuando la descarga se completa.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise(async (resolve, reject) => {
    if (fileURL.includes("htm")) {
      try {
        const browser = await puppeteer.launch({
          headless: true,
        });

        const page = await browser.newPage();
        await page.goto(fileURL, { waitUntil: "networkidle0" });

        const pdfOutputPath = outputPath + ".pdf";

        await page.pdf({
          path: pdfOutputPath,
          format: "A4",
          margin: {
            top: "20mm",
            right: "20mm",
            bottom: "20mm",
            left: "20mm",
          },
          printBackground: true,
        });
        console.log(
          `Página HTML guardada como PDF con márgenes en ${pdfOutputPath}`
        );

        await browser.close();

        resolve();
      } catch (error) {
        console.error(`Error al procesar el archivo HTML: ${error.message}`);
        reject(error);
      }
    } else {
      const file = fs.createWriteStream(outputPath);
      const protocol = fileURL.startsWith("https") ? https : http;
      protocol
        .get(fileURL, (response) => {
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
        })
        .on("error", (error) => {
          fs.unlink(outputPath, () => {});
          reject(error);
        });
    }
  });
}

/**
 * Verifica si un archivo existe en una ruta dada.
 * @param {string} filePath - Ruta del archivo a verificar.
 * @returns {boolean} True si el archivo existe, false si no.
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

let caseMapping = {};
let failedCaseMapping = {};

/**
 * Procesa y descarga un artículo si no existe ya.
 * @param {object} articleElement - Elemento del artículo.
 * @param {string} outputDir - Directorio donde se descargará el archivo.
 * @param {string} category - Categoría o año del documento.
 */
async function processAndDownloadArticle(articleElement, outputDir, category) {
  try {
    // Obtener el título del artículo
    const titleElement = await articleElement.$("p.titulo > span.titulo > a");
    const title = await (
      await titleElement.getProperty("innerText")
    ).jsonValue();

    // Obtener el enlace 'Texto completo'
    const enlaceElements = await articleElement.$$("ul.enlaces > li");
    let textoCompletoLink = null;
    for (const enlaceElement of enlaceElements) {
      const enlaceText = await enlaceElement.evaluate((el) =>
        el.innerText.trim()
      );
      if (enlaceText === "Texto completo") {
        const aTag = await enlaceElement.$("a");
        textoCompletoLink = await (await aTag.getProperty("href")).jsonValue();
        break;
      }
    }

    if (!textoCompletoLink) {
      console.log(`No se encontró 'Texto completo' para el artículo: ${title}`);
      return;
    }

    const fileName = getFileNameFromURL(textoCompletoLink);
    const extension = path.extname(new URL(textoCompletoLink).pathname);
    const outputPath = path.join(outputDir, fileName + extension);

    // Guardar el mapeo
    caseMapping[fileName + extension] = {
      url: textoCompletoLink,
      title: title,
      category: category,
    };

    // Verificar si el archivo existe
    if (!fileExists(outputPath)) {
      console.log(`Descargando: ${fileName + extension}`);
      await downloadFile(textoCompletoLink, outputPath);
      console.log(`Descargado: ${fileName + extension}`);
    } else {
      console.log(
        `El archivo ya existe, se omite la descarga: ${fileName + extension}`
      );
    }
  } catch (error) {
    console.error("Error al procesar el artículo:", error);

    // Guardar el mapeo de fallos
    const fileName = getFileNameFromURL(error.textoCompletoLink || "unknown");
    failedCaseMapping[fileName] = {
      url: error.textoCompletoLink || "unknown",
      title: error.title || "unknown",
      category: error.category || "unknown",
      error: error.message,
    };
  }
}

/**
 * Procesa la página de un año específico, descarga y guarda los archivos.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {string} year - Año a procesar.
 * @param {string} yearUrl - URL de la página del año.
 * @param {string} baseDir - Directorio base para guardar los archivos.
 */
async function scrapeYearPage(browser, year, yearUrl, baseDir) {
  const page = await browser.newPage();
  console.log(`Navegando a la página del año: ${yearUrl}`);
  await page.goto(yearUrl);
  console.log("Esperando a que el contenido cargue...");
  await page.waitForSelector("body");

  // Crear directorio para el año
  const yearDir = path.join(baseDir, year);
  createDirectory(yearDir);

  // Obtener todos los artículos
  const articleElements = await page.$$("#listadoDeArticulos li.articulo");

  console.log(
    `Encontrados ${articleElements.length} artículos para el año ${year}`
  );

  for (const articleElement of articleElements) {
    await processAndDownloadArticle(articleElement, yearDir, year);
  }

  await page.close();
}

/**
 * Scrapea el sitio web principal, obtiene los años y procesa cada uno.
 * @param {string} url - URL de la página principal.
 * @param {string} baseDir - Directorio base para guardar los archivos.
 */
async function scrapeMainPage(url, baseDir) {
  console.log(`Lanzando navegador para ${url}...`);
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  console.log(`Navegando a ${url}...`);
  await page.goto(url);
  console.log("Esperando a que el contenido cargue...");
  await page.waitForSelector("body");

  // Obtener todos los años y sus enlaces
  const yearLinks = await page.$$eval("td.ano > a", (links) =>
    links.map((link) => ({ year: link.innerText.trim(), url: link.href }))
  );

  console.log(`Encontrados ${yearLinks.length} años. Procesando...`);

  // Opcional: Limitar a los primeros N años, por ejemplo, los últimos 5 años
  // const recentYears = yearLinks.slice(0, 5);

  for (const { year, url: yearUrl } of yearLinks) {
    console.log(`Procesando año: ${year} en ${yearUrl}`);
    await scrapeYearPage(browser, year, yearUrl, baseDir);
  }

  console.log("Cerrando navegador...");
  await browser.close();
  console.log(`Finalizado el scraping de ${url}.`);
}

(async () => {
  const url = `https://dialnet.unirioja.es/servlet/revista?codigo=6173`;

  const outputDir = `./data_crawler_Revista_Latinoamericana_de_Psicología`;

  createDirectory(outputDir);

  await scrapeMainPage(url, outputDir);

  // Guardar los mapeos exitosos en un archivo JSON después de procesar todos los casos
  const mappingOutputPath = path.join(outputDir, "case_mapping_success.json");
  fs.writeFileSync(
    mappingOutputPath,
    JSON.stringify(caseMapping, null, 2),
    "utf-8"
  );
  console.log(`Mapeo de casos guardado en ${mappingOutputPath}`);

  // Guardar los mapeos fallidos en un archivo JSON separado
  const failedMappingOutputPath = path.join(
    outputDir,
    "case_mapping_failed.json"
  );
  fs.writeFileSync(
    failedMappingOutputPath,
    JSON.stringify(failedCaseMapping, null, 2),
    "utf-8"
  );
  console.log(`Mapeo de casos fallidos guardado en ${failedMappingOutputPath}`);

  caseMapping = {};
  failedCaseMapping = {};
})();
