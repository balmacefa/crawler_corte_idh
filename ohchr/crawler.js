// Web crawler para OHCHR Documentos con manejo de paginación, extracción de campos adicionales y enlaces de descarga
// Este script recopila información detallada de cada documento y la guarda en un archivo JSON.

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const urlModule = require("url"); // Para manejar URLs relativas
const axios = require("axios"); // Para realizar solicitudes HTTP y seguir redirects

/**
 * Crea un directorio si no existe.
 * @param {string} dir - Ruta del directorio a crear.
 */
function createDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Creado el directorio: ${dir}`);
  } else {
    console.log(`El directorio ya existe: ${dir}`);
  }
}

/**
 * Genera un hash SHA256 de la URL para usar como nombre de archivo único.
 * @param {string} url - La URL a hashear.
 * @returns {string} El hash SHA256 de la URL.
 */
function getFileNameFromURL(url) {
  return require("crypto").createHash("sha256").update(url).digest("hex");
}

let documents = [];
let failedDocuments = [];

/**
 * Resuelve la URL final después de seguir redirects.
 * @param {string} url - URL a resolver.
 * @returns {string} URL final después de seguir redirects.
 */
async function resolveRedirect(url) {
  try {
    const response = await axios.head(url, { maxRedirects: 5 });
    return response.request.res.responseUrl || url;
  } catch (error) {
    console.error(`Error al resolver redirect para ${url}: ${error.message}`);
    return url; // Retornar la URL original si falla
  }
}

/**
 * Extrae la información detallada de una página de documento.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {string} documentURL - URL del documento a visitar.
 * @returns {object|null} Objeto con la información extraída del documento o null si falla.
 */
async function extractDocumentDetails(browser, documentURL) {
  const page = await browser.newPage();
  try {
    await page.goto(documentURL, { waitUntil: "networkidle2" });
    console.log(`Visitando: ${documentURL}`);

    // Esperar a que el artículo principal esté presente
    await page.waitForSelector("article.oh-node.node-document");

    // Extraer el contenido HTML del artículo
    const articleHTML = await page.$eval(
      "article.oh-node.node-document",
      (el) => el.innerHTML
    );

    // Extraer datos específicos utilizando evaluate
    const data = await page.evaluate(() => {
      /**
       * Función auxiliar para obtener el texto de un selector.
       * @param {string} selector - Selector CSS.
       * @returns {string} Texto obtenido o "Sin información".
       */
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : "Sin información";
      };

      /**
       * Función auxiliar para obtener enlaces.
       * @param {string} selector - Selector CSS.
       * @returns {Array} Array de URLs.
       */
      const getLinks = (selector) => {
        const els = document.querySelectorAll(selector);
        return Array.from(els).map((el) => el.href);
      };

      // Extraer versiones (enlaces de descarga)
      const versions = [];
      const versionesHeader = document.querySelector(
        "h2.resource__heading.heading--5"
      );
      if (versionesHeader) {
        const versionesContainer = versionesHeader.nextElementSibling;
        if (versionesContainer) {
          const downloadLinks = versionesContainer.querySelectorAll(
            "a.resource__file-types-item"
          );
          downloadLinks.forEach((link) => {
            const type = link.innerText.trim();
            const href = link.href;
            // Determinar el idioma si está disponible
            const languageLabel =
              link
                .closest(".resource-language-container")
                ?.previousElementSibling?.innerText.trim() || "Desconocido";
            versions.push({ language: languageLabel, type: type, href: href });
          });
        }
      }

      // Extraer etiquetas
      const tags = Array.from(
        document.querySelectorAll(".node-document__tags .tags__link-item")
      ).map((el) => el.innerText.trim());

      // Extraer documentos relacionados
      const relatedDocs = Array.from(
        document.querySelectorAll(".node-document__body .views-row a")
      ).map((el) => el.href);

      return {
        summary: document.querySelector(".node-document__body .wysiwyg-content")
          ? document
              .querySelector(".node-document__body .wysiwyg-content")
              .innerText.trim()
          : "Sin resumen",
        published_by: getText(
          ".images-besides-text-3__text-item--label:contains('Publicado por:') + .images-besides-text-3__text-item--value"
        ),
        spoken_by: getText(
          ".images-besides-text-3__text-item--label:contains('Pronunciado por:') + .images-besides-text-3__text-item--value"
        ),
        tags: tags,
        related_documents: relatedDocs,
        versions: versions,
      };
    });

    // Extraer la fecha
    let date = "Sin fecha";
    try {
      date = await page.$eval("p.eyebrow-3", (el) => el.innerText.trim());
    } catch (err) {
      console.log("No se pudo extraer la fecha.");
    }

    // Extraer símbolo ONU
    let symbol = "Sin símbolo";
    try {
      symbol = await page.$eval(
        "div.hero-1__document-landing-content-item:nth-child(2) h3",
        (el) => el.innerText.trim()
      );
    } catch (err) {
      console.log("No se pudo extraer el símbolo ONU.");
    }

    // Extraer enfoque
    let focus = "Sin enfoque";
    try {
      focus = await page.$eval(
        "div.hero-1__document-landing-content-item:nth-child(3) h3",
        (el) => el.innerText.trim()
      );
    } catch (err) {
      console.log("No se pudo extraer el enfoque.");
    }

    // Extraer categoría
    let category = "Sin categoría";
    try {
      category = await page.$eval(
        "span.text--eyebrow.hero-1__eyebrow-text",
        (el) => el.innerText.trim()
      );
    } catch (err) {
      console.log("No se pudo extraer la categoría.");
    }

    // Extraer título
    let title = "Sin título";
    try {
      title = await page.$eval("h2.hero-1__title", (el) => el.innerText.trim());
    } catch (err) {
      console.log("No se pudo extraer el título.");
    }

    // Extraer versiones (enlaces de descarga) y resolver redirects
    const versionsData = data.versions.map(async (version) => {
      const downloadUrl = await resolveRedirect(version.href);
      return {
        language: version.language,
        type: version.type,
        download_url: downloadUrl,
      };
    });

    const resolvedVersions = await Promise.all(versionsData);

    // Extraer etiquetas
    const tags = data.tags;

    // Extraer documentos relacionados
    const related_documents = data.related_documents;

    // Extraer resumen
    const summary = data.summary;

    // Extraer publicado por
    const published_by = data.published_by;

    // Extraer pronunciado por
    const spoken_by = data.spoken_by;

    // Extraer etiquetas
    // Ya están extraídas arriba

    // Extraer documentos relacionados
    // Ya están extraídas arriba

    // Extraer versiones
    // Ya están extraídas y resueltas arriba

    // Extraer contenido HTML completo
    const content_html = articleHTML;

    // Retornar todos los datos
    return {
      url: documentURL,
      title: title,
      category: category,
      date: date,
      symbol: symbol,
      focus: focus,
      published_by: published_by,
      spoken_by: spoken_by,
      summary: summary,
      tags: tags,
      related_documents: related_documents,
      versions: resolvedVersions,
      content_html: content_html,
    };
  } catch (error) {
    console.error(
      `Error al extraer detalles de ${documentURL}: ${error.message}`
    );
    failedDocuments.push({
      url: documentURL,
      error: error.message,
    });
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Procesa y extrae datos de un documento listado.
 * @param {object} browser - Instancia del navegador Puppeteer.
 * @param {object} item - Manejador del elemento (div) que contiene la información del documento.
 * @returns {Promise<void>}
 */
async function processDocument(browser, item) {
  try {
    // Extraer el enlace <a> con clase 'card-2__link'
    const aTag = await item.$("a.card-2__link");
    if (!aTag) {
      console.log("No se encontró el enlace <a>, omitiendo...");
      return;
    }

    // Obtener el atributo 'href' del <a>
    let fileLink = await (await aTag.getProperty("href")).jsonValue();

    // Manejar URLs relativas
    const baseUrl = "https://www.ohchr.org";
    if (fileLink.startsWith("/")) {
      fileLink = urlModule.resolve(baseUrl, fileLink);
    }

    // Extraer el título del documento
    let title = "Sin título";
    try {
      title = await item.$eval("h2.card-2__title span", (el) =>
        el.innerText.trim()
      );
    } catch (err) {
      console.log("No se pudo extraer el título del documento.");
    }

    // Extraer la categoría (primer párrafo con clase 'eyebrow-1')
    let category = "Sin categoría";
    try {
      category = await item.$eval("p.eyebrow-1", (el) => el.innerText.trim());
    } catch (err) {
      console.log("No se pudo extraer la categoría del documento.");
    }

    // Extraer la fecha (párrafo con clase 'eyebrow-3')
    let date = "Sin fecha";
    try {
      date = await item.$eval("p.eyebrow-3", (el) => el.innerText.trim());
    } catch (err) {
      console.log("No se pudo extraer la fecha del documento.");
    }

    // Extraer el departamento o fuente (párrafo con clase 'eyebrow-4')
    let source = "Sin fuente";
    try {
      source = await item.$eval("p.eyebrow-4", (el) => el.innerText.trim());
    } catch (err) {
      console.log("No se pudo extraer la fuente del documento.");
    }

    // Extraer detalles adicionales del documento
    const documentDetails = await extractDocumentDetails(browser, fileLink);

    if (documentDetails) {
      documents.push(documentDetails);
      console.log(`Documento procesado: ${title}`);
    }
  } catch (error) {
    console.error("Error al procesar el documento:", error);
    failedDocuments.push({
      url: "Desconocido",
      error: error.message,
    });
  }
}

/**
 * Scrapea un sitio web, extrae datos de documentos con manejo de paginación y guarda en JSON.
 * @param {string} url - URL del sitio web a scrappear.
 * @param {string} baseDir - Directorio base para guardar los archivos descargados.
 */
async function scrapeWebsite(url, baseDir) {
  createDirectory(baseDir);

  console.log(`Iniciando navegador para ${url}...`);
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Opcional, útil en algunos entornos
  });
  const page = await browser.newPage();
  console.log(`Navegando a ${url}...`);
  await page.goto(url, { waitUntil: "networkidle2" });
  console.log("Esperando a que el contenido cargue...");

  let hasNextPage = true;
  let currentPage = 1;

  while (hasNextPage) {
    console.log(`Procesando página ${currentPage}...`);

    // Esperar a que los elementos de documentos estén presentes
    try {
      await page.waitForSelector("div.card-2-listing-items", {
        timeout: 10000,
      });
    } catch (err) {
      console.log("No se encontraron elementos de documentos en esta página.");
      break;
    }

    // Extraer todos los elementos de documentos
    const items = await page.$$("div.card-2-item-wrapper");

    console.log(
      `Encontrados ${items.length} documentos en la página ${currentPage}. Procesando...`
    );

    for (const item of items) {
      await processDocument(browser, item);
    }

    // Verificar si hay una página siguiente
    const nextButton = await page.$(
      "li.pager__item--next a.pager__item-link--next"
    );

    if (nextButton) {
      const isDisabled = await page.evaluate((button) => {
        return (
          button.parentElement.classList.contains("pager__item--disabled") ||
          button.getAttribute("rel") !== "next"
        );
      }, nextButton);

      if (!isDisabled) {
        console.log("Navegando a la siguiente página...");
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2" }),
          nextButton.click(),
        ]);
        currentPage += 1;
      } else {
        console.log("No hay más páginas. Finalizando scraping.");
        hasNextPage = false;
      }
    } else {
      console.log(
        "No se encontró el botón de 'Siguiente'. Finalizando scraping."
      );
      hasNextPage = false;
    }
  }

  console.log("Cerrando navegador...");
  await browser.close();
  console.log(`Finalizado scraping de ${url}.`);

  // Guardar los documentos exitosos en un archivo JSON
  const documentsOutputPath = path.join(baseDir, "documents.json");
  fs.writeFileSync(
    documentsOutputPath,
    JSON.stringify(documents, null, 2),
    "utf-8"
  );
  console.log(`Documentos exitosos guardados en ${documentsOutputPath}`);

  // Guardar los documentos fallidos en un archivo JSON separado
  const failedOutputPath = path.join(baseDir, "failed_documents.json");
  fs.writeFileSync(
    failedOutputPath,
    JSON.stringify(failedDocuments, null, 2),
    "utf-8"
  );
  console.log(`Documentos fallidos guardados en ${failedOutputPath}`);

  // Limpiar las variables
  documents = [];
  failedDocuments = [];
}

(async () => {
  const url =
    "https://www.ohchr.org/es/documents-listing?field_published_date_value[min]=&field_published_date_value[max]=&sort_bef_combine=field_published_date_value_DESC";

  const outputDir = `./data_crawler_OHCHR_Documents`;

  await scrapeWebsite(url, outputDir);
})();
