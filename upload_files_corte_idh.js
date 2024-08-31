const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

// Ruta al archivo que quieres subir
const filePath =
  "D:\\iiresodh\\crawler_corte_idh\\data\\casos_sentencias\\converted docxs\\seriec_01_esp.docx";
const fileName = path.basename(filePath, ".docx");

// Datos para la colección B (ArchivoDocumento)
const archivoDocumentoData = {
  title: fileName,
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
form.append("media_file", fs.createReadStream(filePath));

const options = {
  method: "POST",
  body: form,
  // If you add this, upload won't work
  headers: {
    "Content-Type": "multipart/form-data",
  },
};

// delete options.headers["Content-Type"];

// Envía la solicitud HTTP usando fetch
fetch("http://localhost:3000/api/archivo_documentos", options)
  .then((response) => {
    if (response.ok) {
      return response.json();
    }
    throw new Error(`Error en la solicitud: ${response.statusText}`);
  })
  .then((data) => {
    console.log("Respuesta del servidor:", data);
  })
  .catch((error) => {
    console.error("Error:", error.message);
  });
