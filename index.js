const fs = require("fs");
const puppeteer = require("puppeteer");

const dataDir = process.env.DATA_DIR || "./data";
const runForURL = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url);
    await page.waitForSelector(".search-result a");

    await page._client().send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: dataDir,
    });

    await page.exposeFunction("fileExists", (f) =>
      fs.existsSync(`${dataDir}/${f}`)
    );
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
              anchor.setAttribute("download", filename);
              anchor.click();
              return filename;
            }
          }
        );
      }, resultsSelector)
    ).filter((x) => !!x);

    // Wait for downloads to finish an arbitrary amount of time, I couldn't find
    // any callback.
    await page.waitForTimeout(20000);

    await browser.close();
  } catch (e) {
    await page.screenshot({
      path: "failed.jpg",
    });
    throw e;
  }
};

(async () => {
  await Promise.all([
    runForURL("https://www.corteidh.or.cr/casos_sentencias.cfm"),
    runForURL("https://www.corteidh.or.cr/opiniones_consultivas.cfm"),
  ]);
})();
