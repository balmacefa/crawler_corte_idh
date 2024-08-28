// http://localhost:3000/api/archivo_documentos/66cf963461a35117362ab8da?depth=1&draft=false&locale=undefined

// -
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

// Ruta al archivo que quieres subir
const filePath =
  "D:\\iiresodh\\crawler_corte_idh\\data\\casos_sentencias\\converted docxs\\seriec_01_esp.docx";

// Todo: loop the converted docxs folder and send the file, use filename as the tile, empty th othr filds

// Datos para la colección B (ArchivoDocumento)
const archivoDocumentoData = {
  title: "seriec_01_esp",
  source_org: "Corte IDH",
  document_type: "html_docx", // Puede ser 'pdf', 'html_text', o 'html_docx'
};

// Crea una instancia de FormData
const form = new FormData();

// Agrega los campos del documento a la colección B (ArchivoDocumento)
for (const key in archivoDocumentoData) {
  form.append(key, archivoDocumentoData[key]);
}

// Agrega el archivo al formulario, relacionándolo con el campo `media_file`
form.append("media_file[file]", fs.createReadStream(filePath));

// Envía la solicitud HTTP
console.log("sending form native API :)");

try {
  fetch("http://localhost:3000/api/archivo_documentos", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(archivoDocumentoData),
  })
    .then((response) => console.log(response))
    .catch((error) => {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message
      );
    });
} catch (err) {
  console.log(err);
}
