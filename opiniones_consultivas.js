const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const baseDir = "./data";
const pdfDir = path.join(baseDir, "pdf");
const docDir = path.join(baseDir, "doc");

// Ensure PDF and DOC directories exist
[baseDir, pdfDir, docDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  } else {
    console.log(`Directory already exists: ${dir}`);
  }
});

function getFileNameFromURL(url) {
  return url.split("/").pop();
}

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

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

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

const initial_url = "https://www.corteidh.or.cr/casos_sentencias.cfm";

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  console.log("Navigating to website...");
  await page.goto(initial_url);
  console.log("Waiting for content to load...");
  await page.waitForSelector("ul#ul_datos");
  await page.waitForSelector("li.tr_normal.search-result.row"); // Wait for at least one search result

  const searchResults = await page.$$("li.tr_normal.search-result.row");
  console.log(`Found ${searchResults.length} search results. Processing...`);

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
  console.log("Crawler finished.");
})();
