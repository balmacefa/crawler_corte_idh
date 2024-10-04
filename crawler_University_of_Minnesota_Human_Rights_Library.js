// Web crawler for -> University of Minnesota Human Rights Library
// Instrumentos Internacionales de Derechos Humanos
// The caseMapping should contain objects with the download URL, document title, and category.
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

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
 * Generates a SHA256 hash of the URL to use as a file name.
 * @param {string} url - The URL to hash.
 * @returns {string} The SHA256 hash of the URL.
 */
function getFileNameFromURL(url) {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * Downloads a file from a given URL and saves it to a specified path.
 * If the file is an HTML file, it will be processed with Puppeteer to get the compiled HTML
 * and save it as a PDF.
 * @param {string} fileURL - The URL of the file to download.
 * @param {string} outputPath - The path where the file will be saved.
 * @returns {Promise<void>} A promise that resolves when the download is complete.
 */
function downloadFile(fileURL, outputPath) {
  return new Promise(async (resolve, reject) => {
    if (fileURL.includes("htm")) {
      try {
        // Launch Puppeteer and load the page
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(fileURL, { waitUntil: "networkidle0" });

        // Modify output path to save as PDF
        const pdfOutputPath = outputPath + ".pdf";

        // Save the page as PDF with margins
        await page.pdf({
          path: pdfOutputPath,
          format: "A4",
          margin: {
            top: "20mm",
            right: "20mm",
            bottom: "20mm",
            left: "20mm",
          },
          printBackground: true, // Ensure backgrounds are printed
        });
        console.log(`HTML page saved as PDF with margins to ${pdfOutputPath}`);

        // Close Puppeteer
        await browser.close();

        resolve();
      } catch (error) {
        console.error(`Failed to process HTML file: ${error.message}`);
        reject(error);
      }
    } else {
      // If not an HTML file, proceed with the normal download
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
          fs.unlink(outputPath, () => {}); // Delete the file asynchronously on error
          reject(error);
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
 * @param {object} tr - The table row element handle.
 * @param {string} outputDir - The directory where the file will be downloaded.
 * @param {string} category - The category of the document.
 */
let caseMapping = {};
let failedCaseMapping = {};

async function processAndDownloadFile(tr, outputDir, category) {
  try {
    const td = await tr.$("td");
    if (!td) {
      console.log("No td found, skipping...");
      return;
    }

    // Extract the first 'a' tag (Spanish link)
    const aTags = await td.$$("a");
    if (aTags.length === 0) {
      console.log("No a tags found in td, skipping...");
      return;
    }

    const aTag = aTags[0]; // We only need the first 'a' tag (Spanish link)
    const fileLink = await (await aTag.getProperty("href")).jsonValue();

    // Extract the title (text of the 'a' tag and the text following it)
    const title = await td.evaluate((el) => {
      const a = el.querySelector("a");
      let text = "";
      if (a) {
        let titleText = a.innerText;
        let currentNode = a.nextSibling;
        while (currentNode) {
          if (currentNode.nodeType === Node.TEXT_NODE) {
            text += currentNode.textContent;
          } else if (
            currentNode.nodeType === Node.ELEMENT_NODE &&
            currentNode.tagName === "BR"
          ) {
            // Ignore <br> tags
          } else {
            break; // Stop if another element is found
          }
          currentNode = currentNode.nextSibling;
        }
        text = text.trim();
        return titleText + " " + text;
      } else {
        return "";
      }
    });

    if (!fileLink || !title) {
      console.log("No file link or title found, skipping...");
      return;
    }

    const fileName = getFileNameFromURL(fileLink);
    const extension = path.extname(new URL(fileLink).pathname);
    const outputPath = path.join(outputDir, fileName + extension);

    // Save the mapping
    caseMapping[fileName + extension] = {
      url: fileLink,
      title: title,
      category: category,
    };

    // Check if file exists
    if (!fileExists(outputPath)) {
      console.log(`Downloading: ${fileName + extension}`);
      await downloadFile(fileLink, outputPath);
      console.log(`Downloaded: ${fileName + extension}`);
    } else {
      console.log(
        `File already exists, skipped download: ${fileName + extension}`
      );
    }
  } catch (error) {
    console.error("Error processing file:", error);

    // Save the failed case mapping
    const fileName = getFileNameFromURL(error.fileLink || "unknown");
    failedCaseMapping[fileName] = {
      url: error.fileLink || "unknown",
      title: error.title || "unknown",
      category: error.category || "unknown",
      error: error.message,
    };
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
  await page.waitForSelector("body");

  // Get all the tables
  const tables = await page.$$("table");

  console.log(`Found ${tables.length} tables at ${url}. Processing...`);

  for (const table of tables) {
    // Get the category from the thead
    const categoryElement = await table.$("thead th span strong");
    let category = "";
    if (categoryElement) {
      category = await (
        await categoryElement.getProperty("innerText")
      ).jsonValue();
      category = category.trim();
    } else {
      console.log("No category found for a table");
      category = "Unknown Category";
    }
    console.log(`Processing category: ${category}`);

    // Now process the tbody trs
    const trs = await table.$$("tbody tr");
    console.log(`Found ${trs.length} trs in category: ${category}`);

    for (const tr of trs) {
      await processAndDownloadFile(tr, baseDir, category);
    }
  }

  console.log("Closing browser...");
  await browser.close();
  console.log(`Finished scraping ${url}.`);
}

(async () => {
  const url = `http://hrlibrary.umn.edu/instree/Sainstls1.htm`;

  const outputDir = `./data_crawler_University_of_Minnesota_Human_Rights_Library`;

  await scrapeWebsite(url, outputDir);

  // Save the successful mappings to a JSON file after processing all cases
  const mappingOutputPath = path.join(outputDir, "case_mapping_success.json");
  fs.writeFileSync(
    mappingOutputPath,
    JSON.stringify(caseMapping, null, 2),
    "utf-8"
  );
  console.log(`Case mapping saved to ${mappingOutputPath}`);

  // Save the failed mappings to a separate JSON file
  const failedMappingOutputPath = path.join(
    outputDir,
    "case_mapping_failed.json"
  );
  fs.writeFileSync(
    failedMappingOutputPath,
    JSON.stringify(failedCaseMapping, null, 2),
    "utf-8"
  );
  console.log(`Failed case mapping saved to ${failedMappingOutputPath}`);

  caseMapping = {};
  failedCaseMapping = {};
})();
