// crawlerModule.js
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

let browserInstance;
let browserLaunching = false;

/**
 * Inicializa el navegador Puppeteer si no está ya inicializado.
 */
async function initBrowser() {
  if (browserInstance) {
    // Verificar si el navegador está conectado
    if (browserInstance.isConnected()) {
      return;
    } else {
      // El navegador está desconectado, intentar cerrarlo y reiniciarlo
      await closeBrowser();
    }
  }

  // Prevenir lanzamientos simultáneos del navegador
  if (browserLaunching) {
    // Esperar hasta que el navegador haya sido lanzado
    while (browserLaunching) {
      await sleep(100);
    }
    return;
  }

  browserLaunching = true;
  try {
    browserInstance = await puppeteer.launch({
      headless: "new", // Cambiado a "new"
      // headless: false, // Cambiado a "new"
      args: ["--no-sandbox"],
      defaultViewport: null,
    });

    // Escuchar eventos de desconexión
    browserInstance.on("disconnected", () => {
      console.error("El navegador se desconectó inesperadamente.");
      browserInstance = null;
    });
  } catch (error) {
    console.error("Error al lanzar el navegador:", error);
    browserInstance = null;
  } finally {
    browserLaunching = false;
  }
}

/**
 * Cierra el navegador Puppeteer si está abierto.
 */
async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error("Error al cerrar el navegador:", error);
    } finally {
      browserInstance = null;
    }
  }
}

/**
 * Pausa la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos a esperar.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Realiza una búsqueda en Google utilizando dorks y devuelve los enlaces de los resultados.
 * @param {string} query - La consulta del usuario que puede incluir dorks.
 * @returns {Promise<string[]>} - Lista de URLs de los resultados de búsqueda.
 */
async function queryGoogle(query) {
  await initBrowser();

  let page;
  try {
    page = await browserInstance.newPage();

    // Configurar User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; MiCrawler/1.0; +http://tucorreo@tuempresa.com)"
    );

    // Navegar a Google
    await page.goto("https://www.google.com", { waitUntil: "networkidle2" });

    // Aceptar cookies si es necesario (manejo del popup de cookies)
    try {
      await page.waitForSelector('#L2AGLb, [aria-label="Aceptar todo"]', {
        timeout: 5000,
      });
      await page.click('#L2AGLb, [aria-label="Aceptar todo"]');
    } catch (error) {
      // Si no aparece el popup, continuar
    }

    // Ingresar la consulta en el cuadro de búsqueda
    await page.type('input[name="q"]', query, { delay: 100 });

    // Enviar el formulario
    await page.keyboard.press("Enter");

    // Esperar a que los resultados carguen
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Esperar a que el div #main esté disponible
    await page.waitForSelector("#main");

    // Obtener el código HTML del div #main
    const mainHTML = await page.$eval("#main", (element) => element.innerHTML);

    // Usar la función parseGoogleResults para extraer los datos
    const searchResults = parseGoogleResults(mainHTML);

    // Retornar los resultados
    return searchResults;
  } catch (error) {
    console.error("Error en queryGoogle:", error);

    // Si el error es debido a la desconexión del navegador, reiniciarlo
    if (
      error.message.includes("Protocol error") ||
      error.message.includes("Session closed")
    ) {
      await closeBrowser();
    }

    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Analiza el HTML y extrae los resultados de búsqueda de Google.
 * @param {string} html - El contenido HTML del div #main.
 * @returns {Array<Object>} - Lista de objetos con título, descripción y enlace.
 */
/**
 * Analiza el HTML y extrae los resultados de búsqueda de Google sin depender de clases CSS específicas.
 * @param {string} html - El contenido HTML del div #main.
 * @returns {Array<Object>} - Lista de objetos con título, descripción y enlace.
 */
function parseGoogleResults(htmlContent) {
  const $ = cheerio.load(htmlContent);

  // Eliminar imágenes en base64
  $("img").each((index, element) => {
    const src = $(element).attr("src");
    if (src && src.startsWith("data:image")) {
      $(element).remove();
    }
  });

  // Eliminar atributos de clase
  $("[class]").removeAttr("class");

  // Eliminar elementos y atributos de estilo CSS
  $("style").remove();
  $("[style]").removeAttr("style");

  // Devolver el HTML limpio como cadena
  return $.html();
}

/**
 * Visita una URL y obtiene el contenido del cuerpo o de un selector CSS específico.
 * @param {string} url - La URL a visitar.
 * @param {string} [cssSelector] - Selector CSS opcional para extraer contenido específico.
 * @returns {Promise<string>} - El contenido extraído de la página.
 */
async function visitWebsiteUrl(url, cssSelector, multiple = false) {
  await initBrowser();

  let page;
  try {
    page = await browserInstance.newPage();

    await page.goto(url, { waitUntil: "networkidle2" });

    let content;
    if (cssSelector) {
      // Esperar a que al menos un elemento que coincida con el selector esté disponible
      await page.waitForSelector(cssSelector, { timeout: 5000 });

      if (multiple) {
        // Obtener todos los elementos que coinciden con el selector
        content = await page.evaluate((selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map((el) => el.innerHTML);
        }, cssSelector);
      } else {
        // Obtener solo el primer elemento que coincide con el selector
        content = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          return element ? element.innerHTML : null;
        }, cssSelector);
      }
    } else {
      // Obtener el contenido del body
      content = await page.evaluate(() => document.body.innerHTML);
    }

    return content;
  } catch (error) {
    console.error("Error en visitWebsiteUrl:", error);

    // Si el error es debido a la desconexión del navegador, reiniciarlo
    if (
      error.message.includes("Protocol error") ||
      error.message.includes("Session closed")
    ) {
      await closeBrowser();
    }

    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

module.exports = {
  queryGoogle,
  visitWebsiteUrl,
  closeBrowser,
};
