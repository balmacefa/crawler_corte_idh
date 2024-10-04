// Web crawler modificado con eliminación de tiempos de espera y manejo de rate limit
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

/**
 * Función para pausar la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos a esperar.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * @param {string} fileURL - URL del archivo a descargar.
 * @param {string} outputPath - Ruta donde se guardará el archivo.
 * @returns {Promise<void>} Promesa que se resuelve cuando la descarga se completa.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const file = fs.createWriteStream(outputPath);
      const protocol = fileURL.startsWith("https") ? https : http;
      protocol
        .get(fileURL, (response) => {
          // Verificar el código de estado HTTP
          if (response.statusCode !== 200) {
            response.resume();
            reject(
              new Error(
                `Failed to download file: ${response.statusCode} ${response.statusMessage}`
              )
            );
            return;
          }

          // Verificar el tipo de contenido
          const contentType = response.headers["content-type"];
          if (!contentType || !contentType.includes("application/pdf")) {
            let data = "";
            response.on("data", (chunk) => {
              data += chunk;
            });
            response.on("end", () => {
              if (data.includes("Ha sobrepasado los límites de acceso")) {
                reject(new RateLimitError("Rate limit exceeded"));
              } else {
                reject(
                  new Error(`Expected application/pdf but got ${contentType}`)
                );
              }
            });
            return;
          }

          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
        })
        .on("error", (error) => {
          fs.unlink(outputPath, () => {});
          reject(error);
        });
    } catch (error) {
      reject(error);
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

/**
 * Carga un archivo JSON si existe.
 * @param {string} filePath - Ruta del archivo JSON.
 * @returns {object} El contenido del archivo JSON o un objeto vacío.
 */
function loadJSON(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error al cargar ${filePath}:`, error);
      return {};
    }
  } else {
    return {};
  }
}

/**
 * Guarda un objeto como archivo JSON.
 * @param {string} filePath - Ruta donde se guardará el archivo JSON.
 * @param {object} data - Objeto a guardar.
 */
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`Datos guardados en ${filePath}`);
  } catch (error) {
    console.error(`Error al guardar ${filePath}:`, error);
  }
}

let caseMapping = {};
let failedCaseMapping = {};

/**
 * Genera un PDF a partir de una página web utilizando Puppeteer.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {string} pageURL - URL de la página a convertir en PDF.
 * @param {string} outputPath - Ruta donde se guardará el PDF.
 */
async function generatePDF(browser, pageURL, outputPath) {
  try {
    const page = await browser.newPage();
    await page.goto(pageURL, { waitUntil: "networkidle2" });

    // Verificar si la página contiene el mensaje de límite de tasa
    const pageContent = await page.content();
    if (pageContent.includes("Ha sobrepasado los límites de acceso")) {
      await page.close();
      throw new RateLimitError("Rate limit exceeded");
    }

    await page.pdf({ path: outputPath, format: "A4" });
    await page.close();
    console.log(`PDF generado y guardado en: ${outputPath}`);
  } catch (error) {
    throw error;
  }
}

/**
 * Clase de error personalizada para manejar el límite de tasa.
 */
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Procesa y descarga un artículo si no existe ya.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {object} articleElement - Elemento del artículo.
 * @param {string} outputDir - Directorio donde se descargará el archivo.
 * @param {string} category - Categoría o año del documento.
 * @param {string} mappingOutputPath - Ruta del archivo de mapeo exitoso.
 * @param {string} failedMappingOutputPath - Ruta del archivo de mapeo fallido.
 */
async function processAndDownloadArticle(
  browser,
  articleElement,
  outputDir,
  category,
  mappingOutputPath,
  failedMappingOutputPath
) {
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
    const outputPath = path.join(outputDir, fileName + ".pdf");

    // Verificar si el archivo ya fue procesado (existe en el mapeo)
    if (
      caseMapping.hasOwnProperty(fileName + ".pdf") ||
      failedCaseMapping.hasOwnProperty(fileName)
    ) {
      console.log(`El artículo ya fue procesado, se omite: ${title}`);
      return;
    }

    // Verificar si el archivo existe
    if (!fileExists(outputPath)) {
      // Guardar el mapeo
      caseMapping[fileName + ".pdf"] = {
        url: textoCompletoLink,
        title: title,
        category: category,
      };

      console.log(`Procesando: ${title}`);

      if (textoCompletoLink.endsWith(".pdf")) {
        // Descargar el PDF directamente
        console.log(`Descargando PDF directamente: ${outputPath}`);
        await downloadFile(textoCompletoLink, outputPath);
        console.log(`Descargado: ${outputPath}`);
      } else {
        // Generar PDF a partir de la página web
        console.log(`Generando PDF desde página web: ${textoCompletoLink}`);
        await generatePDF(browser, textoCompletoLink, outputPath);
      }

      // Guardar los mapeos exitosos en un archivo JSON después de procesar cada artículo
      saveJSON(mappingOutputPath, caseMapping);
    } else {
      console.log(`El archivo ya existe, se omite la descarga: ${outputPath}`);
    }
  } catch (error) {
    console.error("Error al procesar el artículo:", error);

    if (error instanceof RateLimitError) {
      throw error; // Re-lanzar el error para manejarlo en niveles superiores
    }

    // Guardar el mapeo de fallos
    const fileName = getFileNameFromURL(error.textoCompletoLink || "unknown");
    failedCaseMapping[fileName] = {
      url: error.textoCompletoLink || "unknown",
      title: error.title || "unknown",
      category: error.category || "unknown",
      error: error.message,
    };

    // Guardar los mapeos fallidos en un archivo JSON después de cada fallo
    saveJSON(failedMappingOutputPath, failedCaseMapping);
  }
}

/**
 * Función para reintentar una operación con retraso en caso de error de rate limit.
 * @param {Function} fn - La función a ejecutar.
 * @param {number} delay - El tiempo en milisegundos a esperar antes de reintentar.
 * @param {number} retries - Número de reintentos.
 * @param  {...any} args - Argumentos para la función fn.
 */
async function retryWithDelay(fn, delay, retries, ...args) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.log(
          `Rate limit excedido. Esperando ${
            delay / 60000
          } minutos antes de reintentar...`
        );
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Falló después de ${retries} reintentos`);
}

/**
 * Procesa la página de un año específico, descarga y guarda los archivos.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {string} year - Año a procesar.
 * @param {string} yearUrl - URL de la página del año.
 * @param {string} baseDir - Directorio base para guardar los archivos.
 * @param {string} mappingOutputPath - Ruta del archivo de mapeo exitoso.
 * @param {string} failedMappingOutputPath - Ruta del archivo de mapeo fallido.
 */
async function scrapeYearPage(
  browser,
  year,
  yearUrl,
  baseDir,
  mappingOutputPath,
  failedMappingOutputPath
) {
  let page = await browser.newPage();
  console.log(`Navegando a la página del año: ${yearUrl}`);
  await page.goto(yearUrl, { waitUntil: "networkidle2" });
  console.log("Esperando a que el contenido cargue...");
  await page.waitForSelector("body");

  // Crear directorio para el año
  const yearDir = path.join(baseDir, year);
  createDirectory(yearDir);

  // Obtener todos los artículos
  let articleElements = await page.$$("#listadoDeArticulos li.articulo");

  console.log(
    `Encontrados ${articleElements.length} artículos para el año ${year}`
  );

  // Mezclar los artículos en orden aleatorio
  // shuffle(articleElements);

  for (const articleElement of articleElements) {
    try {
      await retryWithDelay(
        processAndDownloadArticle,
        15 * 60 * 1000, // 15 minutos
        3, // número de reintentos
        browser,
        articleElement,
        yearDir,
        year,
        mappingOutputPath,
        failedMappingOutputPath
      );
    } catch (error) {
      console.error(
        `Falló al procesar el artículo después de reintentos: ${error}`
      );
    }
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
    args: ["--no-sandbox"],
    defaultViewport: null,
  });
  const page = await browser.newPage();

  // Establecer un User-Agent personalizado
  await page.setUserAgent(
    "Mozilla/5.0 (compatible; MiCrawler/1.0; +http://tucorreo@tuempresa.com)"
  );

  console.log(`Navegando a ${url}...`);
  await page.goto(url, { waitUntil: "networkidle2" });
  console.log("Esperando a que el contenido cargue...");
  await page.waitForSelector("body");

  // Obtener todos los años y sus enlaces
  const yearLinks = await page.$$eval("td.ano > a", (links) =>
    links.map((link) => ({ year: link.innerText.trim(), url: link.href }))
  );

  console.log(`Encontrados ${yearLinks.length} años. Procesando...`);

  const yearsToProcess = yearLinks;

  // Definir las rutas de los archivos de mapeo
  const mappingOutputPath = path.join(baseDir, "case_mapping_success.json");
  const failedMappingOutputPath = path.join(
    baseDir,
    "case_mapping_failed.json"
  );

  // Cargar los mapeos existentes si existen
  caseMapping = loadJSON(mappingOutputPath);
  failedCaseMapping = loadJSON(failedMappingOutputPath);

  for (const { year, url: yearUrl } of yearsToProcess) {
    console.log(`Procesando año: ${year} en ${yearUrl}`);
    try {
      await scrapeYearPage(
        browser,
        year,
        yearUrl,
        baseDir,
        mappingOutputPath,
        failedMappingOutputPath
      );
    } catch (error) {
      console.error(`Error al procesar el año ${year}:`, error);
      if (error instanceof RateLimitError) {
        console.log(
          "Rate limit excedido en nivel principal, esperando 15 minutos..."
        );
        await sleep(15 * 60 * 1000); // Esperar 15 minutos
        // Reintentar el año actual
        continue;
      }
    }
  }

  console.log("Cerrando navegador...");
  await browser.close();
  console.log(`Finalizado el scraping de ${url}.`);
}

(async () => {
  const url = `https://dialnet.unirioja.es/servlet/revista?codigo=6173`;

  const outputDir = `./data_crawler_Revista_Latinoamericana_de_Psicología`;

  createDirectory(outputDir);

  try {
    await scrapeMainPage(url, outputDir);
  } catch (error) {
    console.error("Error durante el scraping:", error);
  }
})();
