const mammoth = require("mammoth");
const fs = require("fs").promises; // Import the promises API of the fs module

async function parser_docs(file_path, outputFilePath) {
  try {
    const result = await mammoth.convertToHtml({ path: file_path });
    console.log(result.messages);
    const html = result.value;

    // Save the html to a file
    await fs.writeFile(outputFilePath, html, "utf8");
    console.log("HTML saved to", outputFilePath);
  } catch (error) {
    console.error("----------------------error----------------------");
    console.error(error);
  }
}

// Use the function
(async () => {
  await parser_docs(
    "./data/opiniones_consultivas/doc/seriea_23_esp.docx",
    "./output/converted_html/seriea_01_esp1.html"
  );
})();
