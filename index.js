const fs = require("fs");
const puppeteer = require("puppeteer");

const dataDir = process.env.DATA_DIR || "./data";
console.log(`Data directory set to: ${dataDir}`);

const runForURL = async (url) => {
  console.log(`Initializing browser for URL: ${url}`);
  const browser = await puppeteer.launch({
    headless: false,
  });
  console.log(`Browser launched for URL: ${url}`);
  const page = await browser.newPage();

  try {
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url);
    console.log(`Waiting for selector at URL: ${url}`);
    await page.waitForSelector(".search-result a");
    console.log(`Selector found at URL: ${url}`);

    await page._client().send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: dataDir,
    });

    await page.exposeFunction("fileExists", (f) => {
      const exists = fs.existsSync(`${dataDir}/${f}`);
      console.log(
        `File check for ${f}: ${exists ? "Exists" : "Does not exist"}`
      );
      return exists;
    });

    const resultsSelector = ".search-result a";
    const links = (
      await page.evaluate((resultsSelector) => {
        return [...document.querySelectorAll(resultsSelector)].map(
          async (anchor) => {
            const segments = anchor.href.split("/");
            const filename = segments[segments.length - 1];
            if (
              !(await window.fileExists(filename)) &&
              (anchor.href.startsWith(
                "http://www.corteidh.or.cr/docs/casos/articulos/seriec_"
              ) ||
                anchor.href.startsWith(
                  "http://www.corteidh.or.cr/docs/opiniones/seriea_"
                ) ||
                anchor.href.startsWith(
                  "https://www.corteidh.or.cr/docs/opiniones/seriea_"
                )) &&
              anchor.href.endsWith("_esp.pdf")
            ) {
              console.log(`Downloading file: ${filename}`);
              anchor.setAttribute("download", filename);
              anchor.click();
              return filename;
            }
          }
        );
      }, resultsSelector)
    ).filter((x) => !!x);

    console.log(`Initiating wait for downloads to finish for URL: ${url}`);
    await page.waitForTimeout(20000);
    console.log(`Wait completed for URL: ${url}`);

    await browser.close();
    console.log(`Browser closed for URL: ${url}`);
  } catch (e) {
    console.error(`Error processing URL: ${url}`, e);
    await page.screenshot({
      path: `failed_${url.replace(/[^a-z0-9]/gi, "_")}.jpg`,
    });
    throw e;
  }
};

(async () => {
  console.log("Crawler process initiated");
  await Promise.all([
    runForURL("https://www.corteidh.or.cr/casos_sentencias.cfm"),
    runForURL("https://www.corteidh.or.cr/opiniones_consultivas.cfm"),
  ]);
  console.log("Crawler process completed");
})();
