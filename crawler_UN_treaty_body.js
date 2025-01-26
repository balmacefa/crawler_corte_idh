const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

/**
 * Creates a directory if it does not already exist.
 * @param {string} dir - The path of the directory to be created.
 */
function createDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  } else {
    console.log(`Directory already exists: ${dir}`);
  }
}

/**
 * Extracts the file name from a URL.
 * @param {string} url - The URL from which to extract the file name.
 * @returns {string} The extracted file name.
 */
function getFileNameFromURL(url) {
  return url.split("/").pop();
}

/**
 * Downloads a file from a given URL and saves it to a specified path.
 * @param {string} fileURL - The URL of the file to download.
 * @param {string} outputPath - The path where the file will be saved.
 * @returns {Promise<void>} A promise that resolves when the download is complete.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise((resolve, reject) => {
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
        fs.unlink(outputPath); // Delete the file asynchronously on error
        reject(error);
      });
  });
}

/**
 * Checks if a file exists at a given path.
 * @param {string} filePath - The path of the file to check.
 * @returns {boolean} True if the file exists, false otherwise.
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

async function handleViewDocumentPage(url, baseDir) {
  //
}

/**
 * Scrapes a website, downloads, and saves PDF and DOC files.
 * @param {string} url - The URL of the website to scrape.
 * @param {string} baseDir - The base directory to save downloaded files.
 */
async function scrapeWebsite(url, baseDir) {
  try {
    const pdfDir = path.join(baseDir, "pdf");

    // Create PDF and DOC directories
    createDirectory(pdfDir);
    createDirectory(docDir);

    console.log(`Launching browser for ${url}...`);
    // const browser = await puppeteer.launch();

    // const caps = {
    //   browser: "chrome", // You can choose `chrome`, `edge` or `firefox` in this capability
    //   browser_version: "latest", // We support v83 and above. You can choose `latest`, `latest-beta`, `latest-1`, `latest-2` and so on, in this capability
    //   os: "os x",
    //   os_version: "big sur",
    //   build: "puppeteer-build-1",
    //   name: "My first Puppeteer test", // The name of your test and build. See browserstack.com/docs/automate/puppeteer/organize tests for more details
    //   "browserstack.username":
    //     process.env.BROWSERSTACK_USERNAME || "fabianbalmaceda_eDsvb6",
    //   "browserstack.accessKey":
    //     process.env.BROWSERSTACK_ACCESS_KEY || "A4LaJEd5DMxdCrQBB7m1",
    //   headless: false, // Set to false to see the browser UI
    // };
    // const browser = await puppeteer.connect({
    //   browserWSEndpoint: `wss://cdp.browserstack.com/puppeteer?caps=${encodeURIComponent(
    //     JSON.stringify(caps)
    //   )}`, // The BrowserStack CDP endpoint gives you a `browser` instance based on the `caps` that you specified
    // });

    const browser = await puppeteer.launch({
      headless: false, // Launches a visible browser window
      args: ["--start-maximized"], // Optional: Starts the browser maximized
      defaultViewport: null, // Ensures the viewport matches the browser window size
      // You can add other launch options as needed
    });

    const page = await browser.newPage();
    console.log(`Navigating to ${url}...`);
    await page.goto(url);
    console.log("Waiting for content to load...");

    const selectorInput = 'input[value="10"]';
    await page.waitForSelector(selectorInput, { visible: true, timeout: 5000 });

    await page.click(selectorInput);

    await page.waitForTimeout(500); // Espera 500 ms

    // /////////////////////////////////////////////////////////////////////////////////////////////////////
    // 7. Hacer clic en el elemento <li> con el texto 'All'
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

    // 8. Esperar 500 milisegundos adicionales si es necesario
    console.log("Esperando 500 ms adicionales...");
    await page.waitForTimeout(500); // Espera 500 ms

    // /////////////////////////////////////////////////////////////////////////////////////////////////////

    // 4. Obtener todos los enlaces <a> con el texto 'View document'
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

      hrefs.forEach((href, index) => {
        //
        console.log(`${index + 1}: ${href}`);
      });

      // Opcional: Guardar en un archivo JSON
      // const fs = require('fs');
      // fs.writeFileSync('enlaces.json', JSON.stringify(hrefs, null, 2));
    } else {
      console.log(`No se encontraron enlaces <a> con el texto '${textoLink}'.`);
    }

    // /////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("Closing browser...");
    await browser.close();
    console.log(`Finished scraping ${url}.`);
  } catch (error) {
    console.error("error", error);
    console.error(error);
  }
}

(async () => {
  await scrapeWebsite(
    "https://tbinternet.ohchr.org/_layouts/15/TreatyBodyExternal/TBSearch.aspx?Lang=en&TreatyID=8&DocTypeID=11",
    "./data_crawler_UN_treaty_body"
  );
})();
