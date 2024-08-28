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
 * If the file is an HTML file, it will be processed with Puppeteer to get the compiled HTML.
 * @param {string} fileURL - The URL of the file to download.
 * @param {string} outputPath - The path where the file will be saved.
 * @returns {Promise<void>} A promise that resolves when the download is complete.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise(async (resolve, reject) => {
    // Check if the URL contains 'htm' to determine if it's an HTML file
    if (fileURL.includes("htm")) {
      try {
        // Launch Puppeteer and load the page
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(fileURL, { waitUntil: "networkidle0" });

        // Get the compiled HTML
        const compiledHTML = await page.content();

        // Save the compiled HTML to the output path with UTF-8 encoding
        fs.writeFileSync(outputPath, compiledHTML, { encoding: "utf8" });
        console.log(`Compiled HTML saved to ${outputPath} with UTF-8 encoding`);

        // Close Puppeteer
        await browser.close();

        resolve(); // Resolve the promise after saving the file
      } catch (error) {
        console.error(`Failed to process HTML file: ${error.message}`);
        reject(error); // Reject the promise if an error occurs
      }
    } else {
      // If not an HTML file, proceed with the normal download
      const file = fs.createWriteStream(outputPath);
      const protocol = fileURL.startsWith("https") ? https : http;
      protocol
        .get(fileURL, (response) => {
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve); // Resolve the promise after the file is downloaded
          });
        })
        .on("error", (error) => {
          fs.unlink(outputPath); // Delete the file asynchronously on error
          reject(error); // Reject the promise if an error occurs
        });
    }
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

/**
 * Processes and downloads a file if it doesn't already exist.
 * @param {object} result - The puppeteer element handle.
 * @param {string} outputDir - The directory where the file will be downloaded.
 */
let caseMapping = {};

async function processAndDownloadFile(result, outputDir) {
  try {
    const caseName = await result.evaluate((el) => el.innerText.trim());

    let fileLink;
    try {
      fileLink = await result.$eval("a", (a) => a.href).catch(() => null);
    } catch (error) {
      fileLink = null;
    }

    if (!fileLink) {
      console.log("No file link found, skipping...");

      caseMapping["_ERROR_ " + caseName] = caseName;

      return;
    }

    const fileName = getFileNameFromURL(fileLink);
    const outputPath = path.join(outputDir, fileName);

    // Guardar el mapeo de URL a nombre del caso completo
    caseMapping[fileName] = caseName;

    if (!fileExists(outputPath)) {
      console.log(`Downloading: ${fileName}`);
      await downloadFile(fileLink, outputPath);
      console.log(`Downloaded: ${fileName}`);
    } else {
      console.log(`File already exists, skipped download: ${fileName}`);
    }
  } catch (error) {
    console.error("Error processing file:", error);
  }
}

/**
 * Scrapes a website, downloads, and saves files.
 * @param {string} url - The URL of the website to scrape.
 * @param {string} baseDir - The base directory to save downloaded files.
 */
async function scrapeWebsite(url, baseDir) {
  createDirectory(baseDir);

  console.log(`Launching browser for ${url}...`);
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  console.log(`Navigating to ${url}...`);
  await page.goto(url);
  console.log("Waiting for content to load...");
  await page.waitForSelector("#rightmaincol");

  const searchResults = await page.$$("#rightmaincol ul li");
  console.log(
    `Found ${searchResults.length} search results at ${url}. Processing...`
  );

  await Promise.all(
    searchResults.map((result) => processAndDownloadFile(result, baseDir))
  );

  console.log("Closing browser...");
  await browser.close();
  console.log(`Finished scraping ${url}.`);
}

(async () => {
  const currentYear = new Date().getFullYear();

  for (let year = 1973; year <= currentYear; year++) {
    const url = `https://www.oas.org/es/cidh/decisiones/pc/fondos.asp?Year=${year}`;
    const outputDir = `./data_cidh/informes_fondo/${year}`;

    await scrapeWebsite(url, outputDir);

    // Guardar el mapeo en un archivo JSON después de procesar todos los casos
    createDirectory(`./data_cidh/informes_fondo/case_mapping`);

    fs.writeFileSync(
      `./data_cidh/informes_fondo/case_mapping/case_mapping_year_${year}.json`,
      JSON.stringify(caseMapping, null, 2),
      "utf-8"
    );
    caseMapping = {};
  }
})();
