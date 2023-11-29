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

/**
 * Processes and downloads a file if it doesn't already exist.
 * @param {object} result - The puppeteer element handle.
 * @param {string} fileExtension - The file extension to download.
 * @param {string} selector - The selector to find the download link.
 * @param {string} outputDir - The directory where the file will be downloaded.
 */
async function processAndDownloadFile(
  result,
  fileExtension,
  selector,
  outputDir
) {
  const fileLink = await result.$eval(selector, (a) => a.href);
  const fileName = getFileNameFromURL(fileLink);
  const outputPath = path.join(outputDir, fileName);

  if (!fileExists(outputPath)) {
    console.log(`Downloading ${fileExtension.toUpperCase()}: ${fileName}`);
    await downloadFile(fileLink, outputPath);
    console.log(`Downloaded: ${fileName}`);
  } else {
    console.log(
      `${fileExtension.toUpperCase()} already exists, skipped download: ${fileName}`
    );
  }
}

/**
 * Scrapes a website, downloads, and saves PDF and DOC files.
 * @param {string} url - The URL of the website to scrape.
 * @param {string} baseDir - The base directory to save downloaded files.
 */
async function scrapeWebsite(url, baseDir) {
  const pdfDir = path.join(baseDir, "pdf");
  const docDir = path.join(baseDir, "doc");

  // Create PDF and DOC directories
  createDirectory(pdfDir);
  createDirectory(docDir);

  console.log(`Launching browser for ${url}...`);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log(`Navigating to ${url}...`);
  await page.goto(url);
  console.log("Waiting for content to load...");
  await page.waitForSelector("ul#ul_datos");
  await page.waitForSelector("li.tr_normal.search-result.row");

  const searchResults = await page.$$("li.tr_normal.search-result.row");
  console.log(
    `Found ${searchResults.length} search results at ${url}. Processing...`
  );

  for (const result of searchResults) {
    await processAndDownloadFile(
      result,
      "pdf",
      'tr:first-child a[href$=".pdf"]',
      pdfDir
    );
    await processAndDownloadFile(
      result,
      "doc",
      'tr:first-child a[href$=".doc"], tr:first-child a[href$=".docx"]',
      docDir
    );
  }

  console.log("Closing browser...");
  await browser.close();
  console.log(`Finished scraping ${url}.`);
}

(async () => {
  await scrapeWebsite(
    "https://www.corteidh.or.cr/opiniones_consultivas.cfm",
    "./data/opiniones_consultivas"
  );
  await scrapeWebsite(
    "https://www.corteidh.or.cr/casos_sentencias.cfm",
    "./data/casos_sentencias"
  );
})();
